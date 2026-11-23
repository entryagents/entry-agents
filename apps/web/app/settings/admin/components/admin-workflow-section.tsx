"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { WorkflowTelemetrySummary } from "@/lib/db/workflow-telemetry";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

export function AdminWorkflowSection({
  windowParam = "7d",
}: {
  windowParam?: string;
}) {
  const [data, setData] = useState<WorkflowTelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiWindow =
        windowParam === "24h" || windowParam === "30d" ? windowParam : "7d";
      const res = await fetch(
        `/api/admin/telemetry/workflow?window=${apiWindow}`,
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as WorkflowTelemetrySummary;
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load workflow telemetry",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowParam]);

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity
            className="size-4 text-muted-foreground"
            strokeWidth={1.6}
          />
          <h2 className="text-sm font-medium text-foreground">
            Workflow events &amp; step telemetry
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={`size-3 ${loading ? "animate-spin" : ""}`}
            strokeWidth={1.6}
          />
          Refresh
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : loading && !data ? (
        <p className="text-xs text-muted-foreground">
          Loading workflow telemetry…
        </p>
      ) : !data || data.totalRuns === 0 ? (
        <p className="text-xs text-muted-foreground">
          No workflow runs recorded in this window yet.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Runs</div>
              <div className="mt-1 font-mono text-base font-medium tabular-nums">
                {data.totalRuns.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Est. events
              </div>
              <div className="mt-1 font-mono text-base font-medium tabular-nums">
                {data.totalEstimatedEvents.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">
                Avg events / run
              </div>
              <div className="mt-1 font-mono text-base font-medium tabular-nums">
                {data.avgEventsPerRun.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">LLM steps</div>
              <div className="mt-1 font-mono text-base font-medium tabular-nums">
                {data.totalLlmSteps.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground">Retries</div>
              <div className="mt-1 font-mono text-base font-medium tabular-nums">
                {data.totalRetryRecoveries.toLocaleString()}
              </div>
            </div>
          </div>

          {data.stepBreakdown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Step</th>
                    <th className="py-1.5 px-3 text-right font-medium">
                      Calls
                    </th>
                    <th className="py-1.5 pl-3 text-right font-medium">
                      Est. events
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.stepBreakdown.map((row) => (
                    <tr
                      key={row.stepName}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-1.5 pr-4 font-mono text-foreground">
                        {row.stepName}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums text-muted-foreground">
                        {row.calls.toLocaleString()}
                      </td>
                      <td className="py-1.5 pl-3 text-right font-mono tabular-nums text-foreground">
                        {row.estimatedEvents.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.topRuns.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Run ID</th>
                    <th className="py-1.5 px-2 font-medium">Model</th>
                    <th className="py-1.5 px-2 text-right font-medium">
                      LLM steps
                    </th>
                    <th className="py-1.5 px-2 text-right font-medium">
                      Events
                    </th>
                    <th className="py-1.5 px-2 text-right font-medium">
                      Duration
                    </th>
                    <th className="py-1.5 pl-2 text-right font-medium">
                      Finish
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.topRuns.slice(0, 10).map((run) => (
                    <tr
                      key={run.workflowRunId}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-1.5 pr-3 font-mono text-[11px] text-foreground">
                        {run.workflowRunId.slice(0, 18)}
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground">
                        {run.modelId ?? "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {run.llmSteps}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums">
                        {run.estimatedEvents}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="py-1.5 pl-2 text-right text-muted-foreground">
                        {run.finishReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
