"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileJson,
  Globe,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Plug,
  Plus,
  Radio,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type McpServerSummary,
  type McpTestResult,
  type McpTransportType,
  useMcpServers,
} from "@/hooks/use-mcp-servers";
import { useUserSecrets } from "@/hooks/use-user-secrets";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { MCP_QUICK_PRESETS, parseMcpJsonImport } from "./mcp-presets";

function parseKeyValueLines(
  raw: string,
  separator: ":" | "=",
): Record<string, string> | undefined {
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(separator);
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && val) {
      map[key] = val;
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function parseArgsLine(raw: string): string[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Support simple quoted args or whitespace splitting
  const matches = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!matches) return undefined;
  const cleaned = matches
    .map((token) => {
      if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        return token.slice(1, -1);
      }
      return token;
    })
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : undefined;
}

export function McpServersSectionSkeleton() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">MCP servers</h2>
      <div className="rounded-lg border border-border/70">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
          >
            <div className="grid min-w-0 flex-1 gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

const TRANSPORT_META: Record<
  McpTransportType,
  { label: string; hint: string; icon: typeof Globe }
> = {
  http: {
    label: "Streamable HTTP",
    hint: "Modern remote MCP endpoints",
    icon: Globe,
  },
  sse: {
    label: "SSE",
    hint: "Legacy Server-Sent Events URLs",
    icon: Radio,
  },
  stdio: {
    label: "Stdio Command",
    hint: "npx / uvx / python inside sandbox",
    icon: Terminal,
  },
};

