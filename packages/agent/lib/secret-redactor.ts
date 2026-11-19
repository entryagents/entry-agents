export interface SecretCatalogEntry {
  name: string;
  description?: string;
  allowedHosts?: string[];
}

export interface RuntimeSecret extends SecretCatalogEntry {
  value: string;
  injectInSandbox?: boolean;
}

export interface SecretRedactor {
  redact: (text: string) => string;
  redactUnknown: <T>(value: T) => T;
  hasSecrets: () => boolean;
}

export class SecretTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretTemplateError";
  }
}

const MIN_REDACTABLE_SECRET_LENGTH = 4;
const MIN_FINGERPRINT_SECRET_LENGTH = 10;
const TEMPLATE_PATTERN = /\{\{SECRET:([A-Z][A-Z0-9_]{0,63})\}\}/g;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHost(host: string): string {
  const lower = host.trim().toLowerCase();
  if (lower.startsWith("[") && lower.endsWith("]")) {
    return lower.slice(1, -1);
  }
  return lower;
}

function normalizePort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === "https:") return "443";
  if (url.protocol === "http:") return "80";
  return "";
}

function normalizePathPrefix(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function matchesHostPattern(targetHost: string, ruleHost: string): boolean {
  const normalizedTarget = normalizeHost(targetHost);
  const normalizedRule = normalizeHost(ruleHost);
  if (!normalizedTarget || !normalizedRule) {
    return false;
  }
  if (normalizedRule === "*") {
    return true;
  }
  if (normalizedRule.startsWith("*.")) {
    const suffix = normalizedRule.slice(2);
    return (
      normalizedTarget === suffix || normalizedTarget.endsWith(`.${suffix}`)
    );
  }
  return normalizedTarget === normalizedRule;
}

/**
 * Validates whether a target URL or hostname matches a secret's allowed URL /
 * domain rules.
 *
 * Supported rule formats:
 * - Full URL (e.g. `https://api.stripe.com`, `https://api.stripe.com/v1`, `https://*.example.com:8443/api`):
 *   enforces scheme, hostname, port, and pathname prefix.
 * - Hostname or wildcard domain (e.g. `api.stripe.com`, `*.stripe.dev`):
 *   enforces hostname match.
 */
export function isUrlAllowedForSecret(
  targetUrlOrHost: string,
  allowedRules: readonly string[],
): boolean {
  if (allowedRules.length === 0) {
    return true;
  }

  const trimmedTarget = targetUrlOrHost.trim();
  if (!trimmedTarget) {
    return false;
  }

  let parsedTarget: URL | null = null;
  if (trimmedTarget.includes("://")) {
    try {
      parsedTarget = new URL(trimmedTarget);
    } catch {
      return false;
    }
  }
  const targetHost = parsedTarget ? parsedTarget.hostname : trimmedTarget;

  for (const rawRule of allowedRules) {
    const rule = rawRule.trim();
    if (!rule) continue;

    if (rule.includes("://")) {
      let parsedRule: URL;
      try {
        parsedRule = new URL(rule);
      } catch {
        continue;
      }

      if (!parsedTarget) {
        continue;
      }
      if (parsedTarget.protocol !== parsedRule.protocol) {
        continue;
      }
      if (!matchesHostPattern(parsedTarget.hostname, parsedRule.hostname)) {
        continue;
      }
      if (normalizePort(parsedTarget) !== normalizePort(parsedRule)) {
        continue;
      }
      const rulePrefix = normalizePathPrefix(parsedRule.pathname);
      if (rulePrefix !== "/") {
        const targetPath = normalizePathPrefix(parsedTarget.pathname);
        if (
          targetPath !== rulePrefix &&
          !targetPath.startsWith(`${rulePrefix}/`)
        ) {
          continue;
        }
      }
      return true;
    }

    if (matchesHostPattern(targetHost, rule)) {
      return true;
    }
  }

  return false;
}

export function isHostAllowedForSecret(
  targetHost: string,
  allowedHosts: readonly string[],
): boolean {
  return isUrlAllowedForSecret(targetHost, allowedHosts);
}

interface SecretFingerprint {
  name: string;
  alnum: string;
  reversedAlnum: string;
}

function buildSplitLineLeakRegex(alnum: string): RegExp {
  // Matches the secret's alphanumeric characters separated by up to 4
  // arbitrary punctuation/whitespace characters (catches e.g. `s k _ l i v e`,
  // `s-k-l-i-v-e`, `s\nk\nl\ni\nv\ne`, etc.).
  const parts = alnum.split("").map((ch) => escapeRegex(ch));
  return new RegExp(parts.join("[^a-zA-Z0-9]{0,4}"), "g");
}

export function createSecretRedactor(
  secrets: readonly RuntimeSecret[] | undefined,
): SecretRedactor {
  const candidates: Array<{ needle: string; replacement: string }> = [];
  const seenNeedles = new Set<string>();
  const fingerprints: Array<SecretFingerprint & { splitRegexes: RegExp[] }> =
    [];

  for (const secret of secrets ?? []) {
    if (!secret.value || secret.value.length < MIN_REDACTABLE_SECRET_LENGTH) {
      continue;
    }
    const replacement = `[REDACTED:${secret.name}]`;
    const variants = [secret.value];

    const reversed = secret.value.split("").toReversed().join("");
    if (reversed !== secret.value) {
      variants.push(reversed);
    }

    try {
      const urlEncoded = encodeURIComponent(secret.value);
      if (
        urlEncoded !== secret.value &&
        urlEncoded.length >= MIN_REDACTABLE_SECRET_LENGTH
      ) {
        variants.push(urlEncoded);
      }
      const uriEncoded = encodeURI(secret.value);
      if (
        uriEncoded !== secret.value &&
        uriEncoded.length >= MIN_REDACTABLE_SECRET_LENGTH
      ) {
        variants.push(uriEncoded);
      }
    } catch {
      // Ignore malformed URI sequences
    }

    try {
      const base64 = Buffer.from(secret.value, "utf8").toString("base64");
      if (base64.length >= 6) {
        variants.push(base64);
      }
      const base64Url = Buffer.from(secret.value, "utf8").toString("base64url");
      if (base64Url.length >= 6) {
        variants.push(base64Url);
      }
      const hexLower = Buffer.from(secret.value, "utf8").toString("hex");
      if (hexLower.length >= 8) {
        variants.push(hexLower, hexLower.toUpperCase());
      }
    } catch {
      // Ignore environments without Buffer
    }

    const jsonInner = JSON.stringify(secret.value).slice(1, -1);
    if (
      jsonInner !== secret.value &&
      jsonInner.length >= MIN_REDACTABLE_SECRET_LENGTH
    ) {
      variants.push(jsonInner);
    }

    for (const variant of variants) {
      if (!seenNeedles.has(variant)) {
        seenNeedles.add(variant);
        candidates.push({ needle: variant, replacement });
      }
    }

    const alnum = secret.value.replace(/[^a-zA-Z0-9]/g, "");
    if (alnum.length >= MIN_FINGERPRINT_SECRET_LENGTH) {
      const reversedAlnum = alnum.split("").toReversed().join("");
      const splitRegexes = [buildSplitLineLeakRegex(alnum)];
      if (reversedAlnum !== alnum) {
        splitRegexes.push(buildSplitLineLeakRegex(reversedAlnum));
      }
      fingerprints.push({
        name: secret.name,
        alnum,
        reversedAlnum,
        splitRegexes,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      redact: (text) => text,
      redactUnknown: <T>(value: T) => value,
      hasSecrets: () => false,
    };
  }

  // Sort longest first so longer secret tokens win over shorter substrings.
  candidates.sort((a, b) => b.needle.length - a.needle.length);
  const replacementByNeedle = new Map(
    candidates.map((entry) => [entry.needle, entry.replacement]),
  );
  const combinedRegex = new RegExp(
    candidates.map((entry) => escapeRegex(entry.needle)).join("|"),
    "g",
  );

  const redact = (text: string): string => {
    if (!text) return text;
    let out = text.replace(combinedRegex, (match) => {
      return replacementByNeedle.get(match) ?? "[REDACTED_SECRET]";
    });

    if (fingerprints.length > 0) {
      const stripped = out.replace(/[^a-zA-Z0-9]/g, "");
      for (const fp of fingerprints) {
        if (
          stripped.includes(fp.alnum) ||
          stripped.includes(fp.reversedAlnum)
        ) {
          for (const regex of fp.splitRegexes) {
            out = out.replace(regex, `[REDACTED:${fp.name}]`);
          }
          // Fallback: if arbitrary separators > 4 chars were inserted (e.g.
          // multi-line comments or padding), block the full output safely.
          const afterStripped = out.replace(/[^a-zA-Z0-9]/g, "");
          if (
            afterStripped.includes(fp.alnum) ||
            afterStripped.includes(fp.reversedAlnum)
          ) {
            return `[REDACTED:${fp.name}:POTENTIAL_EXFILTRATION_BLOCKED]`;
          }
        }
      }
    }

    return out;
  };

  const redactUnknown = <T>(value: T): T => {
    if (typeof value === "string") {
      return redact(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((item) => redactUnknown(item)) as T;
    }
    if (value && typeof value === "object") {
      if (value instanceof Date || value instanceof Error) {
        return value;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = redactUnknown(v);
      }
      return out as T;
    }
    return value;
  };

  return {
    redact,
    redactUnknown,
    hasSecrets: () => true,
  };
}

export function resolveSecretTemplates(
  input: string,
  secrets: readonly RuntimeSecret[] | undefined,
  options?: {
    targetUrl?: string;
    targetHost?: string;
    onSecretUsed?: (names: string[]) => void;
  },
): string {
  if (!input.includes("{{SECRET:")) {
    return input;
  }

  const secretByName = new Map<string, RuntimeSecret>();
  for (const s of secrets ?? []) {
    secretByName.set(s.name, s);
  }

  const usedNames = new Set<string>();
  const resolved = input.replace(TEMPLATE_PATTERN, (_full, name: string) => {
    const secret = secretByName.get(name);
    if (!secret) {
      throw new SecretTemplateError(
        `Secret "${name}" is not configured in Settings -> API keys.`,
      );
    }

    if (secret.allowedHosts && secret.allowedHosts.length > 0) {
      const target = options?.targetUrl ?? options?.targetHost;
      if (!target || !isUrlAllowedForSecret(target, secret.allowedHosts)) {
        throw new SecretTemplateError(
          `Secret "${name}" is restricted to allowed URL(s) (${secret.allowedHosts.join(", ")}) and cannot be sent to "${target ?? "unknown target"}".`,
        );
      }
    }

    usedNames.add(name);
    return secret.value;
  });

  if (usedNames.size > 0 && options?.onSecretUsed) {
    options.onSecretUsed([...usedNames]);
  }

  return resolved;
}

export function resolveSecretRecordTemplates(
  record: Record<string, string> | undefined,
  secrets: readonly RuntimeSecret[] | undefined,
  options?: {
    targetUrl?: string;
    targetHost?: string;
    onSecretUsed?: (names: string[]) => void;
  },
): Record<string, string> | undefined {
  if (!record) return undefined;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = resolveSecretTemplates(value, secrets, options);
  }
  return result;
}
