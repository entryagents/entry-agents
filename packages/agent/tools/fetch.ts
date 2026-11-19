import { lookup } from "node:dns/promises";
import { tool } from "ai";
import { z } from "zod";
import { getSandbox, shellEscape } from "./utils";
import {
  WEB_FETCH_BODY_DIR,
  buildWebFetchBodyFileName,
} from "./web-fetch-body";
import { getToolTimeoutMs } from "./tool-timeouts";
import {
  createSecretRedactor,
  isUrlAllowedForSecret,
  resolveSecretRecordTemplates,
  resolveSecretTemplates,
  type RuntimeSecret,
  type SecretRedactor,
} from "../lib/secret-redactor";

const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_BODY_LENGTH = 10_000;

type Ipv4Address = [number, number, number, number];
type Ipv6Address = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function normalizeHostname(hostname: string): string {
  const lowerHostname = hostname.toLowerCase();

  if (lowerHostname.startsWith("[") && lowerHostname.endsWith("]")) {
    return lowerHostname.slice(1, -1);
  }

  return lowerHostname;
}

function parseIpv4Address(hostname: string): Ipv4Address | null {
  const octets = hostname.split(".");

  if (octets.length !== 4) {
    return null;
  }

  const parsed: number[] = [];

  for (const octet of octets) {
    if (!/^\d+$/.test(octet)) {
      return null;
    }

    const value = Number(octet);
    if (value < 0 || value > 255) {
      return null;
    }

    parsed.push(value);
  }

  return [parsed[0] ?? 0, parsed[1] ?? 0, parsed[2] ?? 0, parsed[3] ?? 0];
}

/**
 * Rewrites a trailing embedded IPv4 dotted-quad (RFC 4291's standard
 * textual form for IPv4-mapped/compatible addresses, e.g.
 * "::ffff:192.168.1.1") into two plain hex groups ("::ffff:c0a8:101")
 * so the rest of this parser -- which only understands hex groups --
 * can handle it. Returns the input unchanged if there's no embedded
 * IPv4 tail to rewrite.
 *
 * SECURITY FIX (2026-08-27, pentest finding): without this, an
 * address like "::ffff:192.168.1.1" -- the form dns.lookup() and
 * `getent ahosts` actually hand back for IPv4-mapped IPv6 answers --
 * failed to parse as an IPv6 address at all (the dotted tail doesn't
 * match the hex-group regex below), so isPrivateIpv6Address silently
 * returned false instead of correctly resolving it to the (very
 * possibly private) mapped IPv4 address. A DNS answer in this form
 * sailed straight through every consumer of isPrivateHost/isAllowedWebUrl
 * (web_fetch tool, and the MCP self-serve server URL SSRF guard) as
 * "public" even when it mapped to 127.0.0.1, 192.168.x.x, etc.
 */
function rewriteEmbeddedIpv4Tail(hostname: string): string {
  const lastColon = hostname.lastIndexOf(":");
  if (lastColon === -1) {
    return hostname;
  }

  const tail = hostname.slice(lastColon + 1);
  if (!tail.includes(".")) {
    return hostname;
  }

  const octets = parseIpv4Address(tail);
  if (!octets) {
    return hostname;
  }

  const highGroup = ((octets[0] << 8) | octets[1]).toString(16);
  const lowGroup = ((octets[2] << 8) | octets[3]).toString(16);

  return `${hostname.slice(0, lastColon)}:${highGroup}:${lowGroup}`;
}

function parseIpv6Address(rawHostname: string): Ipv6Address | null {
  const hostname = rewriteEmbeddedIpv4Tail(rawHostname);
  const [head = "", tail = "", ...extra] = hostname.split("::");

  if (extra.length > 0) {
    return null;
  }

  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const missingParts = hostname.includes("::")
    ? 8 - headParts.length - tailParts.length
    : 0;

  if (missingParts < 0) {
    return null;
  }

  const parts = [
    ...headParts,
    ...Array.from({ length: missingParts }, () => "0"),
    ...tailParts,
  ];

  if (parts.length !== 8) {
    return null;
  }

  const parsed: number[] = [];

  for (const part of parts) {
    if (!/^[\da-f]{1,4}$/i.test(part)) {
      return null;
    }

    parsed.push(Number.parseInt(part, 16));
  }

  return [
    parsed[0] ?? 0,
    parsed[1] ?? 0,
    parsed[2] ?? 0,
    parsed[3] ?? 0,
    parsed[4] ?? 0,
    parsed[5] ?? 0,
    parsed[6] ?? 0,
    parsed[7] ?? 0,
  ];
}

