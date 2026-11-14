import type { McpServerConfig } from "@entry-agents/agent";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  decryptMcpHeaders,
  encryptMcpHeaders,
} from "@/lib/mcp/header-encryption";
import { resolveAndAssertPublic } from "@/lib/mcp/url-safety";
import { db } from "./client";
import { InvalidMcpServerConfigError } from "./mcp-server-errors";
import { mcpServers, type McpServerRow } from "./schema";

export type McpTransportType = "http" | "sse" | "stdio";

export interface McpCachedToolSummary {
  name: string;
  description?: string;
}

export interface McpServerSummary {
  id: string;
  name: string;
  transport: McpTransportType;
  url: string | null;
  command: string | null;
  args: string[] | null;
  hasHeaders: boolean;
  hasEnv: boolean;
  enabled: boolean;
  lastToolCount: number | null;
  cachedTools: McpCachedToolSummary[] | null;
  lastConnectionError: string | null;
  lastConnectionCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

// "composio" is reserved for the built-in Composio MCP integration
// (see lib/mcp/composio.ts) -- a self-serve server sharing that exact
// name would collide with it in the merged tool set's namespacing
// (mcp__composio__<tool>) and in failure-result bookkeeping.
const RESERVED_NAMES = new Set(["composio"]);

export class InvalidMcpServerNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMcpServerNameError";
  }
}

export { InvalidMcpServerConfigError };

function assertValidName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new InvalidMcpServerNameError(
      "Name must be 1-32 characters, lowercase letters/numbers/hyphens/underscores, starting with a letter or number",
    );
  }
  if (RESERVED_NAMES.has(name)) {
    throw new InvalidMcpServerNameError(
      `"${name}" is a reserved name and can't be used for a custom MCP server`,
    );
  }
}

function assertValidStdioCommand(command: string | undefined): string {
  const trimmed = command?.trim() ?? "";
  if (!trimmed) {
    throw new InvalidMcpServerConfigError(
      "command is required for stdio MCP servers",
    );
  }
  if (trimmed.length > 512) {
    throw new InvalidMcpServerConfigError("command is too long");
  }
  return trimmed;
}

function normalizeArgs(args: string[] | undefined): string[] | null {
  if (!args || args.length === 0) return null;
  const cleaned = args.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function toSummary(row: McpServerRow): McpServerSummary {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    url: row.url ?? null,
    command: row.command ?? null,
    args: Array.isArray(row.args) ? row.args : null,
    hasHeaders: Boolean(row.encryptedHeaders),
    hasEnv: Boolean(row.encryptedEnv),
    enabled: row.enabled,
    lastToolCount: row.lastToolCount ?? null,
    cachedTools: Array.isArray(row.cachedTools) ? row.cachedTools : null,
    lastConnectionError: row.lastConnectionError,
    lastConnectionCheckedAt: row.lastConnectionCheckedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToMcpConfig(row: McpServerRow): McpServerConfig {
  if (row.transport === "stdio") {
    return {
      name: row.name,
      transport: "stdio",
      command: row.command ?? "",
      args: Array.isArray(row.args) ? row.args : undefined,
      env: decryptMcpHeaders(row.encryptedEnv),
    };
  }
  return {
    name: row.name,
    transport: row.transport,
    url: row.url ?? "",
    headers: decryptMcpHeaders(row.encryptedHeaders),
  };
}

/** Never returns decrypted headers/env -- for display/listing only. */
export async function listMcpServers(
  userId: string,
): Promise<McpServerSummary[]> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, userId))
    .orderBy(asc(mcpServers.name));

  return rows.map(toSummary);
}

/**
 * For internal use only (the chat request path) -- resolves a user's
 * enabled servers with their headers/env decrypted, ready to hand to
 * createMcpToolSet(). Never expose this return value to a client.
 */
export async function getEnabledMcpServersForRequest(
  userId: string,
): Promise<(McpServerConfig & { id: string })[]> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.enabled, true)))
    .orderBy(asc(mcpServers.name));

  return rows.map((row) => ({
    id: row.id,
    ...rowToMcpConfig(row),
  }));
}

