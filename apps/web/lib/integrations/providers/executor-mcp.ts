import { z } from "zod";

export const DEFAULT_EXECUTOR_MCP_URL = "https://mcp.executor.sh/mcp";
export const DEFAULT_EXECUTOR_DASHBOARD_URL = "https://app.executor.sh";

export interface ExecutorRuntimeAuth {
  token: string;
  authMode: "oauth" | "pat";
  mcpUrl: string;
  organization?: string;
  organizationName?: string;
  connectionId?: string;
  source: "oauth" | "pat" | "env";
}

export interface ExecutorWhoamiResult {
  ok: boolean;
  status: number;
  organization?: {
    id: string;
    slug?: string;
    name?: string;
  };
  access?: string;
  raw?: unknown;
  error?: string;
  recovery?: {
    action?: string;
    instructions?: string;
  };
}

export interface ExecutorDiscoveredTool {
  name: string;
  description?: string;
}

export interface ExecutorConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  authMode: "oauth" | "pat";
  source: "oauth" | "pat" | "env";
  endpointUrl: string;
  organization?: string;
  organizationName?: string;
  tools: ExecutorDiscoveredTool[];
  connectedApps: string[];
  error?: string;
  recovery?: {
    action?: string;
    instructions?: string;
  };
}

export interface ExecutorConnectedAppInfo {
  slug: string;
  name?: string;
  description?: string;
  accountLabel?: string;
}

