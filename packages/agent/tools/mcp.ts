import {
  createMCPClient,
  type MCPClient,
  type MCPTransport,
} from "@ai-sdk/mcp";
import type { Sandbox } from "@entry-agents/sandbox";
import type { Tool, ToolSet } from "ai";
import {
  createSecretRedactor,
  type SecretRedactor,
} from "../lib/secret-redactor";
import { SandboxStdioMcpTransport } from "./mcp-stdio-sandbox";

export type McpServerConfig =
  | {
      /**
       * Short, stable identifier used in tool names (mcp__<name>__<tool>).
       * Keep it stable across requests -- changing it changes every tool
       * name the model has already seen mid-conversation.
       */
      name: string;
      transport: "http" | "sse";
      url: string;
      headers?: Record<string, string>;
    }
  | {
      name: string;
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };

export interface McpConnectionFailure {
  name: string;
  error: string;
}

export interface McpDiscoveredTool {
  name: string;
  namespacedName: string;
  description?: string;
}

export interface McpToolSetResult {
  tools: ToolSet;
  /**
   * Closes every underlying MCP client connection opened for this
   * call. Callers MUST invoke this once they're fully done executing
   * tools for the request (e.g. in a `finally` after the model
   * stream is fully consumed) -- these are real network connections
   * (persistent for the "sse" transport), not garbage-collected
   * resources.
   */
  close: () => Promise<void>;
  /**
   * Servers that failed to connect. Deliberately non-fatal: one
   * misconfigured or down MCP server should never take down a whole
   * turn when other servers (and Entry's own built-in tools) are
   * fine. Callers should log/surface these, not throw.
   */
  failures: McpConnectionFailure[];
  /** Discovered tool catalog per connected server, deterministically sorted. */
  toolsByServer?: Record<string, McpDiscoveredTool[]>;
}

export interface CreateMcpToolSetOptions {
  /** Session sandbox required to run `stdio` MCP servers inside isolation. */
  sandbox?: Sandbox;
  /** Redacts any secret values from MCP errors and tool outputs. */
  secretRedactor?: SecretRedactor;
  /** Connection + tools/list timeout per server (default 15_000ms). */
  connectTimeoutMs?: number;
}

// Most providers cap tool names well under this; MCP tool names are
// arbitrary strings so a very long "<server>__<tool>" combination
// gets truncated rather than risking a rejected request.
const MAX_TOOL_NAME_LENGTH = 64;
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

export function namespacedMcpToolName(
  serverName: string,
  toolName: string,
): string {
  const raw = `mcp__${serverName}__${toolName}`;
  return raw.length <= MAX_TOOL_NAME_LENGTH
    ? raw
    : raw.slice(0, MAX_TOOL_NAME_LENGTH);
}

type PermissionMode = "ask" | "autoAccept" | "fullAccess";

/**
 * Wraps every MCP tool with Entry's approval gate (`needsApproval` in "ask" mode)
 * AND scrubs returned outputs + thrown errors through `secretRedactor`.
 */
function wrapMcpTool<T extends Tool>(mcpTool: T, redactor: SecretRedactor): T {
  const originalExecute = mcpTool.execute;
  return {
    ...mcpTool,
    needsApproval: async (
      _args: unknown,
      context: { experimental_context?: unknown },
    ) => {
      const mode = (
        context.experimental_context as
          | { permissionMode?: PermissionMode }
          | undefined
      )?.permissionMode;
      return (mode ?? "ask") === "ask";
    },
    ...(originalExecute
      ? {
          execute: async (args: unknown, execOptions: unknown) => {
            try {
              const out = await originalExecute(
                args as never,
                execOptions as never,
              );
              return redactor.hasSecrets() ? redactor.redactUnknown(out) : out;
            } catch (error) {
              if (error instanceof Error && redactor.hasSecrets()) {
                throw new Error(redactor.redact(error.message), {
                  cause: error,
                });
              }
              throw error;
            }
          },
        }
      : {}),
  } as T;
}

