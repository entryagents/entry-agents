"use client";

import { ExternalLink, Plug, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

  const [liveConnected, setLiveConnected] = useState<boolean | null>(null);
  const [deniedByUser, setDeniedByUser] = useState(false);

  const toolkit =
    (typeof output?.toolkit === "string" && output.toolkit) ||
    (typeof input.toolkit === "string" && input.toolkit) ||
    "integration";

  function handleDenyConnect(targetToolkit: string) {
    setDeniedByUser(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("entry:composio-connect-denied", {
          detail: { toolkit: targetToolkit },
        }),
      );
    }
  }

  const verifyConnectionSilently = useCallback(
    async (targetToolkit: string) => {
      if (!targetToolkit || targetToolkit === "integration") return;
      try {
        const res = await fetch(
          `/api/composio/toolkits?q=${encodeURIComponent(targetToolkit)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            toolkits?: Array<{ slug: string; isConnected: boolean }>;
          };
          const found = data.toolkits?.find(
            (t) => t.slug.toLowerCase() === targetToolkit.toLowerCase(),
          );
          if (found?.isConnected) {
            setLiveConnected(true);
          }
        }
      } catch {
        // Ignore transient verification errors
      }
    },
    [],
  );

  const isManageConnections =
    effectiveToolName === "COMPOSIO_MANAGE_CONNECTIONS";
  const outputAlreadyConnected =
    output?.isConnected === true ||
    (typeof output?.status === "string" &&
      output.status.toUpperCase() === "ACTIVE");

  // Automatically verify connection status on mount and when the user returns
  // to this tab/page after completing OAuth — no manual Verify click required.
  useEffect(() => {
    if (
      !isManageConnections ||
      outputAlreadyConnected ||
      liveConnected === true ||
      deniedByUser ||
      toolkit === "integration"
    ) {
      return;
    }
    void verifyConnectionSilently(toolkit);
    const onFocusOrVisible = () => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        void verifyConnectionSilently(toolkit);
      }
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [
    deniedByUser,
    isManageConnections,
    liveConnected,
    outputAlreadyConnected,
    toolkit,
    verifyConnectionSilently,
  ]);

  if (isManageConnections) {
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
      !isErrorResult && (liveConnected ?? outputAlreadyConnected);

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
                    : deniedByUser
                      ? "bg-muted text-muted-foreground"
                      : isConnected
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {isErrorResult
                  ? "Setup required"
                  : deniedByUser
                    ? "Denied"
                    : isConnected
                      ? "Connected"
                      : status}
              </span>
            </div>
            <p className="text-muted-foreground">
              {isErrorResult
                ? (errorMessage ??
                  `Unable to connect ${toolkit}. Check your integration configuration.`)
                : deniedByUser
                  ? `You declined connecting ${toolkit}.`
                  : isConnected
                    ? `Your ${toolkit} account is connected and ready for tool execution.`
                    : `Authorize ${toolkit} via Composio to allow the agent to continue this task.`}
            </p>
          </div>

          {!isErrorResult && !deniedByUser && !isConnected ? (
            <div className="flex items-center gap-2">
              {connectLinkUrl ? (
                <a
                  href={connectLinkUrl}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90"
                >
                  <span>Connect {toolkit}</span>
                  <ExternalLink className="size-3.5" strokeWidth={1.5} />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => handleDenyConnect(toolkit)}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span>Deny</span>
              </button>
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
            : deniedByUser
              ? "Denied"
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
        onConnected={() => setLiveConnected(true)}
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
  onConnected,
  onApprove,
  onDeny,
}: {
  toolkit: string;
  summary: string;
  state: ToolRenderState;
  isConnected: boolean;
  onConnected: () => void;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [deniedByUser, setDeniedByUser] = useState(false);

  useEffect(() => {
    if (isConnected || deniedByUser || !toolkit || toolkit === "integration") {
      return;
    }
    const check = async () => {
      try {
        const res = await fetch(
          `/api/composio/toolkits?q=${encodeURIComponent(toolkit)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as {
            toolkits?: Array<{ slug: string; isConnected: boolean }>;
          };
          const found = data.toolkits?.find(
            (t) => t.slug.toLowerCase() === toolkit.toLowerCase(),
          );
          if (found?.isConnected) {
            onConnected();
          }
        }
      } catch {
        // Ignore transient verification errors
      }
    };
    void check();
    const onFocusOrVisible = () => {
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        void check();
      }
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);
    return () => {
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [deniedByUser, isConnected, onConnected, toolkit]);

  function handleDeny() {
    setDeniedByUser(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("entry:composio-connect-denied", {
          detail: { toolkit },
        }),
      );
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setConnectError(null);
    try {
      const returnPath =
        typeof window !== "undefined"
          ? window.location.pathname
          : "/settings/connections";
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          toolkit,
          returnPath,
        }),
      });
      const data = (await res.json()) as {
        redirectUrl?: string;
        error?: string;
      };
      if (res.ok && data.redirectUrl) {
        window.location.assign(data.redirectUrl);
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
      meta={
        deniedByUser ? "Denied" : isConnected ? "Connected" : "Action required"
      }
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
                    deniedByUser
                      ? "bg-muted text-muted-foreground"
                      : isConnected
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {deniedByUser
                    ? "Denied"
                    : isConnected
                      ? "Connected"
                      : "Not connected"}
                </span>
              </div>
              <p className="text-muted-foreground">
                {connectError
                  ? connectError
                  : deniedByUser
                    ? `You declined connecting ${toolkit}.`
                    : isConnected
                      ? `Your ${toolkit} account is connected and ready.`
                      : `Connect your ${toolkit} account so the agent can run this tool.`}
              </p>
            </div>
            {!deniedByUser && !isConnected ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <span>
                    {connecting ? "Connecting..." : `Connect ${toolkit}`}
                  </span>
                  <ExternalLink className="size-3.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={handleDeny}
                  className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <span>Deny</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      }
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
