"use client";

import { FileCode2, Plug, Search } from "lucide-react";
import type { ToolRenderState } from "@/app/lib/render-tool";
import type { WebAgentUIToolPart } from "@/app/types";
import { ToolLayout } from "../tool-layout";

export type McpRendererProps = {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
  toolName: string;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
};

const BRIDGE_TOOLS = new Set(["tool_search", "tool_describe", "tool_call"]);

export function isMcpOrBridgeTool(toolName: string): boolean {
  return toolName.startsWith("mcp__") || BRIDGE_TOOLS.has(toolName);
}

function parseNamespacedMcpTool(rawToolName: string): {
  server: string | null;
  action: string;
} {
  if (!rawToolName.startsWith("mcp__")) {
    return { server: null, action: rawToolName };
  }
  const rest = rawToolName.slice("mcp__".length);
  const sepIndex = rest.indexOf("__");
  if (sepIndex <= 0) {
    return { server: null, action: rest };
  }
  return {
    server: rest.slice(0, sepIndex),
    action: rest.slice(sepIndex + 2),
  };
}

function formatCompactArgs(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  const entries = Object.entries(input).filter(
    ([, val]) => val !== undefined && val !== null && val !== "",
  );
  if (entries.length === 0) return "";
  const parts: string[] = [];
  for (const [k, v] of entries.slice(0, 3)) {
    const rendered =
      typeof v === "string"
        ? v.length > 28
          ? `${v.slice(0, 25)}...`
          : v
        : typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : Array.isArray(v)
            ? `[${v.length}]`
            : "{...}";
    parts.push(`${k}=${rendered}`);
  }
  return parts.join(" ");
}

function stringifyForPre(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    return value.length > 6000
      ? `${value.slice(0, 6000)}\n... [truncated]`
      : value;
  }
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized.length > 6000
      ? `${serialized.slice(0, 6000)}\n... [truncated]`
      : serialized;
  } catch {
    return String(value);
  }
}

export function resolveMcpToolDisplay(
  toolName: string,
  input: Record<string, unknown> | undefined,
): {
  kind: "search" | "describe" | "mcp";
  name: string;
  summary: string;
} {
  const inp = input ?? {};

  if (toolName === "tool_search") {
    const query = typeof inp.query === "string" ? inp.query : "";
    return {
      kind: "search",
      name: "MCP Search",
      summary: query || "...",
    };
  }

  if (toolName === "tool_describe") {
    const tools = Array.isArray(inp.tools)
      ? inp.tools.filter((t): t is string => typeof t === "string")
      : [];
    const summary =
      tools.length > 0
        ? tools
            .map((t) => {
              const parsed = parseNamespacedMcpTool(t);
              return parsed.server ? `${parsed.server}/${parsed.action}` : t;
            })
            .join(", ")
        : "...";
    return {
      kind: "describe",
      name: "MCP Schema",
      summary,
    };
  }

  if (toolName === "tool_call") {
    const targetTool = typeof inp.tool === "string" ? inp.tool : "";
    const targetArgs =
      inp.arguments && typeof inp.arguments === "object"
        ? (inp.arguments as Record<string, unknown>)
        : undefined;
    const parsed = parseNamespacedMcpTool(targetTool);
    const compactArgs = formatCompactArgs(targetArgs);
    return {
      kind: "mcp",
      name: parsed.server ? `MCP · ${parsed.server}` : "MCP",
      summary: compactArgs
        ? `${parsed.action || "..."} (${compactArgs})`
        : parsed.action || "...",
    };
  }

  const parsed = parseNamespacedMcpTool(toolName);
  const compactArgs = formatCompactArgs(inp);
  return {
    kind: "mcp",
    name: parsed.server ? `MCP · ${parsed.server}` : "MCP",
    summary: compactArgs ? `${parsed.action} (${compactArgs})` : parsed.action,
  };
}

export function McpRenderer({
  part,
  state,
  toolName,
  onApprove,
  onDeny,
}: McpRendererProps) {
  const input =
    part.input && typeof part.input === "object"
      ? (part.input as Record<string, unknown>)
      : undefined;

  const { kind, name, summary } = resolveMcpToolDisplay(toolName, input);

  const icon =
    kind === "search" ? (
      <Search className="h-3.5 w-3.5" />
    ) : kind === "describe" ? (
      <FileCode2 className="h-3.5 w-3.5" />
    ) : (
      <Plug className="h-3.5 w-3.5" />
    );

  const output =
    "output" in part ? (part as { output?: unknown }).output : undefined;

  const inputText = stringifyForPre(input);
  const outputText =
    part.state === "output-available" ? stringifyForPre(output) : null;

  const expandedContent =
    inputText || outputText ? (
      <div className="space-y-2">
        {inputText && (
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              Parameters
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
              {inputText}
            </pre>
          </div>
        )}
        {outputText && (
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              Response
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
              {outputText}
            </pre>
          </div>
        )}
      </div>
    ) : undefined;

  const meta = part.state === "output-available" ? "Done" : undefined;

  return (
    <ToolLayout
      name={name}
      summary={summary}
      summaryClassName="font-mono"
      icon={icon}
      meta={meta}
      state={state}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