const executorErrorEnvelopeSchema = z.object({
  error: z
    .object({
      message: z.string().optional(),
      data: z
        .object({
          code: z.string().optional(),
          status: z.number().optional(),
          message: z.string().optional(),
          recovery: z
            .object({
              action: z.string().optional(),
              instructions: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  message: z.string().optional(),
  recovery: z
    .object({
      action: z.string().optional(),
      instructions: z.string().optional(),
    })
    .optional(),
});

/**
 * Normalizes a potentially customized Executor MCP URL and extracts any
 * `?connection=<id>` embedded in it so query parameters never duplicate.
 */
export function parseExecutorUrlDefaults(
  rawUrl?: string,
  explicitConnectionId?: string,
): {
  baseUrl: string;
  connectionId?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl?.trim() || DEFAULT_EXECUTOR_MCP_URL);
  } catch {
    parsed = new URL(DEFAULT_EXECUTOR_MCP_URL);
  }

  const embedded = parsed.searchParams.get("connection")?.trim() || undefined;
  parsed.searchParams.delete("connection");

  return {
    baseUrl: parsed.toString(),
    connectionId: explicitConnectionId?.trim() || embedded,
  };
}

/**
 * Builds the effective Streamable HTTP MCP URL for a runtime credential.
 *
 * Critical Executor protocol constraints:
 * - OAuth grants CAN carry `?connection=<id>` to use a scoped connection.
 * - Personal Access Tokens (`exp_...`) are explicitly refused at `?connection=<id>`
 *   (`GrantForbidden`), so `connection` MUST be stripped for `pat` mode.
 */
export function buildExecutorMcpUrl(options: {
  baseUrl?: string;
  authMode: "oauth" | "pat";
  connectionId?: string;
  organization?: string;
}): string {
  const { baseUrl, connectionId } = parseExecutorUrlDefaults(
    options.baseUrl,
    options.connectionId,
  );
  const url = new URL(baseUrl);
  url.searchParams.delete("connection");

  if (options.authMode === "oauth" && connectionId) {
    url.searchParams.set("connection", connectionId);
  }

  return url.toString();
}

export function buildExecutorWhoamiUrl(auth: ExecutorRuntimeAuth): string {
  const { baseUrl } = parseExecutorUrlDefaults(auth.mcpUrl);
  const url = new URL(baseUrl);
  const cleanPath = url.pathname.replace(/\/+$/, "") || "/mcp";
  url.pathname = `${cleanPath}/whoami`;
  url.search = "";
  return url.toString();
}

export function buildExecutorAuthHeaders(
  auth: ExecutorRuntimeAuth,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
  };
  const org = auth.organization?.trim();
  if (org) {
    headers["X-Executor-Organization"] = org;
  }
  return headers;
}

export function parseExecutorErrorBody(
  status: number,
  rawBody: string,
): {
  message: string;
  recovery?: { action?: string; instructions?: string };
} {
  try {
    const parsedJson = JSON.parse(rawBody) as unknown;
    const envelope = executorErrorEnvelopeSchema.safeParse(parsedJson);
    if (envelope.success) {
      const data = envelope.data.error?.data;
      const recovery = data?.recovery ?? envelope.data.recovery;
      const msg =
        data?.message ??
        envelope.data.error?.message ??
        envelope.data.message ??
        `Executor returned HTTP ${status}`;
      return { message: msg, recovery };
    }
  } catch {
    // Fall back to trimmed text body below.
  }
  const snippet = rawBody.trim().slice(0, 240);
  return {
    message: snippet || `Executor returned HTTP ${status}`,
  };
}

/**
 * Parses either standard JSON (`application/json`) or Streamable HTTP SSE
 * (`text/event-stream` lines starting with `data: `) MCP responses.
 */
export function parseMcpResponseBody(
  rawBody: string,
  contentType?: string | null,
): Record<string, unknown> | null {
  const trimmed = rawBody.trim();
  if (!trimmed) return null;

  const looksLikeSse =
    contentType?.includes("text/event-stream") || trimmed.startsWith("data:");

  if (!looksLikeSse) {
    try {
      const json = JSON.parse(trimmed) as unknown;
      return typeof json === "object" && json !== null
        ? (json as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  let lastMessage: Record<string, unknown> | null = null;
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        lastMessage = parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore non-JSON heartbeat/comment frames.
    }
  }
  return lastMessage;
}

function extractMcpToolResultValue(
  rpcEnvelope: Record<string, unknown>,
): unknown {
  const errorObj = rpcEnvelope.error;
  if (errorObj && typeof errorObj === "object") {
    const msg = (errorObj as { message?: unknown }).message;
    throw new Error(
      typeof msg === "string" && msg ? msg : "Executor MCP call failed",
    );
  }

  const result = rpcEnvelope.result as
    | {
        isError?: boolean;
        structuredContent?: unknown;
        content?: Array<{ type?: string; text?: string }>;
      }
    | undefined;

  if (!result) return null;

  if (result.structuredContent !== undefined) {
    if (result.isError) {
      throw new Error(JSON.stringify(result.structuredContent));
    }
    return result.structuredContent;
  }

  const text = result.content?.find(
    (part) => typeof part.text === "string",
  )?.text;
  if (!text) return null;

  if (result.isError) {
    throw new Error(text);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export class ExecutorMcpError extends Error {
  readonly status: number;
  readonly recovery?: { action?: string; instructions?: string };

  constructor(
    message: string,
    status: number,
    recovery?: { action?: string; instructions?: string },
  ) {
    super(message);
    this.name = "ExecutorMcpError";
    this.status = status;
    this.recovery = recovery;
  }
}

async function openExecutorMcpSession(
  auth: ExecutorRuntimeAuth,
  endpointUrl: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const authHeaders = buildExecutorAuthHeaders(auth);

  const initRes = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...authHeaders,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "entry-agents", version: "1.0.0" },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const initText = await initRes.text();
  if (!initRes.ok) {
    const parsed = parseExecutorErrorBody(initRes.status, initText);
    throw new ExecutorMcpError(parsed.message, initRes.status, parsed.recovery);
  }

  const initEnvelope = parseMcpResponseBody(
    initText,
    initRes.headers.get("content-type"),
  );
  if (initEnvelope?.error) {
    const parsed = parseExecutorErrorBody(initRes.status, initText);
    throw new ExecutorMcpError(parsed.message, initRes.status, parsed.recovery);
  }

  const sessionId = initRes.headers.get("mcp-session-id") ?? undefined;
  const sessionHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...authHeaders,
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };

  await fetch(endpointUrl, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)),
  }).catch(() => {});

  return sessionId;
}

async function closeExecutorMcpSession(
  auth: ExecutorRuntimeAuth,
  endpointUrl: string,
  sessionId?: string,
): Promise<void> {
  if (!sessionId) return;
  await fetch(endpointUrl, {
    method: "DELETE",
    headers: {
      ...buildExecutorAuthHeaders(auth),
      "Mcp-Session-Id": sessionId,
    },
    signal: AbortSignal.timeout(3_000),
  }).catch(() => {});
}

async function runExecutorRpc(
  auth: ExecutorRuntimeAuth,
  method: string,
  params: Record<string, unknown>,
  timeoutMs = 12_000,
): Promise<Record<string, unknown>> {
  const endpointUrl = buildExecutorMcpUrl({
    baseUrl: auth.mcpUrl,
    authMode: auth.authMode,
    connectionId: auth.connectionId,
    organization: auth.organization,
  });

  const sessionId = await openExecutorMcpSession(auth, endpointUrl, timeoutMs);
  try {
    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...buildExecutorAuthHeaders(auth),
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        params,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const rawText = await res.text();
    if (!res.ok) {
      const parsed = parseExecutorErrorBody(res.status, rawText);
      throw new ExecutorMcpError(parsed.message, res.status, parsed.recovery);
    }

    const envelope = parseMcpResponseBody(
      rawText,
      res.headers.get("content-type"),
    );
    if (!envelope) {
      throw new Error("Executor MCP returned an unreadable response");
    }
    return envelope;
  } finally {
    await closeExecutorMcpSession(auth, endpointUrl, sessionId);
  }
}

export async function callExecutorMcpTool(
  auth: ExecutorRuntimeAuth,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 12_000,
): Promise<unknown> {
  const envelope = await runExecutorRpc(
    auth,
    "tools/call",
    { name: toolName, arguments: args },
    timeoutMs,
  );
  return extractMcpToolResultValue(envelope);
}

export async function listExecutorMcpTools(
  auth: ExecutorRuntimeAuth,
  timeoutMs = 10_000,
): Promise<ExecutorDiscoveredTool[]> {
  const envelope = await runExecutorRpc(auth, "tools/list", {}, timeoutMs);
  const result = envelope.result as
    | { tools?: Array<{ name?: string; description?: string }> }
    | undefined;
  if (!Array.isArray(result?.tools)) return [];
  return result.tools
    .filter(
      (tool): tool is { name: string; description?: string } =>
        typeof tool?.name === "string",
    )
    .map((tool) => ({
      name: tool.name,
      description:
        typeof tool.description === "string"
          ? tool.description.split("\n")[0]?.slice(0, 180)
          : undefined,
    }));
}

export async function fetchExecutorWhoami(
  auth: ExecutorRuntimeAuth,
  timeoutMs = 8_000,
): Promise<ExecutorWhoamiResult> {
  try {
    const res = await fetch(buildExecutorWhoamiUrl(auth), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...buildExecutorAuthHeaders(auth),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) {
      const parsed = parseExecutorErrorBody(res.status, text);
      return {
        ok: false,
        status: res.status,
        error: parsed.message,
        recovery: parsed.recovery,
      };
    }

    const raw = JSON.parse(text) as Record<string, unknown>;
    const orgCandidate =
      (raw.organization as Record<string, unknown> | undefined) ??
      (raw.org as Record<string, unknown> | undefined);

    const orgId =
      typeof orgCandidate?.id === "string"
        ? orgCandidate.id
        : typeof raw.organizationId === "string"
          ? raw.organizationId
          : undefined;
    const orgSlug =
      typeof orgCandidate?.slug === "string"
        ? orgCandidate.slug
        : typeof raw.organizationSlug === "string"
          ? raw.organizationSlug
          : undefined;
    const orgName =
      typeof orgCandidate?.name === "string" ? orgCandidate.name : undefined;

    return {
      ok: true,
      status: res.status,
      organization:
        orgId || orgSlug || orgName
          ? { id: orgId ?? orgSlug ?? "", slug: orgSlug, name: orgName }
          : undefined,
      access: typeof raw.access === "string" ? raw.access : undefined,
      raw,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

function parseConnectedAppsFromPayload(
  payload: unknown,
): ExecutorConnectedAppInfo[] {
  const apps = new Map<string, ExecutorConnectedAppInfo>();

  const pushItem = (
    slugRaw: unknown,
    nameRaw?: unknown,
    descRaw?: unknown,
    accountRaw?: unknown,
  ) => {
    if (typeof slugRaw !== "string") return;
    const slug = slugRaw.trim().toLowerCase();
    if (!slug || slug === "executor") return;
    if (!apps.has(slug)) {
      apps.set(slug, {
        slug,
        name: typeof nameRaw === "string" ? nameRaw : undefined,
        description: typeof descRaw === "string" ? descRaw : undefined,
        accountLabel: typeof accountRaw === "string" ? accountRaw : undefined,
      });
    }
  };

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        pushItem(
          rec.app ?? rec.appId ?? rec.slug ?? rec.id ?? rec.name,
          rec.name ?? rec.app,
          rec.description,
          rec.accountLabel ?? rec.account,
        );
      } else if (typeof item === "string") {
        pushItem(item);
      }
    }
    return [...apps.values()];
  }

  if (payload && typeof payload === "object") {
    const rec = payload as Record<string, unknown>;
    const listCandidates = [rec.apps, rec.skills, rec.items, rec.tools];
    for (const list of listCandidates) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (item && typeof item === "object") {
          const itemRec = item as Record<string, unknown>;
          const pathApp =
            typeof itemRec.path === "string" &&
            itemRec.path.startsWith("tools.")
              ? itemRec.path.split(".")[1]
              : undefined;
          pushItem(
            itemRec.app ??
              itemRec.appId ??
              itemRec.slug ??
              pathApp ??
              itemRec.id,
            itemRec.name ?? itemRec.appName,
            itemRec.description,
            itemRec.accountLabel,
          );
        }
      }
    }
  }

  return [...apps.values()];
}