function isPrivateIpv4Address(hostname: string): boolean {
  const octets = parseIpv4Address(hostname);

  if (!octets) {
    return false;
  }

  const [first, second, third] = octets;

  return (
    first === 0 || // 0.0.0.0/8 ("this host on this network")
    first === 10 || // 10.0.0.0/8 (RFC 1918)
    (first === 100 && second >= 64 && second <= 127) || // 100.64.0.0/10 (CGNAT, RFC 6598)
    first === 127 || // 127.0.0.0/8 (loopback)
    (first === 169 && second === 254) || // 169.254.0.0/16 (link-local / cloud metadata)
    (first === 172 && second >= 16 && second <= 31) || // 172.16.0.0/12 (RFC 1918)
    (first === 192 && second === 0 && third === 0) || // 192.0.0.0/24 (IETF protocol assignments)
    (first === 192 && second === 0 && third === 2) || // 192.0.2.0/24 (TEST-NET-1)
    (first === 192 && second === 88 && third === 99) || // 192.88.99.0/24 (deprecated 6to4 relay)
    (first === 192 && second === 168) || // 192.168.0.0/16 (RFC 1918)
    (first === 198 && (second === 18 || second === 19)) || // 198.18.0.0/15 (benchmarking)
    (first === 198 && second === 51 && third === 100) || // 198.51.100.0/24 (TEST-NET-2)
    (first === 203 && second === 0 && third === 113) || // 203.0.113.0/24 (TEST-NET-3)
    first >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  );
}

function getIpv4MappedIpv6Address(groups: Ipv6Address): string | null {
  const isMappedIpv4 =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;

  if (!isMappedIpv4) {
    return null;
  }

  return [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ].join(".");
}

function getIpv4CompatibleIpv6Address(groups: Ipv6Address): string | null {
  const isCompatibleIpv4 = groups.slice(0, 6).every((group) => group === 0);
  if (!isCompatibleIpv4) {
    return null;
  }
  if (groups[6] === 0 && groups[7] <= 1) {
    return null;
  }
  return [
    groups[6] >> 8,
    groups[6] & 0xff,
    groups[7] >> 8,
    groups[7] & 0xff,
  ].join(".");
}

function isPrivateIpv6Address(hostname: string): boolean {
  const groups = parseIpv6Address(hostname);

  if (!groups) {
    return false;
  }

  const ipv4MappedAddress = getIpv4MappedIpv6Address(groups);

  if (ipv4MappedAddress) {
    return isPrivateIpv4Address(ipv4MappedAddress);
  }

  const ipv4CompatibleAddress = getIpv4CompatibleIpv6Address(groups);
  if (ipv4CompatibleAddress && isPrivateIpv4Address(ipv4CompatibleAddress)) {
    return true;
  }

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback =
    groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
  const isUniqueLocal = (groups[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (groups[0] & 0xffc0) === 0xfe80;
  const isMulticast = (groups[0] & 0xff00) === 0xff00;
  const isDocumentation = groups[0] === 0x2001 && groups[1] === 0x0db8;
  const isDiscardOnly =
    groups[0] === 0x0100 && groups.slice(1, 4).every((group) => group === 0);

  return (
    isUnspecified ||
    isLoopback ||
    isUniqueLocal ||
    isLinkLocal ||
    isMulticast ||
    isDocumentation ||
    isDiscardOnly
  );
}

export function isPrivateHost(hostname: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);

  return (
    normalizedHostname === "localhost" ||
    isPrivateIpv4Address(normalizedHostname) ||
    isPrivateIpv6Address(normalizedHostname)
  );
}

export function isAllowedWebUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  return !isPrivateHost(parsed.hostname);
}

