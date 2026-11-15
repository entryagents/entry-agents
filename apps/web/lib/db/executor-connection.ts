import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  decryptMcpHeaders,
  encryptMcpHeaders,
} from "@/lib/mcp/header-encryption";
import {
  DEFAULT_EXECUTOR_MCP_URL,
  type ExecutorRuntimeAuth,
  parseExecutorUrlDefaults,
} from "@/lib/integrations/providers/executor-mcp";
import { refreshExecutorOAuthToken } from "@/lib/integrations/providers/executor-oauth";
import { db } from "./client";
import { INTERNAL_EXECUTOR_SERVER_NAME } from "./mcp-servers";
import { mcpServers, type McpServerRow } from "./schema";

const CREDENTIAL_HEADER_KEY = "__executor_credential";
const TOKEN_REFRESH_LEEWAY_MS = 60_000;

export interface StoredExecutorCredential {
  authMode: "oauth" | "pat";
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
  pat?: string;
  organization?: string;
  organizationName?: string;
  connectionId?: string;
  mcpUrl?: string;
  connectedAt?: string;
}

export interface ExecutorConnectionStatus {
  connected: boolean;
  source: "oauth" | "pat" | "env" | "none";
  authMode: "oauth" | "pat";
  organization?: string;
  organizationName?: string;
  connectionId?: string;
  mcpUrl: string;
  hasRefreshToken: boolean;
  expiresAt?: number;
  connectedAt?: string;
  lastTestError?: string | null;
  lastCheckedAt?: string | null;
}

export function getDefaultExecutorConfigFromEnv(): {
  apiKey?: string;
  mcpUrl: string;
  connectionId?: string;
  organization?: string;
} {
  const { baseUrl, connectionId } = parseExecutorUrlDefaults(
    process.env.EXECUTOR_MCP_URL,
    process.env.EXECUTOR_CONNECTION_ID,
  );
  return {
    apiKey: process.env.EXECUTOR_API_KEY?.trim() || undefined,
    mcpUrl: baseUrl || DEFAULT_EXECUTOR_MCP_URL,
    connectionId,
    organization: process.env.EXECUTOR_ORGANIZATION?.trim() || undefined,
  };
}

function encodeStoredCredential(cred: StoredExecutorCredential): string | null {
  return encryptMcpHeaders({
    [CREDENTIAL_HEADER_KEY]: JSON.stringify(cred),
  });
}