export async function fetchExecutorConnectedApps(
  auth: ExecutorRuntimeAuth,
): Promise<ExecutorConnectedAppInfo[]> {
  const endpointUrl = buildExecutorMcpUrl({
    baseUrl: auth.mcpUrl,
    authMode: auth.authMode,
    connectionId: auth.connectionId,
    organization: auth.organization,
  });

  const sessionId = await openExecutorMcpSession(auth, endpointUrl, 10_000);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...buildExecutorAuthHeaders(auth),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    };

    const callTool = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<unknown> => {
      const res = await fetch(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now() + Math.floor(Math.random() * 1000),
          method: "tools/call",
          params: { name, arguments: args },
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return null;
      const bodyText = await res.text();
      const env = parseMcpResponseBody(
        bodyText,
        res.headers.get("content-type"),
      );
      if (!env) return null;
      return extractMcpToolResultValue(env);
    };

    const [skillsPayload, searchPayload] = await Promise.all([
      callTool("skills", {}).catch(() => null),
      callTool("search", { query: "", limit: 100 }).catch(() => null),
    ]);

    const merged = new Map<string, ExecutorConnectedAppInfo>();
    for (const app of [
      ...parseConnectedAppsFromPayload(skillsPayload),
      ...parseConnectedAppsFromPayload(searchPayload),
    ]) {
      if (!merged.has(app.slug)) {
        merged.set(app.slug, app);
      }
    }

    return [...merged.values()];
  } finally {
    await closeExecutorMcpSession(auth, endpointUrl, sessionId);
  }
}