async function resolveAndValidateHostAddresses(params: {
  hostname: string;
  sandbox: Awaited<ReturnType<typeof getSandbox>>;
  workingDirectory: string;
  abortSignal?: AbortSignal;
}): Promise<{ isSafe: boolean; resolvedIps: string[] }> {
  if (isPrivateHost(params.hostname)) {
    return { isSafe: false, resolvedIps: [] };
  }

  if (parseIpv4Address(params.hostname) || parseIpv6Address(params.hostname)) {
    return { isSafe: true, resolvedIps: [params.hostname] };
  }

  const result = await params.sandbox.exec(
    `getent ahosts ${shellEscape(params.hostname)} | awk '{print $1}' | sort -u`,
    params.workingDirectory,
    5000,
    { signal: params.abortSignal },
  );

  if (!result.success) {
    return { isSafe: false, resolvedIps: [] };
  }

  const addresses = result.stdout
    .split("\n")
    .map((address) => address.trim())
    .filter(Boolean);

  if (addresses.length === 0 || addresses.some(isPrivateHost)) {
    return { isSafe: false, resolvedIps: [] };
  }

  return { isSafe: true, resolvedIps: addresses };
}

const fetchInputSchema = z.object({
  url: z
    .string()
    .url({ protocol: /^https?$/ })
    .refine(isAllowedWebUrl, "URL must use http(s) and a public host")
    .describe("The URL to fetch"),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    .optional()
    .describe("HTTP method. Default: GET"),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Optional HTTP headers as key-value pairs"),
  body: z
    .string()
    .optional()
    .describe("Optional request body (for POST/PUT/PATCH)"),
});