function decodeStoredCredential(
  encryptedHeaders: string | null,
): StoredExecutorCredential | null {
  if (!encryptedHeaders) return null;
  try {
    const map = decryptMcpHeaders(encryptedHeaders);
    const raw = map?.[CREDENTIAL_HEADER_KEY];
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredExecutorCredential;
    if (parsed.authMode !== "oauth" && parsed.authMode !== "pat") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function findExecutorRow(userId: string): Promise<McpServerRow | null> {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(
      and(
        eq(mcpServers.userId, userId),
        eq(mcpServers.name, INTERNAL_EXECUTOR_SERVER_NAME),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function upsertExecutorRow(
  userId: string,
  cred: StoredExecutorCredential,
  mcpUrl: string,
): Promise<void> {
  const encryptedHeaders = encodeStoredCredential(cred);
  const existing = await findExecutorRow(userId);
  if (existing) {
    await db
      .update(mcpServers)
      .set({
        url: mcpUrl,
        encryptedHeaders,
        enabled: true,
        lastConnectionError: null,
        updatedAt: new Date(),
      })
      .where(eq(mcpServers.id, existing.id));
    return;
  }

  await db.insert(mcpServers).values({
    id: nanoid(),
    userId,
    name: INTERNAL_EXECUTOR_SERVER_NAME,
    transport: "http",
    url: mcpUrl,
    encryptedHeaders,
    enabled: true,
  });
}

export async function saveUserExecutorOAuth(
  userId: string,
  input: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    clientId: string;
    clientSecret?: string;
    organization?: string;
    organizationName?: string;
    connectionId?: string;
    mcpUrl?: string;
  },
): Promise<void> {
  const { baseUrl, connectionId } = parseExecutorUrlDefaults(
    input.mcpUrl,
    input.connectionId,
  );
  await upsertExecutorRow(
    userId,
    {
      authMode: "oauth",
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      organization: input.organization,
      organizationName: input.organizationName,
      connectionId,
      mcpUrl: baseUrl,
      connectedAt: new Date().toISOString(),
    },
    baseUrl,
  );
}

export async function saveUserExecutorPat(
  userId: string,
  input: {
    pat?: string;
    organization?: string;
    connectionId?: string;
    mcpUrl?: string;
  },
): Promise<void> {
  const envDefaults = getDefaultExecutorConfigFromEnv();
  const existingRow = await findExecutorRow(userId);
  const existingCred = existingRow
    ? decodeStoredCredential(existingRow.encryptedHeaders)
    : null;

  const { baseUrl, connectionId } = parseExecutorUrlDefaults(
    input.mcpUrl ?? existingCred?.mcpUrl ?? envDefaults.mcpUrl,
    input.connectionId ??
      existingCred?.connectionId ??
      envDefaults.connectionId,
  );

  const effectivePat =
    input.pat?.trim() || existingCred?.pat || envDefaults.apiKey;
  if (!effectivePat) {
    throw new Error(
      "Enter a personal access token or configure EXECUTOR_API_KEY in the environment.",
    );
  }

  await upsertExecutorRow(
    userId,
    {
      authMode: "pat",
      pat: effectivePat,
      organization:
        input.organization !== undefined
          ? input.organization.trim() || undefined
          : (existingCred?.organization ?? envDefaults.organization),
      connectionId,
      mcpUrl: baseUrl,
      connectedAt: existingCred?.connectedAt ?? new Date().toISOString(),
    },
    baseUrl,
  );
}

export async function clearUserExecutorConnection(
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(mcpServers)
    .where(
      and(
        eq(mcpServers.userId, userId),
        eq(mcpServers.name, INTERNAL_EXECUTOR_SERVER_NAME),
      ),
    )
    .returning({ id: mcpServers.id });
  return deleted.length > 0;
}

export async function recordUserExecutorCheckResult(
  userId: string,
  error: string | null,
  toolNames?: Array<{ name: string; description?: string }>,
): Promise<void> {
  const row = await findExecutorRow(userId);
  if (!row) return;

  await db
    .update(mcpServers)
    .set({
      lastConnectionError: error,
      lastConnectionCheckedAt: new Date(),
      ...(toolNames
        ? {
            lastToolCount: toolNames.length,
            cachedTools: toolNames.slice(0, 24),
          }
        : {}),
    })
    .where(eq(mcpServers.id, row.id));
}

/** Never exposes raw secrets/tokens -- safe for Settings UI hydration. */
export async function getUserExecutorStatus(
  userId: string,
): Promise<ExecutorConnectionStatus> {
  const envDefaults = getDefaultExecutorConfigFromEnv();
  const row = await findExecutorRow(userId);
  const cred = row ? decodeStoredCredential(row.encryptedHeaders) : null;

  if (cred?.authMode === "oauth" && cred.accessToken) {
    return {
      connected: true,
      source: "oauth",
      authMode: "oauth",
      organization: cred.organization,
      organizationName: cred.organizationName,
      connectionId: cred.connectionId ?? envDefaults.connectionId,
      mcpUrl: cred.mcpUrl || envDefaults.mcpUrl,
      hasRefreshToken: Boolean(cred.refreshToken),
      expiresAt: cred.expiresAt,
      connectedAt: cred.connectedAt,
      lastTestError: row?.lastConnectionError ?? null,
      lastCheckedAt: row?.lastConnectionCheckedAt?.toISOString() ?? null,
    };
  }

  if (cred?.authMode === "pat" && cred.pat) {
    return {
      connected: true,
      source: "pat",
      authMode: "pat",
      organization: cred.organization ?? envDefaults.organization,
      organizationName: cred.organizationName,
      connectionId: cred.connectionId ?? envDefaults.connectionId,
      mcpUrl: cred.mcpUrl || envDefaults.mcpUrl,
      hasRefreshToken: false,
      connectedAt: cred.connectedAt,
      lastTestError: row?.lastConnectionError ?? null,
      lastCheckedAt: row?.lastConnectionCheckedAt?.toISOString() ?? null,
    };
  }

  if (envDefaults.apiKey) {
    return {
      connected: true,
      source: "env",
      authMode: "pat",
      organization: envDefaults.organization,
      connectionId: envDefaults.connectionId,
      mcpUrl: envDefaults.mcpUrl,
      hasRefreshToken: false,
    };
  }

  return {
    connected: false,
    source: "none",
    authMode: "oauth",
    connectionId: envDefaults.connectionId,
    mcpUrl: envDefaults.mcpUrl,
    hasRefreshToken: false,
  };
}

/**
 * Resolves live runtime auth for server-side MCP execution, automatically
 * refreshing OAuth access tokens when near expiry. Never expose return value to UI.
 */
export async function resolveExecutorRuntimeAuth(
  userId: string,
): Promise<ExecutorRuntimeAuth | null> {
  const envDefaults = getDefaultExecutorConfigFromEnv();
  const row = await findExecutorRow(userId);
  const cred = row ? decodeStoredCredential(row.encryptedHeaders) : null;

  if (cred?.authMode === "oauth" && cred.accessToken) {
    let token = cred.accessToken;
    const isExpiringSoon =
      typeof cred.expiresAt === "number" &&
      cred.expiresAt <= Date.now() + TOKEN_REFRESH_LEEWAY_MS;

    if (isExpiringSoon && cred.refreshToken && cred.clientId) {
      const refreshed = await refreshExecutorOAuthToken({
        refreshToken: cred.refreshToken,
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
      });
      if (refreshed) {
        token = refreshed.accessToken;
        await saveUserExecutorOAuth(userId, {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? cred.refreshToken,
          expiresAt: refreshed.expiresAt,
          clientId: cred.clientId,
          clientSecret: cred.clientSecret,
          organization: cred.organization,
          organizationName: cred.organizationName,
          connectionId: cred.connectionId ?? envDefaults.connectionId,
          mcpUrl: cred.mcpUrl || envDefaults.mcpUrl,
        }).catch(() => {});
      }
    }

    return {
      token,
      authMode: "oauth",
      mcpUrl: cred.mcpUrl || envDefaults.mcpUrl,
      organization: cred.organization,
      organizationName: cred.organizationName,
      connectionId: cred.connectionId ?? envDefaults.connectionId,
      source: "oauth",
    };
  }

  if (cred?.authMode === "pat" && cred.pat) {
    return {
      token: cred.pat,
      authMode: "pat",
      mcpUrl: cred.mcpUrl || envDefaults.mcpUrl,
      organization: cred.organization ?? envDefaults.organization,
      organizationName: cred.organizationName,
      connectionId: cred.connectionId ?? envDefaults.connectionId,
      source: "pat",
    };
  }

  if (envDefaults.apiKey) {
    return {
      token: envDefaults.apiKey,
      authMode: "pat",
      mcpUrl: envDefaults.mcpUrl,
      organization: envDefaults.organization,
      connectionId: envDefaults.connectionId,
      source: "env",
    };
  }

  return null;
}
