"use client";

import { FileCode2, Plug, Search } from "lucide-react";
import type { ToolRenderState } from "@/app/lib/render-tool";
import type { WebAgentUIToolPart } from "@/app/types";
import { ToolkitBrandIcon } from "@/components/toolkit-icons";
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

const SERVER_DISPLAY_NAMES: Record<string, string> = {
  gmail: "Gmail",
  github: "GitHub",
  vercel: "Vercel",
  slack: "Slack",
  linear: "Linear",
  notion: "Notion",
  googlecalendar: "Google Calendar",
  google_calendar: "Google Calendar",
  googledrive: "Google Drive",
  google_drive: "Google Drive",
  googledocs: "Google Docs",
  google_docs: "Google Docs",
  googlesheets: "Google Sheets",
  google_sheets: "Google Sheets",
  figma: "Figma",
  jira: "Jira",
  discord: "Discord",
  stripe: "Stripe",
  hubspot: "HubSpot",
  airtable: "Airtable",
  salesforce: "Salesforce",
  twitter: "X",
  x: "X",
};

const SLUG_ALIASES: Record<string, string> = {
  google_calendar: "googlecalendar",
  google_drive: "googledrive",
  google_docs: "googledocs",
  google_sheets: "googlesheets",
  gcal: "googlecalendar",
  gdrive: "googledrive",
  gdocs: "googledocs",
  gsheets: "googlesheets",
};

function normalizeToolkitSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^composio[-_]/, "")
    .replace(/[-_]mcp$/, "")
    .trim();
  return SLUG_ALIASES[cleaned] ?? cleaned;
}

function formatHumanActionName(action: string, slug: string | null): string {
  let cleaned = action.trim();
  if (slug) {
    const prefixRegex = new RegExp(`^${slug.replace(/_/g, "_?")}_+`, "i");
    cleaned = cleaned.replace(prefixRegex, "");
  }
  const words = cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_-]+/)
    .filter(Boolean);
  if (words.length === 0) return action;
  return words
    .map((w, idx) =>
      idx === 0
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w.toLowerCase(),
    )
    .join(" ");
}

function resolveToolkitSlugForMcp(
  server: string | null,
  action: string,
): string | null {
  if (server && server.toLowerCase() !== "composio") {
    return normalizeToolkitSlug(server);
  }
  const upperMatch = action.match(/^([A-Z][A-Z0-9]+)_/);
  if (upperMatch) {
    return normalizeToolkitSlug(upperMatch[1]);
  }
  return null;
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
              const slug = resolveToolkitSlugForMcp(
                parsed.server,
                parsed.action,
              );
              return formatHumanActionName(parsed.action, slug);
            })
            .join(", ")
        : "...";
    return {
      kind: "describe",
      name: "MCP Schema",
      summary,
    };
  }

  const targetTool =
    toolName === "tool_call" && typeof inp.tool === "string"
      ? inp.tool
      : toolName;
  const targetArgs =
    toolName === "tool_call" &&
    inp.arguments &&
    typeof inp.arguments === "object"
      ? (inp.arguments as Record<string, unknown>)
      : inp;

  const parsed = parseNamespacedMcpTool(targetTool);
  const slug = resolveToolkitSlugForMcp(parsed.server, parsed.action);
  const displayServer = slug
    ? (SERVER_DISPLAY_NAMES[slug] ??
      slug.charAt(0).toUpperCase() + slug.slice(1))
    : "MCP";
  const humanAction = formatHumanActionName(parsed.action || "...", slug);
  const compactArgs = formatCompactArgs(targetArgs);

  return {
    kind: "mcp",
    name: displayServer,
    summary: compactArgs ? `${humanAction} · ${compactArgs}` : humanAction,
  };
}

function extractReadableMcpOutput(output: unknown): {
  text: string | null;
  raw: string | null;
} {
  if (output === undefined || output === null) {
    return { text: null, raw: null };
  }
  const raw = stringifyForPre(output);

  if (typeof output === "string") {
    return { text: output, raw };
  }

  if (typeof output === "object" && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      const textParts = obj.content
        .filter(
          (item): item is { type?: string; text?: string } =>
            Boolean(item) &&
            typeof item === "object" &&
            typeof (item as { text?: unknown }).text === "string",
        )
        .map((item) => item.text?.trim() ?? "")
        .filter(Boolean);
      if (textParts.length > 0) {
        return { text: textParts.join("\n\n"), raw };
      }
    }
  }

  return { text: null, raw };
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
  const parsed = parseNamespacedMcpTool(
    toolName === "tool_call" && typeof input?.tool === "string"
      ? input.tool
      : toolName,
  );
  const toolkitSlug =
    kind === "mcp"
      ? resolveToolkitSlugForMcp(parsed.server, parsed.action)
      : null;

  const icon =
    kind === "search" ? (
      <Search className="h-3.5 w-3.5" />
    ) : kind === "describe" ? (
      <FileCode2 className="h-3.5 w-3.5" />
    ) : toolkitSlug ? (
      <ToolkitBrandIcon slug={toolkitSlug} className="size-3.5 shrink-0" />
    ) : (
      <Plug className="h-3.5 w-3.5" />
    );

  const output =
    "output" in part ? (part as { output?: unknown }).output : undefined;

  const inputText = stringifyForPre(input);
  const { text: readableOutput, raw: rawOutput } =
    part.state === "output-available"
      ? extractReadableMcpOutput(output)
      : { text: null, raw: null };

  const expandedContent =
    inputText || readableOutput || rawOutput ? (
      <div className="sable-detail-stack">
        {inputText && inputText !== "{}" && (
          <div className="sable-term">
            <div className="sable-term-cmd">
              <span className="sable-detail-label">Input</span>
            </div>
            <div className="sable-term-out">
              <pre>{inputText}</pre>
            </div>
          </div>
        )}
        {(readableOutput || rawOutput) && (
          <div className="sable-term">
            <div className="sable-term-cmd">
              <span className="sable-detail-label">Result</span>
            </div>
            <div className="sable-term-out">
              <pre>{readableOutput ?? rawOutput}</pre>
            </div>
          </div>
        )}
      </div>
    ) : undefined;

  const meta = part.state === "output-available" ? "Done" : undefined;

  return (
    <ToolLayout
      name={name}
      summary={summary}
      icon={icon}
      meta={meta}
      state={state}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
