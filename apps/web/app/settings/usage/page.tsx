"use client";

import { formatTokens } from "@entry-agents/shared";
import { useMemo, useState } from "react";
import useSWR from "swr";
import type { DateRange } from "react-day-picker";
import { ContributionChart } from "@/components/contribution-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { estimateModelUsageCost, type AvailableModel } from "@/lib/models";
import { fetcher } from "@/lib/swr";
import { formatDateOnly } from "@/lib/usage/date-range";
import type { UsageInsights, UsageRepositoryInsight } from "@/lib/usage/types";
import { UsageInsightsSection } from "./usage-insights-section";

interface DailyUsageRow {
  date: string;
  source: "web";
  agentType: "main" | "subagent";
  provider: string | null;
  modelId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
  costUsd: number | null;
}

interface MergedDay {
  date: string;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
}

interface ModelUsage {
  modelId: string;
  provider: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
}

interface UsageResponse {
  usage: DailyUsageRow[];
  insights: UsageInsights;
}

interface ModelsResponse {
  models: AvailableModel[];
}

interface CostEstimateSummary {
  amount: number;
  pricedTokens: number;
  totalTokens: number;
}

function sumRows(rows: DailyUsageRow[]) {
  return rows.reduce(
    (acc, d) => ({
      inputTokens: acc.inputTokens + d.inputTokens,
      cachedInputTokens: acc.cachedInputTokens + d.cachedInputTokens,
      outputTokens: acc.outputTokens + d.outputTokens,
      messageCount: acc.messageCount + d.messageCount,
      toolCallCount: acc.toolCallCount + d.toolCallCount,
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      messageCount: 0,
      toolCallCount: 0,
    },
  );
}

function mergeDays(rows: DailyUsageRow[]): MergedDay[] {
  const map = new Map<string, MergedDay>();
  for (const r of rows) {
    const existing = map.get(r.date);
    if (existing) {
      existing.inputTokens += r.inputTokens;
      existing.outputTokens += r.outputTokens;
      existing.messageCount += r.messageCount;
      existing.toolCallCount += r.toolCallCount;
    } else {
      map.set(r.date, {
        date: r.date,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        messageCount: r.messageCount,
        toolCallCount: r.toolCallCount,
      });
    }
  }
  return [...map.values()];
}

function aggregateByModel(rows: DailyUsageRow[]): ModelUsage[] {
  const map = new Map<string, ModelUsage>();
  for (const r of rows) {
    if (!r.modelId) continue;
    const existing = map.get(r.modelId);
    if (existing) {
      existing.inputTokens += r.inputTokens;
      existing.cachedInputTokens += r.cachedInputTokens;
      existing.outputTokens += r.outputTokens;
      existing.messageCount += r.messageCount;
      existing.toolCallCount += r.toolCallCount;
    } else {
      map.set(r.modelId, {
        modelId: r.modelId,
        provider: r.provider ?? "unknown",
        inputTokens: r.inputTokens,
        cachedInputTokens: r.cachedInputTokens,
        outputTokens: r.outputTokens,
        messageCount: r.messageCount,
        toolCallCount: r.toolCallCount,
      });
    }
  }
  return [...map.values()].toSorted(
    (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  );
}

function displayModelId(modelId: string): string {
  const slashIndex = modelId.indexOf("/");
  return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}

function formatUsd(amount: number): string {
  if (amount >= 100) {
    return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  if (amount >= 0.01) {
    return (
      "$" +
      amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }
  return (
    "$" +
    amount.toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
  );
}

function estimateUsageCost(
  dailyRows: DailyUsageRow[],
  models: AvailableModel[],
): CostEstimateSummary | undefined {
  let amount = 0;
  let pricedTokens = 0;
  let totalTokens = 0;
  const modelsById = new Map(models.map((model) => [model.id, model]));

  for (const row of dailyRows) {
    if (!row.modelId) continue;
    const rowTotalTokens = row.inputTokens + row.outputTokens;
    totalTokens += rowTotalTokens;

    const cost =
      typeof row.costUsd === "number"
        ? row.costUsd
        : estimateModelUsageCost(row, modelsById.get(row.modelId)?.cost);
    if (cost === undefined) {
      continue;
    }

    amount += cost;
    pricedTokens += rowTotalTokens;
  }

  if (totalTokens <= 0) {
    return undefined;
  }

  return {
    amount,
    pricedTokens,
    totalTokens,
  };
}

const RANK_DOT_CLASSES = [
  "bg-neutral-300 dark:bg-neutral-200",
  "bg-neutral-400 dark:bg-neutral-400",
  "bg-neutral-500 dark:bg-neutral-500",
  "bg-neutral-600 dark:bg-neutral-600",
  "bg-neutral-700 dark:bg-neutral-700",
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function RankedList({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2.5 rounded-xl border border-border/70 bg-card/50 p-4">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-2.5 text-sm">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${RANK_DOT_CLASSES[i % RANK_DOT_CLASSES.length]}`}
            />
            <span className="min-w-0 truncate text-foreground">
              {item.label}
            </span>
            <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopRepositoriesSection({
  repos,
}: {
  repos: UsageRepositoryInsight[];
}) {
  const top = repos.slice(0, 6);
  if (top.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Top repositories
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((repo) => (
          <div
            key={`${repo.repoOwner}/${repo.repoName}`}
            className="rounded-xl border border-border/70 bg-card/50 px-4 py-3"
          >
            <p className="truncate text-sm font-medium text-foreground">
              {repo.repoOwner}/{repo.repoName}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {repo.sessionCount.toLocaleString()} sessions
              </span>
              <span className="font-mono tabular-nums">
                {repo.totalLinesChanged.toLocaleString()} lines
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function UsagePage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const filteredUsagePath = useMemo(() => {
    if (!dateRange?.from) return null;
    const from = formatDateOnly(dateRange.from);
    const to = formatDateOnly(dateRange.to ?? dateRange.from);
    const query = new URLSearchParams({ from, to });
    return `/api/usage?${query.toString()}`;
  }, [dateRange]);

  const {
    data: fullData,
    isLoading: isFullDataLoading,
    error: fullDataError,
  } = useSWR<UsageResponse>("/api/usage", fetcher);
  const {
    data: filteredData,
    isLoading: isFilteredDataLoading,
    error: filteredDataError,
  } = useSWR<UsageResponse>(filteredUsagePath, fetcher);
  const { data: modelsData } = useSWR<ModelsResponse>(
    "/api/models/costs",
    fetcher,
  );

  const data = filteredUsagePath ? filteredData : fullData;
  const isLoading =
    isFullDataLoading || (filteredUsagePath !== null && isFilteredDataLoading);
  const error = fullDataError ?? filteredDataError;

  const {
    totals,
    chartData,
    modelUsage,
    mainTotals,
    subagentTotals,
    costEstimate,
  } = useMemo(() => {
    const selectedUsage = data?.usage ?? [];
    const chartUsage = fullData?.usage ?? selectedUsage;
    const aggregatedModelUsage = aggregateByModel(selectedUsage);
    const main = selectedUsage.filter((r) => r.agentType === "main");
    const subagent = selectedUsage.filter((r) => r.agentType === "subagent");
    return {
      totals: sumRows(selectedUsage),
      chartData: mergeDays(chartUsage),
      modelUsage: aggregatedModelUsage,
      mainTotals: sumRows(main),
      subagentTotals: sumRows(subagent),
      costEstimate: estimateUsageCost(selectedUsage, modelsData?.models ?? []),
    };
  }, [data, fullData, modelsData]);

  const totalTokens = totals.inputTokens + totals.outputTokens;
  const mainTokens = mainTotals.inputTokens + mainTotals.outputTokens;
  const subagentTokens =
    subagentTotals.inputTokens + subagentTotals.outputTokens;
  const hasUsage = totals.messageCount > 0;
  const estimatedCostValue =
    costEstimate && costEstimate.pricedTokens > 0
      ? formatUsd(costEstimate.amount)
      : "—";

  const agentItems = [
    { label: "Main agent", value: formatTokens(mainTokens) },
    { label: "Subagents", value: formatTokens(subagentTokens) },
  ].filter((i) => i.value !== "0");

  const modelItems = modelUsage.slice(0, 5).map((m) => ({
    label: displayModelId(m.modelId),
    value: formatTokens(m.inputTokens + m.outputTokens),
  }));

  const codeChurnItems = data?.insights
    ? [
        {
          label: "Lines added",
          value: data.insights.code.linesAdded.toLocaleString(),
        },
        {
          label: "Lines removed",
          value: data.insights.code.linesRemoved.toLocaleString(),
        },
        {
          label: "Total changed",
          value: data.insights.code.totalLinesChanged.toLocaleString(),
        },
      ]
    : [];

  const dateRangeLabel = dateRange?.from
    ? (() => {
        const fromLabel = dateRange.from.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const toDate = dateRange.to ?? dateRange.from;
        const toLabel = toDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return fromLabel === toLabel
          ? `Activity for ${fromLabel}`
          : `${fromLabel} – ${toLabel}`;
      })()
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Token volume, cache efficiency, models, and repository activity
          </p>
        </div>
        {dateRangeLabel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDateRange(undefined)}
          >
            {dateRangeLabel} · Clear
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total tokens" value={formatTokens(totalTokens)} />
          <StatCard
            label="Cache read"
            value={formatTokens(totals.cachedInputTokens)}
          />
          <StatCard label="Estimated cost" value={estimatedCostValue} />
          <StatCard
            label="Messages"
            value={totals.messageCount.toLocaleString()}
          />
          <StatCard
            label="Tool calls"
            value={totals.toolCallCount.toLocaleString()}
          />
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Daily activity
          </h2>
          <span className="text-xs text-muted-foreground">
            Click a day to filter
          </span>
        </div>
        {isLoading ? (
          <Skeleton className="h-[96px] w-full rounded-md" />
        ) : (
          <ContributionChart
            data={chartData}
            selectedRange={dateRange}
            onSelectRange={setDateRange}
          />
        )}
      </section>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : error ? (
        <p className="text-sm text-muted-foreground">
          Failed to load usage data.
        </p>
      ) : (
        <>
          {(hasUsage || modelItems.length > 0 || codeChurnItems.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-3">
              {hasUsage && (
                <RankedList title="Agent split" items={agentItems} />
              )}
              {modelItems.length > 0 && (
                <RankedList title="Top models" items={modelItems} />
              )}
              {codeChurnItems.length > 0 && (
                <RankedList title="Code churn" items={codeChurnItems} />
              )}
            </div>
          )}

          {data?.insights?.topRepositories ? (
            <TopRepositoriesSection repos={data.insights.topRepositories} />
          ) : null}

          {data?.insights ? (
            <UsageInsightsSection insights={data.insights} />
          ) : null}
        </>
      )}
    </div>
  );
}
