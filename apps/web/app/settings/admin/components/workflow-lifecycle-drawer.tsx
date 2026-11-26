"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { WorkflowRunLifecycleDetail } from "@/lib/db/workflow-telemetry";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function WorkflowLifecycleDrawer({
  workflowRunId,
  onClose,
}: {
  workflowRunId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<WorkflowRunLifecycleDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowRunId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(
      `/api/admin/telemetry/workflow/${encodeURIComponent(workflowRunId)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as WorkflowRunLifecycleDetail;
      })
      .then((json) => {
        if (!cancelled) setDetail(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load lifecycle",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workflowRunId]);

  if (!workflowRunId) return null;

  const sessionId = detail?.telemetry?.sessionId ?? detail?.run?.sessionId;
  const chatId = detail?.telemetry?.chatId ?? detail?.run?.chatId;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workflow lifecycle"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <button
        type="button"
        aria-label="Close lifecycle drawer"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/40"
      />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              Workflow lifecycle
            </div>
            <div className="truncate font-mono text-sm font-medium text-foreground">
              {workflowRunId}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessionId && chatId && (
              <a
                href={`/sessions/${sessionId}/chats/${chatId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Open chat
                <ExternalLink className="size-3" strokeWidth={1.6} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close lifecycle drawer"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" strokeWidth={1.6} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
          {loading ? (
            <p className="text-muted-foreground">Loading workflow lifecycle…</p>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : !detail ? (
            <p className="text-muted-foreground">No lifecycle data found.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">
                    Status
                  </div>
                  <div className="mt-1 font-mono font-medium text-foreground">
                    {detail.run?.status ??
                      detail.telemetry?.finishReason ??
                      "—"}
                  </div>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">
                    Duration
                  </div>
                  <div className="mt-1 font-mono font-medium tabular-nums text-foreground">
                    {formatDuration(
                      detail.run?.totalDurationMs ??
                        detail.telemetry?.durationMs ??
                        0,
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">
                    LLM steps
                  </div>
                  <div className="mt-1 font-mono font-medium tabular-nums text-foreground">
                    {detail.telemetry?.llmSteps ?? detail.steps.length}
                  </div>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">
                    Serialized
                  </div>
                  <div className="mt-1 font-mono font-medium tabular-nums text-foreground">
                    {formatBytes(detail.telemetry?.totalSerializedBytes ?? 0)}
                  </div>
                </div>
              </div>

              {detail.run?.errorMessage && (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
                  <div className="font-medium text-red-500">Error</div>
                  <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-foreground">
                    {detail.run.errorMessage}
                  </pre>
                </div>
              )}

              {detail.telemetry &&
                Object.keys(detail.telemetry.stepCounts).length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium text-foreground">
                      Workflow step calls
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {Object.entries(detail.telemetry.stepCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, calls]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5"
                          >
                            <span className="truncate font-mono text-[11px] text-muted-foreground">
                              {name}
                            </span>
                            <span className="font-mono text-[11px] font-medium tabular-nums text-foreground">
                              {calls}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {detail.steps.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-foreground">
                    Step execution timeline ({detail.steps.length})
                  </h3>
                  <div className="overflow-x-auto rounded-md border border-border/70">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="border-b border-border/70 bg-muted/30 text-muted-foreground">
                        <tr>
                          <th className="px-2.5 py-1.5 font-normal">#</th>
                          <th className="px-2.5 py-1.5 font-normal">
                            Duration
                          </th>
                          <th className="px-2.5 py-1.5 font-normal">Finish</th>
                          <th className="px-2.5 py-1.5 font-normal">Started</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {detail.steps.map((s) => (
                          <tr key={s.id}>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {s.stepNumber}
                            </td>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {formatDuration(s.durationMs)}
                            </td>
                            <td className="px-2.5 py-1.5">
                              {s.finishReason ?? s.rawFinishReason ?? "—"}
                            </td>
                            <td className="px-2.5 py-1.5 text-muted-foreground">
                              {new Date(s.startedAt).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {detail.latestMessageBreakdown.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-foreground">
                    Per-step token &amp; cost breakdown (
                    {detail.latestMessageBreakdown.length})
                  </h3>
                  <div className="overflow-x-auto rounded-md border border-border/70">
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="border-b border-border/70 bg-muted/30 text-muted-foreground">
                        <tr>
                          <th className="px-2.5 py-1.5 font-normal">#</th>
                          <th className="px-2.5 py-1.5 font-normal">Input</th>
                          <th className="px-2.5 py-1.5 font-normal">Cached</th>
                          <th className="px-2.5 py-1.5 font-normal">Output</th>
                          <th className="px-2.5 py-1.5 font-normal">Cost</th>
                          <th className="px-2.5 py-1.5 font-normal">Tools</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {detail.latestMessageBreakdown.map((b) => (
                          <tr key={b.stepNumber}>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {b.stepNumber}
                            </td>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {b.inputTokens?.toLocaleString() ?? "—"}
                            </td>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {b.cachedInputTokens?.toLocaleString() ?? "—"}
                            </td>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {b.outputTokens?.toLocaleString() ?? "—"}
                            </td>
                            <td className="px-2.5 py-1.5 tabular-nums">
                              {typeof b.cost === "number"
                                ? `$${b.cost.toFixed(4)}`
                                : "—"}
                            </td>
                            <td className="max-w-[160px] truncate px-2.5 py-1.5 text-muted-foreground">
                              {b.toolCallNames?.join(", ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {detail.compactions.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-foreground">
                    Compaction events ({detail.compactions.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.compactions.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <span>
                          {c.tokensBefore?.toLocaleString() ?? "?"} →{" "}
                          {c.tokensAfter?.toLocaleString() ?? "?"} tokens
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.diagnosticEvents.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-medium text-foreground">
                    Stream &amp; glitch diagnostics (
                    {detail.diagnosticEvents.length})
                  </h3>
                  <div className="space-y-1.5">
                    {detail.diagnosticEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-md border border-border/60 px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">
                            {ev.eventType}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(ev.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {Object.keys(ev.details).length > 0 && (
                          <pre className="mt-1 whitespace-pre-wrap break-all text-[10.5px] text-muted-foreground">
                            {JSON.stringify(ev.details)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