async function connectSingleMcpServer(
  server: McpServerConfig,
  options?: CreateMcpToolSetOptions,
): Promise<MCPClient> {
  const redactor = options?.secretRedactor ?? createSecretRedactor([]);
  const timeoutMs = options?.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

  let transport:
    | { type: "http" | "sse"; url: string; headers?: Record<string, string> }
    | MCPTransport;

  if (server.transport === "stdio") {
    if (!options?.sandbox) {
      throw new Error(
        `Stdio MCP server "${server.name}" requires an active sandbox.`,
      );
    }
    transport = new SandboxStdioMcpTransport({
      name: server.name,
      command: server.command,
      args: server.args,
      env: server.env,
      sandbox: options.sandbox,
      secretRedactor: redactor,
      timeoutMs: Math.max(timeoutMs, 25_000),
    });
  } else {
    transport = {
      type: server.transport,
      url: server.url,
      headers: server.headers,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await createMCPClient({
      transport,
      initializationOptions: {
        signal: controller.signal,
        timeout: timeoutMs,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Connects to a single MCP server and discovers its tools (used by Settings "Test" button
 * as well as internal verification). Always closes the client before returning.
 */
export async function discoverMcpServerTools(
  server: McpServerConfig,
  options?: CreateMcpToolSetOptions,
): Promise<{
  ok: boolean;
  latencyMs: number;
  tools: McpDiscoveredTool[];
  error?: string;
}> {
  const redactor = options?.secretRedactor ?? createSecretRedactor([]);
  const startedAt = Date.now();
  let client: MCPClient | undefined;
  try {
    client = await connectSingleMcpServer(server, options);
    const serverTools = await client.tools();
    const tools: McpDiscoveredTool[] = Object.entries(serverTools)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([toolName, def]) => ({
        name: toolName,
        namespacedName: namespacedMcpToolName(server.name, toolName),
        description:
          typeof (def as { description?: unknown }).description === "string"
            ? ((def as { description: string }).description ?? undefined)
            : undefined,
      }));
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
      tools,
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      tools: [],
      error: redactor.redact(raw),
    };
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }
}

/**
 * Connects to every configured MCP server in parallel, fetches its
 * tools, and returns them merged into a single AI SDK ToolSet --
 * namespaced as mcp__<server>__<tool> to avoid collisions between
 * servers or with Entry's own built-in tools.
 *
 * Tool keys are sorted deterministically before return so network timing
 * differences across steps never shuffle schema order and bust KV prompt caches.
 */
export async function createMcpToolSet(
  servers: McpServerConfig[],
  options?: CreateMcpToolSetOptions,
): Promise<McpToolSetResult> {
  const redactor = options?.secretRedactor ?? createSecretRedactor([]);
  const closers: (() => Promise<void>)[] = [];
  const failures: McpConnectionFailure[] = [];
  const unsortedTools: ToolSet = {};
  const toolsByServer: Record<string, McpDiscoveredTool[]> = {};

  await Promise.all(
    servers.map(async (server) => {
      try {
        const client = await connectSingleMcpServer(server, options);
        closers.push(() => client.close());

        const serverTools = await client.tools();
        const discovered: McpDiscoveredTool[] = [];
        for (const [toolName, mcpTool] of Object.entries(serverTools).sort(
          ([a], [b]) => a.localeCompare(b),
        )) {
          const name = namespacedMcpToolName(server.name, toolName);
          unsortedTools[name] = wrapMcpTool(mcpTool as Tool, redactor);
          discovered.push({
            name: toolName,
            namespacedName: name,
            description:
              typeof (mcpTool as { description?: unknown }).description ===
              "string"
                ? (mcpTool as { description: string }).description
                : undefined,
          });
        }
        toolsByServer[server.name] = discovered;
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        failures.push({
          name: server.name,
          error: redactor.redact(raw),
        });
      }
    }),
  );

  const sortedTools: ToolSet = {};
  for (const key of Object.keys(unsortedTools).sort()) {
    const toolDef = unsortedTools[key];
    if (toolDef) {
      sortedTools[key] = toolDef;
    }
  }

  return {
    tools: sortedTools,
    failures,
    toolsByServer,
    close: async () => {
      await Promise.all(
        closers.map((close) =>
          close().catch(() => {
            // Best-effort cleanup
          }),
        ),
      );
    },
  };
}