const fetchOutputSchema = z.union([
  z.object({
    success: z.literal(true),
    status: z.number().int().nullable(),
    body: z.string(),
    truncated: z.boolean(),
    // When the body was truncated, the FULL response is persisted to
    // this sandbox path (upstream #781 / PR #813) so the agent can
    // grep/read it instead of losing it or blowing up the context.
    savedTo: z.string().optional(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

const MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const REDIRECT_MARKER_PREFIX = "__WEB_FETCH_REDIR__:";

function stripCrossOriginAuthHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      lower === "authorization" ||
      lower === "cookie" ||
      lower === "proxy-authorization"
    ) {
      continue;
    }
    filtered[key] = value;
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

export const webFetchTool = tool({
  needsApproval: async (_args, { experimental_context }) => {
    const mode = (
      experimental_context as
        | { permissionMode?: "ask" | "autoAccept" | "fullAccess" }
        | undefined
    )?.permissionMode;
    // Unlike bash/read/write (which only gate genuinely dangerous
    // actions), every web_fetch needs approval in "ask" mode -- it's the
    // one truly blanket gate. "autoAccept" exists specifically to lift
    // this one, since it fires on every single outbound request and is
    // the noisiest gate by far; it still leaves dangerous bash and .env
    // access gated. "fullAccess" skips this too, obviously.
    return (mode ?? "ask") === "ask";
  },
  description: `Fetch a URL from the web.

USAGE:
- Make HTTP requests to external URLs
- Supports GET, POST, PUT, PATCH, DELETE, and HEAD methods
- Returns the response status and body text
- Body is truncated to ${MAX_BODY_LENGTH} characters to protect the context window
- When truncated, the FULL body is saved to a file and its path is returned in savedTo — use grep or read on that file for the rest instead of re-fetching

EXAMPLES:
- Simple GET: url: "https://api.example.com/data"
- POST with JSON: url: "https://api.example.com/items", method: "POST", headers: {"Content-Type": "application/json"}, body: "{\\\\"name\\\\":\\\\"item\\\\"}"`,
  inputSchema: fetchInputSchema,
  outputSchema: fetchOutputSchema,
  execute: async (
    { url, method = "GET", headers, body },
    { experimental_context, abortSignal },
  ) => {
    const secretCtx = (
      experimental_context && typeof experimental_context === "object"
        ? experimental_context
        : {}
    ) as {
      secrets?: RuntimeSecret[];
      secretRedactor?: SecretRedactor;
      onSecretUsed?: (names: string[]) => void;
    };
    const redactor =
      secretCtx.secretRedactor ?? createSecretRedactor(secretCtx.secrets);
    const redact = (value: string) =>
      redactor.hasSecrets() ? redactor.redact(value) : value;

    const usedSecretNamesSet = new Set<string>();
    const trackSecretUsed = (names: string[]) => {
      for (const name of names) usedSecretNamesSet.add(name);
    };

    const initialParsedUrl = new URL(url);
    let resolvedUrl = url;
    let resolvedHeaders = headers;
    let resolvedBody = body;

    try {
      resolvedUrl = resolveSecretTemplates(url, secretCtx.secrets, {
        targetUrl: url,
        targetHost: initialParsedUrl.hostname,
        onSecretUsed: trackSecretUsed,
      });
      const resolvedParsedUrl = new URL(resolvedUrl);
      resolvedHeaders = resolveSecretRecordTemplates(
        headers,
        secretCtx.secrets,
        {
          targetUrl: resolvedUrl,
          targetHost: resolvedParsedUrl.hostname,
          onSecretUsed: trackSecretUsed,
        },
      );
      if (body !== undefined) {
        resolvedBody = resolveSecretTemplates(body, secretCtx.secrets, {
          targetUrl: resolvedUrl,
          targetHost: resolvedParsedUrl.hostname,
          onSecretUsed: trackSecretUsed,
        });
      }
    } catch (error) {
      return {
        success: false,
        error: redact(error instanceof Error ? error.message : String(error)),
      };
    }

    const usedSecretNames = [...usedSecretNamesSet];
    if (usedSecretNames.length > 0 && secretCtx.onSecretUsed) {
      try {
        secretCtx.onSecretUsed(usedSecretNames);
      } catch {
        // Non-fatal telemetry callback
      }
    }

    // Configurable per-tool timeout (upstream #798):
    // TOOL_TIMEOUT_WEB_FETCH_MS overrides the 30s default.
    const timeoutMs = getToolTimeoutMs("web_fetch", DEFAULT_TIMEOUT_MS);

    const bodyFileName = buildWebFetchBodyFileName(url);
    const bodyFilePath = `${WEB_FETCH_BODY_DIR}/${bodyFileName}`;

    // When ANY secret template was resolved, execute strictly server-side via
    // Node fetch (never inside sandbox.exec("curl ...")!) so plaintext secret
    // values NEVER touch sandbox memory, process lists, or files, and so
    // redirect hops can be verified against every secret's URL lock.
    if (usedSecretNames.length > 0) {
      const usedSecrets = (secretCtx.secrets ?? []).filter((s) =>
        usedSecretNamesSet.has(s.name),
      );
      let serverUrl = resolvedUrl;
      let serverMethod = method;
      let serverHeaders = resolvedHeaders;
      let serverBody = resolvedBody;

      for (
        let redirectCount = 0;
        redirectCount <= MAX_REDIRECTS;
        redirectCount++
      ) {
        if (!isAllowedWebUrl(serverUrl)) {
          return {
            success: false,
            error: "Fetch failed: URL must use http(s) and a public host",
          };
        }

        const parsedServerUrl = new URL(serverUrl);
        if (
          !parseIpv4Address(parsedServerUrl.hostname) &&
          !parseIpv6Address(parsedServerUrl.hostname)
        ) {
          try {
            const dnsRecords = await lookup(parsedServerUrl.hostname, {
              all: true,
            });
            if (
              dnsRecords.length === 0 ||
              dnsRecords.some((rec) => isPrivateHost(rec.address))
            ) {
              return {
                success: false,
                error:
                  "Fetch failed: URL resolves to a private or internal host",
              };
            }
          } catch {
            return {
              success: false,
              error: redact(`Fetch failed: Unable to resolve host`),
            };
          }
        }

        const timeoutController = new AbortController();
        const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
        const combinedSignal = abortSignal
          ? AbortSignal.any([abortSignal, timeoutController.signal])
          : timeoutController.signal;

        try {
          const response = await fetch(serverUrl, {
            method: serverMethod,
            headers: serverHeaders,
            body:
              serverMethod !== "GET" &&
              serverMethod !== "HEAD" &&
              serverBody !== undefined
                ? serverBody
                : undefined,
            redirect: "manual",
            signal: combinedSignal,
          });

          if (REDIRECT_STATUS_CODES.has(response.status)) {
            const location = response.headers.get("location");
            if (!location) {
              return {
                success: false,
                error: "Fetch failed: Redirect missing Location header",
              };
            }
            if (redirectCount >= MAX_REDIRECTS) {
              return {
                success: false,
                error: "Fetch failed: Too many redirects",
              };
            }

            let nextUrl: string;
            try {
              nextUrl = new URL(location, serverUrl).toString();
            } catch {
              return {
                success: false,
                error: "Fetch failed: Invalid redirect URL",
              };
            }

            for (const usedSecret of usedSecrets) {
              if (
                usedSecret.allowedHosts &&
                usedSecret.allowedHosts.length > 0 &&
                !isUrlAllowedForSecret(nextUrl, usedSecret.allowedHosts)
              ) {
                return {
                  success: false,
                  error: redact(
                    `Secret "${usedSecret.name}" is restricted to (${usedSecret.allowedHosts.join(", ")}) and refused redirect to "${nextUrl}".`,
                  ),
                };
              }
            }

            const nextParsed = new URL(nextUrl);
            if (nextParsed.origin !== parsedServerUrl.origin) {
              serverHeaders = stripCrossOriginAuthHeaders(serverHeaders);
            }

            if (
              response.status === 303 ||
              ((response.status === 301 || response.status === 302) &&
                serverMethod !== "GET" &&
                serverMethod !== "HEAD")
            ) {
              serverMethod = "GET";
              serverBody = undefined;
            }

            serverUrl = nextUrl;
            continue;
          }

          const rawText = await response.text();
          const safeText = redact(rawText);
          const truncated = safeText.length > MAX_BODY_LENGTH;
          let savedPath: string | undefined;

          if (truncated) {
            try {
              const sandbox = await getSandbox(
                experimental_context,
                "web_fetch",
              );
              if (sandbox.writeFile) {
                await sandbox.writeFile(bodyFilePath, safeText, "utf-8");
                savedPath = bodyFilePath;
              }
            } catch {
              // Non-fatal if sandbox isn't booted when persisting large body
            }
          }

          return {
            success: true,
            status: response.status,
            body: truncated ? safeText.slice(0, MAX_BODY_LENGTH) : safeText,
            truncated,
            ...(savedPath ? { savedTo: savedPath } : {}),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: redact(`Fetch failed: ${message}`),
          };
        } finally {
          clearTimeout(timer);
        }
      }

      return {
        success: false,
        error: "Fetch failed: Too many redirects",
      };
    }

    const sandbox = await getSandbox(experimental_context, "web_fetch");
    const workingDirectory = sandbox.workingDirectory;

    // curl is not guaranteed on every sandbox base image (the boxd ubuntu
    // image ships neither curl nor wget), which used to make every
    // web_fetch call fail with "curl: command not found".
    //
    // The guard is a shell PREFIX on the fetch command itself rather than
    // extra sandbox.exec() round-trips. That matters: adding probe calls
    // would change the number and ordering of execs, and callers/tests
    // observe the exact command. Inlining keeps the fetch a single exec
    // while still self-healing when curl is missing (root-first apt-get,
    // sudo fallback -- the same pattern as the git guard in
    // packages/sandbox/boxd/connect.ts). When curl is already present
    // (the common case) the prefix is a cheap no-op.
    const ensureCurl = [
      "command -v curl >/dev/null 2>&1 || {",
      "  apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq curl >/dev/null 2>&1;",
      "  command -v curl >/dev/null 2>&1 ||",
      "    sudo -n apt-get update -qq >/dev/null 2>&1 && sudo -n apt-get install -y -qq curl >/dev/null 2>&1;",
      "};",
    ].join(" ");

    let currentUrl = resolvedUrl;
    let currentMethod = method;
    let currentHeaders = resolvedHeaders;
    let currentBody = resolvedBody;

    for (
      let redirectCount = 0;
      redirectCount <= MAX_REDIRECTS;
      redirectCount++
    ) {
      if (!isAllowedWebUrl(currentUrl)) {
        return {
          success: false,
          error: "Fetch failed: URL must use http(s) and a public host",
        };
      }

      const parsedUrl = new URL(currentUrl);
      const { isSafe, resolvedIps } = await resolveAndValidateHostAddresses({
        hostname: parsedUrl.hostname,
        sandbox,
        workingDirectory,
        abortSignal,
      });

      if (!isSafe || resolvedIps.length === 0) {
        return {
          success: false,
          error: "Fetch failed: URL resolves to a private or internal host",
        };
      }

      const port =
        parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");
      // Follow redirects explicitly in TS (not via `curl -L`) so every hop
      // undergoes URL scheme validation, private-IP blocking, DNS resolution,
      // and `--resolve` IP pinning before any packet is sent.
      const args: string[] = [
        "curl",
        "-sS",
        "--proto",
        shellEscape("=http,https"),
      ];

      for (const ip of resolvedIps) {
        args.push(
          "--resolve",
          shellEscape(`${parsedUrl.hostname}:${port}:${ip}`),
        );
      }

      args.push(
        "-X",
        currentMethod,
        "--max-time",
        String(Math.ceil(timeoutMs / 1000)),
        "-o",
        shellEscape(bodyFilePath),
        "-w",
        shellEscape("%{http_code}\t%{redirect_url}"),
      );

      if (currentHeaders) {
        for (const [key, value] of Object.entries(currentHeaders)) {
          args.push("-H", shellEscape(`${key}: ${value}`));
        }
      }

      if (currentMethod !== "GET" && currentMethod !== "HEAD" && currentBody) {
        args.push("-d", shellEscape(currentBody));
      }

      args.push(shellEscape(currentUrl));

      const command = [
        ensureCurl,
        `mkdir -p ${shellEscape(WEB_FETCH_BODY_DIR)}`,
        `meta=$(${args.join(" ")})`,
        "curlExit=$?",
        'status=$(printf "%s" "$meta" | cut -f1)',
        'redir=$(printf "%s" "$meta" | cut -f2-)',
        `size=$(wc -c < ${shellEscape(bodyFilePath)} 2>/dev/null || printf 0)`,
        `head -c ${MAX_BODY_LENGTH} ${shellEscape(bodyFilePath)}`,
        `if [ -n "$redir" ]; then printf '\\n${REDIRECT_MARKER_PREFIX}%s' "$redir"; fi`,
        "printf '\\n%s' \"$status\"",
        "printf '\\n%s' \"$size\"",
        "exit $curlExit",
      ].join("\n");

      try {
        const result = await sandbox.exec(
          command,
          workingDirectory,
          timeoutMs + 5_000,
          {
            signal: abortSignal,
          },
        );

        if (result.exitCode !== 0 && result.exitCode !== 23) {
          return {
            success: false,
            error: redact(
              `Fetch failed: ${result.stderr || result.stdout || "Unknown error"}`,
            ),
          };
        }

        const output = result.stdout ?? "";
        // Output shape: [preview body](\n__WEB_FETCH_REDIR__:url)?\n[status]\n[size]
        const lines = output.split("\n");
        const sizeText =
          lines.length >= 1 ? (lines[lines.length - 1] ?? "").trim() : "";
        const statusText =
          lines.length >= 2 ? (lines[lines.length - 2] ?? "").trim() : "";
        const maybeRedirLine =
          lines.length >= 3 ? (lines[lines.length - 3] ?? "") : "";
        const hasRedirMarker = maybeRedirLine.startsWith(
          REDIRECT_MARKER_PREFIX,
        );
        const redirectTarget = hasRedirMarker
          ? maybeRedirLine.slice(REDIRECT_MARKER_PREFIX.length).trim()
          : "";
        const bodyLinesEnd = hasRedirMarker ? -3 : -2;
        const responseBody =
          lines.length >= 2 ? lines.slice(0, bodyLinesEnd).join("\n") : output;
        const status = /^\d+$/.test(statusText)
          ? parseInt(statusText, 10)
          : null;

        if (
          status !== null &&
          REDIRECT_STATUS_CODES.has(status) &&
          redirectTarget.length > 0
        ) {
          if (redirectCount >= MAX_REDIRECTS) {
            return {
              success: false,
              error: "Fetch failed: Too many redirects",
            };
          }

          let nextUrl: string;
          try {
            nextUrl = new URL(redirectTarget, currentUrl).toString();
          } catch {
            return {
              success: false,
              error: "Fetch failed: Invalid redirect URL",
            };
          }

          const nextParsed = new URL(nextUrl);
          if (nextParsed.origin !== parsedUrl.origin) {
            currentHeaders = stripCrossOriginAuthHeaders(currentHeaders);
          }

          if (
            status === 303 ||
            ((status === 301 || status === 302) &&
              currentMethod !== "GET" &&
              currentMethod !== "HEAD")
          ) {
            currentMethod = "GET";
            currentBody = undefined;
          }

          currentUrl = nextUrl;
          continue;
        }

        const size = /^\d+$/.test(sizeText)
          ? parseInt(sizeText, 10)
          : responseBody.length;
        const truncated = result.exitCode === 23 || size > MAX_BODY_LENGTH;

        return {
          success: true,
          status,
          body: redact(responseBody),
          truncated,
          ...(truncated ? { savedTo: redact(bodyFilePath) } : {}),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: redact(`Fetch failed: ${message}`),
        };
      }
    }

    return {
      success: false,
      error: "Fetch failed: Too many redirects",
    };
  },
});
