"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";
import type { WorkflowTelemetrySummary } from "@/lib/db/workflow-telemetry";
import { WorkflowLifecycleDrawer } from "./workflow-lifecycle-drawer";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

export function AdminWorkflowSection({
  windowParam = "all",
}: {
  windowParam?: string;
}) {
  const [data, setData] = useState<WorkflowTelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiWindow =
        windowParam === "24h" ||
        windowParam === "7d" ||
        windowParam === "30d" ||
        windowParam === "all"
          ? windowParam
          : "all";
      const params = new URLSearchParams({
        window: apiWindow,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      const res = await fetch(
        `/api/admin/telemetry/workflow?${params.toString()}`,
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
  }, [windowParam, page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const pagination = data?.pagination;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity
            className="size-4 text-muted-foreground"
            strokeWidth={1.6}
          />
          <h2 className="text-sm font-medium text-foreground">
            Workflow events &amp; lifecycle telemetry
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.6}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search workflow ID, chat, model…"
              className="h-7 w-56 rounded-md border border-border bg-background pr-2.5 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            aria-label="Rows per page"
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
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
      </div>

      {error ? (
        <p className="text-xs text-red-500">{error}</p>
      ) : loading && !data ? (
        <p className="text-xs text-muted-foreground">
          Loading workflow telemetry…
        </p>
      ) : !data || data.totalRuns === 0 ? (
        <p className="text-xs text-muted-foreground">
          No workflow runs recorded matching this filter.
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
              <div className="text-[11px] text-muted-foreground">
                Retries recovered
              </div>
              <div className="mt-1 font-mono text-base font-medium tabular-nums">
                {data.totalRetryRecoveries.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border/70">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/70 bg-muted/30 text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Workflow ID</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Steps</th>
                  <th className="px-3 py-2 font-medium">Events</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Finish</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50 font-mono text-[11px]">
                {data.topRuns.map((run) => (
                  <tr
                    key={`${run.workflowRunId}-${run.createdAt}`}
                    className="transition-colors hover:bg-muted/20"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRunId(run.workflowRunId)}
                        className="cursor-pointer text-left text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                      >
                        {run.workflowRunId.slice(0, 18)}…
                      </button>
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-muted-foreground">
                      {run.modelId ?? "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {run.llmSteps} / {run.totalStepCalls}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {run.estimatedEvents.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDuration(run.durationMs)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {run.finishReason}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.totalCount,
                )}{" "}
                of {pagination.totalCount.toLocaleString()} workflows
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="size-3.5" strokeWidth={1.6} />
                  Prev
                </button>
                <span className="px-2 font-mono text-[11px] tabular-nums">
                  Page {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() =>
                    setPage((p) => Math.min(pagination.totalPages, p + 1))
                  }
                  className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="size-3.5" strokeWidth={1.6} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <WorkflowLifecycleDrawer
        workflowRunId={selectedRunId}
        onClose={() => setSelectedRunId(null)}
      />
    </section>
  );
}