export async function testExecutorConnection(
  auth: ExecutorRuntimeAuth,
): Promise<ExecutorConnectionTestResult> {
  const startedAt = Date.now();
  const endpointUrl = buildExecutorMcpUrl({
    baseUrl: auth.mcpUrl,
    authMode: auth.authMode,
    connectionId: auth.connectionId,
    organization: auth.organization,
  });

  const whoami = await fetchExecutorWhoami(auth);
  if (!whoami.ok && whoami.status === 403) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      authMode: auth.authMode,
      source: auth.source,
      endpointUrl,
      organization: auth.organization,
      tools: [],
      connectedApps: [],
      error: whoami.error,
      recovery: whoami.recovery,
    };
  }

  try {
    const tools = await listExecutorMcpTools(auth, 10_000);
    const connected = await fetchExecutorConnectedApps(auth).catch(
      () => [] as ExecutorConnectedAppInfo[],
    );
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      authMode: auth.authMode,
      source: auth.source,
      endpointUrl,
      organization:
        whoami.organization?.slug ??
        whoami.organization?.id ??
        auth.organization,
      organizationName: whoami.organization?.name ?? auth.organizationName,
      tools,
      connectedApps: connected.map((item) => item.slug),
    };
  } catch (error) {
    if (error instanceof ExecutorMcpError) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        authMode: auth.authMode,
        source: auth.source,
        endpointUrl,
        organization: auth.organization,
        tools: [],
        connectedApps: [],
        error: error.message,
        recovery: error.recovery,
      };
    }
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      authMode: auth.authMode,
      source: auth.source,
      endpointUrl,
      organization: auth.organization,
      tools: [],
      connectedApps: [],
      error:
        error instanceof Error ? error.message : "Executor connection failed",
    };
  }
}

