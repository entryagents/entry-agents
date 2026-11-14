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

const MIN_REDACTABLE_SECRET_LENGTH = 6;
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

export function isHostAllowedForSecret(
  targetHost: string,
  allowedHosts: readonly string[],
): boolean {
  if (allowedHosts.length === 0) {
    return true;
  }

  const normalizedTarget = normalizeHost(targetHost);
  if (!normalizedTarget) {
    return false;
  }

  for (const rawRule of allowedHosts) {
    const rule = normalizeHost(rawRule);
    if (!rule) continue;
    if (rule === "*") {
      return true;
    }
    if (rule.startsWith("*.")) {
      const suffix = rule.slice(2);
      if (
        normalizedTarget === suffix ||
        normalizedTarget.endsWith(`.${suffix}`)
      ) {
        return true;
      }
      continue;
    }
    if (normalizedTarget === rule) {
      return true;
    }
  }

  return false;
}

export function createSecretRedactor(
  secrets: readonly RuntimeSecret[] | undefined,
): SecretRedactor {
  const candidates: Array<{ needle: string; replacement: string }> = [];
  const seenNeedles = new Set<string>();

  for (const secret of secrets ?? []) {
    if (!secret.value || secret.value.length < MIN_REDACTABLE_SECRET_LENGTH) {
      continue;
    }
    const replacement = `[REDACTED:${secret.name}]`;
    const variants = [secret.value];

    try {
      const urlEncoded = encodeURIComponent(secret.value);
      if (
        urlEncoded !== secret.value &&
        urlEncoded.length >= MIN_REDACTABLE_SECRET_LENGTH
      ) {
        variants.push(urlEncoded);
      }
    } catch {
      // Ignore malformed URI sequences
    }

    try {
      const base64 = Buffer.from(secret.value, "utf8").toString("base64");
      if (base64.length >= 8) {
        variants.push(base64);
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
    return text.replace(combinedRegex, (match) => {
      return replacementByNeedle.get(match) ?? "[REDACTED_SECRET]";
    });
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
        `Secret "${name}" is not configured in Settings -> API Keys & Secrets.`,
      );
    }

    if (secret.allowedHosts && secret.allowedHosts.length > 0) {
      const host = options?.targetHost;
      if (!host || !isHostAllowedForSecret(host, secret.allowedHosts)) {
        throw new SecretTemplateError(
          `Secret "${name}" is restricted to allowed hosts (${secret.allowedHosts.join(", ")}) and cannot be sent to "${host ?? "unknown host"}".`,
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
