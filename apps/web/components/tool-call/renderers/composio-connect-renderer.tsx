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

export function resolveComposioToolCall(
  toolName: string,
  part: WebAgentUIToolPart,
): {
  effectiveToolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
} | null {
  const rawInput =
    typeof part.input === "object" && part.input !== null
      ? (part.input as Record<string, unknown>)
      : {};
  const rawOutput =
    part.state === "output-available" &&
    typeof part.output === "object" &&
    part.output !== null
      ? (part.output as Record<string, unknown>)
      : null;

  let effectiveToolName = toolName;
  let input = rawInput;
  let output = rawOutput;

  if (toolName === "tool_call" && typeof rawInput.tool === "string") {
    effectiveToolName = rawInput.tool;
    if (
      typeof rawInput.arguments === "object" &&
      rawInput.arguments !== null &&
      !Array.isArray(rawInput.arguments)
    ) {
      input = rawInput.arguments as Record<string, unknown>;
    } else if (
      typeof rawInput.input === "object" &&
      rawInput.input !== null &&
      !Array.isArray(rawInput.input)
    ) {
      input = rawInput.input as Record<string, unknown>;
    }
    if (
      rawOutput &&
      typeof rawOutput.result === "object" &&
      rawOutput.result !== null &&
      !Array.isArray(rawOutput.result)
    ) {
      output = rawOutput.result as Record<string, unknown>;
    }
  }

  if (!isComposioMetaTool(effectiveToolName)) {
    return null;
  }

  return { effectiveToolName, input, output };
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
  const resolved = resolveComposioToolCall(toolName, part);
  const effectiveToolName = resolved?.effectiveToolName ?? toolName;
  const input = resolved?.input ?? {};
  const output = resolved?.output ?? null;

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

  if (effectiveToolName === "COMPOSIO_MANAGE_CONNECTIONS") {
    const isErrorResult = output?.action === "error";
    const errorMessage =
      isErrorResult && typeof output?.message === "string"
        ? output.message
        : null;
    const connectLinkUrl =
      typeof output?.connectLinkUrl === "string" ? output.connectLinkUrl : null;
    const status =
      typeof output?.status === "string" ? output.status : "INITIATED";
    const alias = typeof output?.alias === "string" ? output.alias : null;
    const isConnected =
      !isErrorResult &&
      (liveConnected ??
        (output?.isConnected === true || status.toUpperCase() === "ACTIVE"));

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
                  isErrorResult
                    ? "bg-destructive/10 text-destructive"
                    : isConnected
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {isErrorResult
                  ? "Setup required"
                  : isConnected
                    ? "Active"
                    : status}
              </span>
            </div>
            <p className="text-muted-foreground">
              {isErrorResult
                ? (errorMessage ??
                  `Unable to connect ${toolkit}. Check your integration configuration.`)
                : isConnected
                  ? `Your ${toolkit} account is connected and ready for tool execution.`
                  : `Authorize ${toolkit} via Composio to allow the agent to continue this task.`}
            </p>
          </div>

          {!isErrorResult ? (
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
          ) : null}
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
        meta={
          isErrorResult
            ? "Setup required"
            : isConnected
              ? "Connected"
              : "Action required"
        }
        state={state}
        defaultExpanded={!isConnected || isErrorResult}
        expandedContent={expandedContent}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
  }

  if (effectiveToolName === "COMPOSIO_SEARCH_TOOLS") {
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

  const outputResults = Array.isArray(output?.results)
    ? (output.results as Array<Record<string, unknown>>)
    : [];
  const connectionFailure = outputResults.find((item) => {
    const code = typeof item?.code === "string" ? item.code : "";
    return (
      item?.success === false &&
      (code === "CONNECTION_REQUIRED" ||
        code === "CONNECTION_EXPIRED" ||
        code === "CONNECTION_FAILED" ||
        code === "CONNECTION_INACTIVE")
    );
  });

  if (connectionFailure) {
    const failedSlug =
      typeof connectionFailure.toolSlug === "string"
        ? connectionFailure.toolSlug.split("_")[0]?.toLowerCase() ||
          inferredToolkit
        : inferredToolkit;
    const isConnected = liveConnected === true;
    return (
      <ComposioInlineConnectCard
        toolkit={failedSlug}
        summary={summary}
        state={state}
        isConnected={isConnected}
        checkingStatus={checkingStatus}
        onVerify={handleVerifyConnection}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
  }

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
        effectiveToolName === "COMPOSIO_MULTI_EXECUTE_TOOL" ||
        effectiveToolName === "COMPOSIO_MULTI_EXECUTE"
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

function ComposioInlineConnectCard({
  toolkit,
  summary,
  state,
  isConnected,
  checkingStatus,
  onVerify,
  onApprove,
  onDeny,
}: {
  toolkit: string;
  summary: string;
  state: ToolRenderState;
  isConnected: boolean;
  checkingStatus: boolean;
  onVerify: () => void;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkitSlug: toolkit }),
      });
      const data = (await res.json()) as {
        redirectUrl?: string;
        error?: string;
      };
      if (res.ok && data.redirectUrl) {
        window.open(data.redirectUrl, "_blank", "noopener,noreferrer");
      } else {
        setConnectError(data.error ?? `Unable to start ${toolkit} connection.`);
      }
    } catch {
      setConnectError(`Unable to reach server to connect ${toolkit}.`);
    } finally {
      setConnecting(false);
    }
  }

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
      summary={summary}
      meta={isConnected ? "Connected" : "Action required"}
      state={state}
      defaultExpanded={!isConnected}
      expandedContent={
        <div className="mt-1 rounded-lg border border-border bg-card p-3.5 text-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize text-foreground">
                  {toolkit}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    isConnected
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {isConnected ? "Active" : "Not connected"}
                </span>
              </div>
              <p className="text-muted-foreground">
                {connectError
                  ? connectError
                  : isConnected
                    ? `Your ${toolkit} account is connected and ready.`
                    : `Connect your ${toolkit} account so the agent can run this tool.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isConnected ? (
                <>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <span>
                      {connecting ? "Opening..." : `Connect ${toolkit}`}
                    </span>
                    <ExternalLink className="size-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={onVerify}
                    disabled={checkingStatus}
                    className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`size-3.5 ${checkingStatus ? "animate-spin" : ""}`}
                      strokeWidth={1.5}
                    />
                    <span>Verify</span>
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                  <span>Verified</span>
                </span>
              )}
            </div>
          </div>
        </div>
      }
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