export function McpServersSection() {
  const {
    servers,
    loading,
    error,
    createServer,
    updateServer,
    deleteServer,
    testServer,
  } = useMcpServers();
  const { secrets } = useUserSecrets();

  const [editingServer, setEditingServer] = useState<McpServerSummary | null>(
    null,
  );
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransportType>("http");
  const [url, setUrl] = useState("");
  const [headersRaw, setHeadersRaw] = useState("");
  const [command, setCommand] = useState("");
  const [argsRaw, setArgsRaw] = useState("");
  const [envRaw, setEnvRaw] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [showJsonImport, setShowJsonImport] = useState(false);
  const [jsonImportText, setJsonImportText] = useState("");
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, McpTestResult>>(
    {},
  );
  const [expandedToolsIds, setExpandedToolsIds] = useState<Set<string>>(
    new Set(),
  );

  const resetForm = () => {
    setEditingServer(null);
    setName("");
    setTransport("http");
    setUrl("");
    setHeadersRaw("");
    setCommand("");
    setArgsRaw("");
    setEnvRaw("");
    setFormError(null);
  };

  const startEditing = (server: McpServerSummary) => {
    setEditingServer(server);
    setName(server.name);
    setTransport(server.transport);
    setUrl(server.url ?? "");
    setHeadersRaw("");
    setCommand(server.command ?? "");
    setArgsRaw(server.args?.join(" ") ?? "");
    setEnvRaw("");
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("Server name is required");
      return;
    }

    if (transport === "stdio") {
      if (!command.trim()) {
        setFormError("Command is required (e.g. npx)");
        return;
      }
    } else if (!url.trim()) {
      setFormError("Server URL is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedHeaders = parseKeyValueLines(headersRaw, ":");
      const parsedArgs = parseArgsLine(argsRaw);
      const parsedEnv = parseKeyValueLines(envRaw, "=");

      if (editingServer) {
        await updateServer(editingServer.id, {
          name: trimmedName,
          transport,
          ...(transport === "stdio"
            ? {
                command: command.trim(),
                args: parsedArgs ?? [],
                ...(parsedEnv ? { env: parsedEnv } : {}),
              }
            : {
                url: url.trim(),
                ...(parsedHeaders ? { headers: parsedHeaders } : {}),
              }),
        });
      } else if (transport === "stdio") {
        await createServer({
          name: trimmedName,
          transport: "stdio",
          command: command.trim(),
          ...(parsedArgs ? { args: parsedArgs } : {}),
          ...(parsedEnv ? { env: parsedEnv } : {}),
        });
      } else {
        await createServer({
          name: trimmedName,
          transport,
          url: url.trim(),
          ...(parsedHeaders ? { headers: parsedHeaders } : {}),
        });
      }
      resetForm();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save MCP server",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportJson = async () => {
    setJsonImportError(null);
    const { servers: parsed, errors } = parseMcpJsonImport(jsonImportText);
    if (errors.length > 0 && parsed.length === 0) {
      setJsonImportError(errors[0] ?? "Could not parse MCP JSON");
      return;
    }

    setIsImporting(true);
    const failures: string[] = [...errors];
    try {
      for (const item of parsed) {
        try {
          await createServer(item);
        } catch (err) {
          failures.push(
            `${item.name}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }
      if (failures.length > 0) {
        setJsonImportError(failures.join("; "));
      } else {
        setJsonImportText("");
        setShowJsonImport(false);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const applyPreset = (presetIndex: number) => {
    const preset = MCP_QUICK_PRESETS[presetIndex];
    if (!preset) return;
    setEditingServer(null);
    setName(preset.config.name);
    setTransport(preset.config.transport);
    if (preset.config.transport === "stdio") {
      setCommand(preset.config.command);
      setArgsRaw((preset.config.args ?? []).join(" "));
      setEnvRaw(
        preset.config.env
          ? Object.entries(preset.config.env)
              .map(([k, v]) => `${k}=${v}`)
              .join("\n")
          : "",
      );
      setUrl("");
      setHeadersRaw("");
    } else {
      setUrl(preset.config.url);
      setHeadersRaw(
        preset.config.headers
          ? Object.entries(preset.config.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")
          : "",
      );
      setCommand("");
      setArgsRaw("");
      setEnvRaw("");
    }
    setFormError(null);
  };

  const insertSecretTemplate = (secretName: string) => {
    const token = `{{SECRET:${secretName}}}`;
    if (transport === "stdio") {
      setEnvRaw((prev) =>
        prev.trim()
          ? `${prev.trimEnd()}\n${secretName}=${token}`
          : `${secretName}=${token}`,
      );
    } else {
      setHeadersRaw((prev) =>
        prev.trim()
          ? `${prev.trimEnd()}\nAuthorization: Bearer ${token}`
          : `Authorization: Bearer ${token}`,
      );
    }
  };

  const withPending = async (id: string, fn: () => Promise<void>) => {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleTest = async (id: string) => {
    setTestingIds((prev) => new Set(prev).add(id));
    try {
      const result = await testServer(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      if (result.ok && result.tools.length > 0) {
        setExpandedToolsIds((prev) => new Set(prev).add(id));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          latencyMs: 0,
          tools: [],
          error: err instanceof Error ? err.message : "Test failed",
        },
      }));
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleExpandedTools = (id: string) => {
    setExpandedToolsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <McpServersSectionSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">MCP servers</h2>
          <p className="text-sm text-muted-foreground">
            Connect remote HTTP/SSE endpoints or run stdio MCP servers inside
            your session sandbox. Tools appear to the agent as{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              mcp__&lt;server&gt;__&lt;tool&gt;
            </code>
            .
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => setShowJsonImport((v) => !v)}
        >
          <FileJson className="size-3.5" strokeWidth={1.5} />
          Import JSON
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {showJsonImport && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                Import from MCP JSON config
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a standard{" "}
                <code className="font-mono">{'{ "mcpServers": { ... } }'}</code>{" "}
                block. Supports remote URLs and{" "}
                <code className="font-mono">command</code> /{" "}
                <code className="font-mono">args</code> /{" "}
                <code className="font-mono">env</code>.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setShowJsonImport(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <Textarea
            value={jsonImportText}
            onChange={(e) => setJsonImportText(e.target.value)}
            placeholder={`{\n  "mcpServers": {\n    "context7": {\n      "url": "https://mcp.context7.com/mcp"\n    }\n  }\n}`}
            rows={5}
            className="font-mono text-xs"
          />
          {jsonImportError && (
            <p className="text-xs text-destructive">{jsonImportError}</p>
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isImporting || !jsonImportText.trim()}
              onClick={handleImportJson}
            >
              {isImporting && (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              )}
              Import servers
            </Button>
          </div>
        </div>
      )}

      {servers.length > 0 && (
        <div className="divide-y divide-border/70 rounded-lg border border-border/70">
          {servers.map((server) => {
            const isTesting = testingIds.has(server.id);
            const isPending = pendingIds.has(server.id);
            const liveTest = testResults[server.id];
            const discoveredTools = liveTest?.ok
              ? liveTest.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                }))
              : (server.cachedTools ?? []);
            const toolCount = liveTest?.ok
              ? liveTest.tools.length
              : server.lastToolCount;
            const isExpanded = expandedToolsIds.has(server.id);
            const isHealthy =
              server.enabled &&
              !server.lastConnectionError &&
              server.lastConnectionCheckedAt !== null;

            return (
              <div key={server.id} className="space-y-2.5 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="relative mt-0.5">
                      <Plug
                        className="size-4 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background ${
                          !server.enabled
                            ? "bg-muted-foreground/40"
                            : server.lastConnectionError
                              ? "bg-destructive"
                              : isHealthy
                                ? "bg-emerald-500"
                                : "bg-amber-500"
                        }`}
                      />
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {server.name}
                        </span>
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 font-mono text-[11px] font-normal"
                        >
                          {server.transport}
                        </Badge>
                        {toolCount !== null && !server.lastConnectionError && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-3" />
                            {toolCount} {toolCount === 1 ? "tool" : "tools"}
                            {liveTest?.latencyMs
                              ? ` · ${liveTest.latencyMs}ms`
                              : ""}
                          </span>
                        )}
                        {(server.hasHeaders || server.hasEnv) && (
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            <KeyRound className="size-2.5" />
                            Encrypted{" "}
                            {server.transport === "stdio" ? "env" : "headers"}
                          </span>
                        )}
                      </div>

                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {server.transport === "stdio"
                          ? [server.command, ...(server.args ?? [])]
                              .filter(Boolean)
                              .join(" ")
                          : server.url}
                      </span>

                      {server.lastConnectionCheckedAt && (
                        <span className="text-[11px] text-muted-foreground">
                          Checked{" "}
                          {formatRelativeTime(
                            new Date(server.lastConnectionCheckedAt),
                          )}
                        </span>
                      )}

                      {server.lastConnectionError && (
                        <span className="flex items-start gap-1 text-xs text-destructive">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          <span className="break-all">
                            {server.lastConnectionError}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isTesting || isPending}
                      onClick={() => handleTest(server.id)}
                      className="h-7 gap-1 px-2.5 text-xs"
                    >
                      {isTesting ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Play className="size-3" />
                      )}
                      Test
                    </Button>
                    {discoveredTools.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpandedTools(server.id)}
                        className="h-7 px-2 text-xs text-muted-foreground"
                      >
                        {isExpanded ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() => startEditing(server)}
                      aria-label={`Edit ${server.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Switch
                      checked={server.enabled}
                      disabled={isPending}
                      onCheckedChange={(checked) =>
                        withPending(server.id, () =>
                          updateServer(server.id, { enabled: checked }).then(
                            () => undefined,
                          ),
                        )
                      }
                      aria-label={`Enable ${server.name}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      onClick={() =>
                        withPending(server.id, () => deleteServer(server.id))
                      }
                      aria-label={`Remove ${server.name}`}
                    >
                      {isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {isExpanded && discoveredTools.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-muted/20 p-2.5">
                    <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                      Discovered tools ({discoveredTools.length})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {discoveredTools.map((tool) => (
                        <span
                          key={tool.name}
                          title={tool.description}
                          className="rounded border border-border/60 bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
                        >
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-dashed border-border/70 p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            {editingServer ? (
              <>
                <Pencil className="size-4" strokeWidth={1.5} />
                Editing {editingServer.name}
              </>
            ) : (
              <>
                <Plus className="size-4" strokeWidth={1.5} />
                Add MCP server
              </>
            )}
          </div>
          {editingServer ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
              className="h-7 gap-1 text-xs"
            >
              <X className="size-3.5" />
              Cancel edit
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                Presets:
              </span>
              {MCP_QUICK_PRESETS.map((preset, index) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.description}
                  onClick={() => applyPreset(index)}
                  className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-foreground transition-colors hover:bg-muted"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="mcp-name">Server identifier</Label>
            <Input
              id="mcp-name"
              placeholder="linear"
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                )
              }
              className="font-mono text-xs"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Transport</Label>
            <div className="grid grid-cols-3 rounded-md border border-border bg-muted/30 p-0.5">
              {(["http", "sse", "stdio"] as const).map((kind) => {
                const Icon = TRANSPORT_META[kind].icon;
                const active = transport === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setTransport(kind)}
                    title={TRANSPORT_META[kind].hint}
                    className={`flex items-center justify-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-xs font-medium transition-colors ${
                      active
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" strokeWidth={1.5} />
                    {kind}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {transport === "stdio" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-command">Command</Label>
                <Input
                  id="mcp-command"
                  placeholder="npx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-args">Arguments</Label>
                <Input
                  id="mcp-args"
                  placeholder="-y @modelcontextprotocol/server-github"
                  value={argsRaw}
                  onChange={(e) => setArgsRaw(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-env">
                Environment variables (optional, KEY=VALUE per line)
              </Label>
              <Textarea
                id="mcp-env"
                placeholder={
                  "GITHUB_PERSONAL_ACCESS_TOKEN={{SECRET:GITHUB_TOKEN}}"
                }
                value={envRaw}
                onChange={(e) => setEnvRaw(e.target.value)}
                rows={2}
                className="font-mono text-xs"
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-url">Server URL</Label>
              <Input
                id="mcp-url"
                placeholder={
                  transport === "sse"
                    ? "https://mcp.example.com/sse"
                    : "https://mcp.example.com/mcp"
                }
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-headers">
                {editingServer?.hasHeaders
                  ? "Replace headers (optional, leave blank to keep encrypted headers)"
                  : "Headers (optional, one Header: Value per line)"}
              </Label>
              <Textarea
                id="mcp-headers"
                placeholder={"Authorization: Bearer {{SECRET:MY_API_KEY}}"}
                value={headersRaw}
                onChange={(e) => setHeadersRaw(e.target.value)}
                className="font-mono text-xs"
                rows={2}
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <KeyRound className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span>Insert secret reference:</span>
            {secrets.length > 0 ? (
              secrets.map((secret) => (
                <button
                  key={secret.id}
                  type="button"
                  onClick={() => insertSecretTemplate(secret.name)}
                  className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[11px] text-foreground transition-colors hover:bg-muted"
                >
                  {`{{SECRET:${secret.name}}}`}
                </button>
              ))
            ) : (
              <span>none stored yet</span>
            )}
          </div>
          <Link
            href="/settings/secrets"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Manage secrets vault
            <ArrowUpRight className="size-3" strokeWidth={1.5} />
          </Link>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {editingServer ? "Save changes" : "Add server"}
        </Button>
      </form>
    </div>
  );
}