export async function initiateExecutorAppConnect(
  auth: ExecutorRuntimeAuth,
  slug: string,
): Promise<{
  url?: string;
  connected?: boolean;
  message?: string;
}> {
  const safeSlug = slug.trim().toLowerCase();
  const org = auth.organization?.trim();
  const fallbackUrl = `${DEFAULT_EXECUTOR_DASHBOARD_URL}/apps/${encodeURIComponent(safeSlug)}`;

  try {
    // Attempt interactive Executor app install + user account connection link
    // inside Executor's sandboxed codemode when an org is available.
    const code = org
      ? `
const org = ${JSON.stringify(org)};
const slug = ${JSON.stringify(safeSlug)};
if (tools.executor?.apps?.install) {
  try { await tools.executor.apps.install({ path: { organization: org }, body: { app: slug } }); } catch {}
}
if (tools.executor?.appAccounts?.userConnect) {
  const res = await tools.executor.appAccounts.userConnect({ path: { organization: org, app: slug, requirement: slug } });
  return { url: res?.url ?? res?.authorizeUrl, connected: res?.state === "completed" };
}
return null;`
      : `
const slug = ${JSON.stringify(safeSlug)};
if (tools.executor?.appAccounts?.userConnect) {
  const res = await tools.executor.appAccounts.userConnect({ path: { app: slug, requirement: slug }, body: {} });
  return { url: res?.url ?? res?.authorizeUrl, connected: res?.state === "completed" };
}
return null;`;

    const result = await callExecutorMcpTool(auth, "execute", { code }, 10_000);
    if (result && typeof result === "object") {
      const rec = result as Record<string, unknown>;
      const data =
        rec.value && typeof rec.value === "object"
          ? (rec.value as Record<string, unknown>)
          : rec;
      if (typeof data.url === "string" && data.url.startsWith("http")) {
        return { url: data.url, connected: Boolean(data.connected) };
      }
      if (data.connected === true) {
        return { connected: true };
      }
    }
  } catch {
    // Fall back cleanly to the official Executor app page below.
  }

  return {
    url: fallbackUrl,
  };
}
