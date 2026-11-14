import type { CreateMcpServerInput } from "@/hooks/use-mcp-servers";

export interface McpQuickPreset {
  id: string;
  label: string;
  description: string;
  config: CreateMcpServerInput;
}

export const MCP_QUICK_PRESETS: McpQuickPreset[] = [
  {
    id: "context7",
    label: "Context7 Docs",
    description: "Up-to-date library & SDK docs via HTTP",
    config: {
      name: "context7",
      transport: "http",
      url: "https://mcp.context7.com/mcp",
    },
  },
  {
    id: "deepwiki",
    label: "DeepWiki",
    description: "Query public GitHub repo architecture docs via SSE",
    config: {
      name: "deepwiki",
      transport: "sse",
      url: "https://mcp.deepwiki.com/sse",
    },
  },
  {
    id: "github-stdio",
    label: "GitHub (Stdio)",
    description: "Official GitHub MCP via npx inside sandbox",
    config: {
      name: "github-mcp",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "{{SECRET:GITHUB_TOKEN}}" },
    },
  },
  {
    id: "filesystem-stdio",
    label: "Workspace FS (Stdio)",
    description: "Stdio filesystem server scoped to /workspace",
    config: {
      name: "workspace-fs",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    },
  },
];

export interface ParsedMcpJsonResult {
  servers: CreateMcpServerInput[];
  errors: string[];
}

function normalizeServerName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return /^[a-z0-9]/.test(cleaned) ? cleaned : `mcp-${cleaned || "server"}`;
}

export function parseMcpJsonImport(rawJson: string): ParsedMcpJsonResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { servers: [], errors: ["Invalid JSON syntax"] };
  }

  if (!parsed || typeof parsed !== "object") {
    return { servers: [], errors: ["JSON root must be an object"] };
  }

  const root = parsed as Record<string, unknown>;
  const mapSource =
    root.mcpServers && typeof root.mcpServers === "object"
      ? (root.mcpServers as Record<string, unknown>)
      : root.servers && typeof root.servers === "object"
        ? (root.servers as Record<string, unknown>)
        : root;

  const servers: CreateMcpServerInput[] = [];
  const errors: string[] = [];

  for (const [rawKey, rawConfig] of Object.entries(mapSource)) {
    if (!rawConfig || typeof rawConfig !== "object") continue;
    const entry = rawConfig as Record<string, unknown>;
    const name = normalizeServerName(
      typeof entry.name === "string" ? entry.name : rawKey,
    );

    if (typeof entry.command === "string" && entry.command.trim()) {
      const args = Array.isArray(entry.args)
        ? entry.args.filter((item): item is string => typeof item === "string")
        : undefined;
      const env =
        entry.env && typeof entry.env === "object" && !Array.isArray(entry.env)
          ? Object.fromEntries(
              Object.entries(entry.env as Record<string, unknown>).map(
                ([k, v]) => [k, String(v ?? "")],
              ),
            )
          : undefined;
      servers.push({
        name,
        transport: "stdio",
        command: entry.command.trim(),
        ...(args && args.length > 0 ? { args } : {}),
        ...(env && Object.keys(env).length > 0 ? { env } : {}),
      });
      continue;
    }

    const url =
      typeof entry.url === "string"
        ? entry.url.trim()
        : typeof entry.serverUrl === "string"
          ? entry.serverUrl.trim()
          : "";
    if (!url) {
      errors.push(`"${rawKey}": missing command or url`);
      continue;
    }

    const rawTransport =
      typeof entry.transport === "string"
        ? entry.transport.toLowerCase()
        : typeof entry.type === "string"
          ? entry.type.toLowerCase()
          : url.toLowerCase().includes("sse")
            ? "sse"
            : "http";
    const transport: "http" | "sse" = rawTransport === "sse" ? "sse" : "http";

    const headers =
      entry.headers &&
      typeof entry.headers === "object" &&
      !Array.isArray(entry.headers)
        ? Object.fromEntries(
            Object.entries(entry.headers as Record<string, unknown>).map(
              ([k, v]) => [k, String(v ?? "")],
            ),
          )
        : undefined;

    servers.push({
      name,
      transport,
      url,
      ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
    });
  }

  if (servers.length === 0 && errors.length === 0) {
    errors.push(
      'No MCP servers found. Expected { "mcpServers": { "name": { ... } } }',
    );
  }

  return { servers, errors };
}
