"use client";

import {
  CheckCircle2,
  ExternalLink,
  Plug,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState } from "react";
import type { ToolRenderState } from "@/app/lib/render-tool";
import type { WebAgentUIToolPart } from "@/app/types";
import { ToolLayout } from "../tool-layout";
import { ToolkitBrandIcon } from "@/components/toolkit-icons";

const COMPOSIO_TOOLS = new Set([
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_MANAGE_CONNECTIONS",
  "COMPOSIO_WAIT_FOR_CONNECTIONS",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_MULTI_EXECUTE",
]);

export function isComposioMetaTool(toolName: string): boolean {
  return COMPOSIO_TOOLS.has(toolName) || toolName.startsWith("COMPOSIO_");
}

export interface ComposioToolRendererProps {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
  toolName: string;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}

export function ComposioToolRenderer({
  part,
  state,
  toolName,
  onApprove,
  onDeny,
}: ComposioToolRendererProps) {
  const input = (part.input as Record<string, unknown> | undefined) ?? {};
  const output =
    part.state === "output-available" &&
    typeof part.output === "object" &&
    part.output !== null
      ? (part.output as Record<string, unknown>)
      : null;

  const [checkingStatus, setCheckingStatus] = useState(false);
  const [liveConnected, setLiveConnected] = useState<boolean | null>(null);

  const toolkit =
    (typeof output?.toolkit === "string" && output.toolkit) ||
    (typeof input.toolkit === "string" && input.toolkit) ||
    "integration";

  async function handleVerifyConnection() {
    setCheckingStatus(true);
    try {
      const res = await fetch(
        `/api/composio/toolkits?q=${encodeURIComponent(toolkit)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          toolkits?: Array<{ slug: string; isConnected: boolean }>;
        };
        const found = data.toolkits?.find(
          (t) => t.slug.toLowerCase() === toolkit.toLowerCase(),
        );
        if (found?.isConnected) {
          setLiveConnected(true);
        }
      }
    } finally {
      setCheckingStatus(false);
    }
  }

  if (toolName === "COMPOSIO_MANAGE_CONNECTIONS") {
    const connectLinkUrl =
      typeof output?.connectLinkUrl === "string" ? output.connectLinkUrl : null;
    const status =
      typeof output?.status === "string" ? output.status : "INITIATED";
    const alias = typeof output?.alias === "string" ? output.alias : null;
    const isConnected =
      liveConnected ??
      (output?.isConnected === true || status.toUpperCase() === "ACTIVE");

    const expandedContent = (
      <div className="mt-1 rounded-lg border border-border bg-card p-3.5 text-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize text-foreground">
                {toolkit}
              </span>
              {alias ? (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {alias}
                </span>
              ) : null}
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  isConnected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {isConnected ? "Active" : status}
              </span>
            </div>
            <p className="text-muted-foreground">
              {isConnected
                ? `Your ${toolkit} account is connected and ready for tool execution.`
                : `Authorize ${toolkit} via Composio to allow the agent to continue this task.`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {connectLinkUrl && !isConnected ? (
              <a
                href={connectLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
              >
                <span>Connect {toolkit}</span>
                <ExternalLink className="size-3.5" strokeWidth={1.5} />
              </a>
            ) : null}
            {!isConnected ? (
              <button
                type="button"
                onClick={handleVerifyConnection}
                disabled={checkingStatus}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw
                  className={`size-3.5 ${checkingStatus ? "animate-spin" : ""}`}
                  strokeWidth={1.5}
                />
                <span>Verify</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                <span>Verified</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );

    return (
      <ToolLayout
        icon={
          <ToolkitBrandIcon
            slug={toolkit}
            logo={`https://logos.composio.dev/api/${toolkit.toLowerCase()}`}
            className="h-3.5 w-3.5"
          />
        }
        name="Connect"
        summary={`${toolkit}${alias ? ` (${alias})` : ""}`}
        meta={isConnected ? "Connected" : "Action required"}
        state={state}
        expandedContent={expandedContent}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
  }

  if (toolName === "COMPOSIO_SEARCH_TOOLS") {
    const query = typeof input.query === "string" ? input.query : "...";
    return (
      <ToolLayout
        icon={<Search className="h-3.5 w-3.5" />}
        name="Search Integrations"
        summary={query}
        meta={part.state === "output-available" ? "Done" : undefined}
        state={state}
        expandedContent={
          output ? (
            <pre className="mt-1.5 max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(output, null, 2)}
            </pre>
          ) : undefined
        }
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
  }

  const toolsList = Array.isArray(input.tools)
    ? input.tools
        .map((t) =>
          typeof t === "object" && t !== null && "toolSlug" in t
            ? String((t as { toolSlug: unknown }).toolSlug)
            : "",
        )
        .filter(Boolean)
    : [];
  const inferredToolkit = toolsList[0]?.split("_")[0]?.toLowerCase() || toolkit;
  const summary =
    toolsList.length > 0
      ? toolsList.join(", ")
      : JSON.stringify(input).slice(0, 60);

  return (
    <ToolLayout
      icon={
        inferredToolkit && inferredToolkit !== "integration" ? (
          <ToolkitBrandIcon
            slug={inferredToolkit}
            logo={`https://logos.composio.dev/api/${inferredToolkit}`}
            className="h-3.5 w-3.5"
          />
        ) : (
          <Plug className="h-3.5 w-3.5" />
        )
      }
      name={
        toolName === "COMPOSIO_MULTI_EXECUTE_TOOL" ||
        toolName === "COMPOSIO_MULTI_EXECUTE"
          ? "Integration Execute"
          : "Integration Tool"
      }
      summary={summary}
      meta={part.state === "output-available" ? "Done" : undefined}
      state={state}
      expandedContent={
        output ? (
          <pre className="mt-1.5 max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(output, null, 2)}
          </pre>
        ) : undefined
      }
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