/** Internal execution helper for single-server test endpoint. */
export async function getMcpServerByIdForExecution(
  userId: string,
  id: string,
): Promise<(McpServerConfig & { id: string }) | null> {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.id, id)));

  if (!row) return null;
  return {
    id: row.id,
    ...rowToMcpConfig(row),
  };
}

export async function createMcpServer(params: {
  userId: string;
  name: string;
  transport: McpTransportType;
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}): Promise<McpServerSummary> {
  assertValidName(params.name);

  if (params.transport === "stdio") {
    const command = assertValidStdioCommand(params.command);
    const args = normalizeArgs(params.args);
    const [created] = await db
      .insert(mcpServers)
      .values({
        id: nanoid(),
        userId: params.userId,
        name: params.name,
        transport: "stdio",
        url: null,
        command,
        args,
        encryptedEnv: encryptMcpHeaders(params.env),
        encryptedHeaders: null,
        enabled: true,
      })
      .returning();

    return toSummary(created);
  }

  const trimmedUrl = params.url?.trim() ?? "";
  if (!trimmedUrl) {
    throw new InvalidMcpServerConfigError(
      "url is required for http/sse MCP servers",
    );
  }
  await resolveAndAssertPublic(trimmedUrl);

  const [created] = await db
    .insert(mcpServers)
    .values({
      id: nanoid(),
      userId: params.userId,
      name: params.name,
      transport: params.transport,
      url: trimmedUrl,
      command: null,
      args: null,
      encryptedEnv: null,
      encryptedHeaders: encryptMcpHeaders(params.headers),
      enabled: true,
    })
    .returning();

  return toSummary(created);
}

export async function updateMcpServer(params: {
  userId: string;
  id: string;
  name?: string;
  transport?: McpTransportType;
  url?: string;
  /** Pass to replace headers. Omit to leave existing headers untouched. */
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}): Promise<McpServerSummary | null> {
  if (params.name !== undefined) {
    assertValidName(params.name);
  }
  if (params.url !== undefined && params.transport !== "stdio") {
    await resolveAndAssertPublic(params.url);
  }
  if (params.transport === "stdio" && params.command !== undefined) {
    assertValidStdioCommand(params.command);
  }

  const [updated] = await db
    .update(mcpServers)
    .set({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.transport !== undefined
        ? { transport: params.transport }
        : {}),
      ...(params.url !== undefined ? { url: params.url || null } : {}),
      ...(params.headers !== undefined
        ? { encryptedHeaders: encryptMcpHeaders(params.headers) }
        : {}),
      ...(params.command !== undefined
        ? { command: params.command.trim() || null }
        : {}),
      ...(params.args !== undefined
        ? { args: normalizeArgs(params.args) }
        : {}),
      ...(params.env !== undefined
        ? { encryptedEnv: encryptMcpHeaders(params.env) }
        : {}),
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(mcpServers.id, params.id), eq(mcpServers.userId, params.userId)),
    )
    .returning();

  return updated ? toSummary(updated) : null;
}

export async function deleteMcpServer(
  userId: string,
  id: string,
): Promise<boolean> {
  const deleted = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, id), eq(mcpServers.userId, userId)))
    .returning({ id: mcpServers.id });

  return deleted.length > 0;
}

export async function recordMcpServerConnectionResult(
  id: string,
  error: string | null,
  tools?: McpCachedToolSummary[],
): Promise<void> {
  const sanitizedTools = tools
    ? tools.slice(0, 100).map((t) => ({
        name: t.name,
        ...(t.description ? { description: t.description.slice(0, 180) } : {}),
      }))
    : undefined;

  await db
    .update(mcpServers)
    .set({
      lastConnectionError: error,
      lastConnectionCheckedAt: new Date(),
      ...(sanitizedTools !== undefined
        ? {
            lastToolCount: tools?.length ?? 0,
            cachedTools: sanitizedTools,
          }
        : {}),
    })
    .where(eq(mcpServers.id, id));
}
