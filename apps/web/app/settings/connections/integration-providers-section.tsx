"use client";

import { AlertCircle, ExternalLink, Plug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import useSWR from "swr";
import type { IntegrationToolkitsResult } from "@/lib/integrations/registry-types";
import { ExecutorAuthPanel } from "./executor-auth-panel";
import { ExecutorCatalogGrid } from "./executor-catalog-grid";

const PAGE_LIMIT = 48;

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<IntegrationToolkitsResult>);

export function IntegrationProvidersSectionSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-6">
      <div className="h-5 w-48 rounded bg-muted/60" />
      <div className="h-4 w-80 rounded bg-muted/40" />
      <div className="h-20 rounded-lg border border-border/60 bg-background/60" />
    </div>
  );
}

export function IntegrationProvidersSection() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [offset, setOffset] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const oauthNotice = useMemo(() => {
    const status = searchParams.get("executor");
    const reason = searchParams.get("reason");
    if (status === "connected") {
      return {
        type: "connected" as const,
        message:
          "Executor OAuth authorized. Connected apps from that workspace are ready inside Entry.",
      };
    }
    if (status === "error") {
      return {
        type: "error" as const,
        message: reason || "Executor OAuth sign-in did not complete",
      };
    }
    return null;
  }, [searchParams]);

  const swrKey = useMemo(() => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set("q", deferredSearch.trim());
    if (category && category !== "all") params.set("category", category);
    params.set("offset", String(offset));
    params.set("limit", String(PAGE_LIMIT));
    return `/api/integrations?${params.toString()}`;
  }, [deferredSearch, category, offset]);

  const { data, isLoading, mutate } = useSWR<IntegrationToolkitsResult>(
    swrKey,
    fetcher,
    { keepPreviousData: true },
  );

  function handleSearchChange(value: string) {
    setSearch(value);
    setOffset(0);
  }

  function handleCategoryChange(nextCategory: string) {
    setCategory(nextCategory);
    setOffset(0);
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <Plug className="size-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-medium text-foreground">
              {data?.providerName ?? "Executor"} app catalog
            </h2>
            <p className="text-xs text-muted-foreground">
              {data?.catalogCount
                ? `${data.catalogCount.toLocaleString()} official apps routed through a single Executor MCP gateway`
                : "Unified MCP gateway and credential vault for workplace apps"}
            </p>
          </div>
        </div>

        <a
          href="https://app.executor.sh"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:self-auto"
        >
          <span>Open Executor</span>
          <ExternalLink className="size-3.5" strokeWidth={1.5} />
        </a>
      </div>

      <ExecutorAuthPanel
        connectionStatus={data?.connectionStatus}
        configured={Boolean(data?.configured)}
        requiredEnvVars={data?.requiredEnvVars}
        oauthNotice={oauthNotice}
        onRefresh={() => mutate()}
      />

      {data?.error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs text-foreground">
          <AlertCircle
            className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            strokeWidth={1.5}
          />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">{data.error}</p>
            {data.recovery?.action && (
              <p className="text-muted-foreground">{data.recovery.action}</p>
            )}
          </div>
        </div>
      )}

      <ExecutorCatalogGrid
        items={data?.items ?? []}
        categories={data?.categories ?? []}
        totalCount={data?.totalCount ?? 0}
        catalogCount={data?.catalogCount ?? 0}
        connectedCount={data?.connectedCount ?? 0}
        search={search}
        selectedCategory={category}
        offset={offset}
        limit={PAGE_LIMIT}
        isLoading={isLoading}
        onSearchChange={handleSearchChange}
        onCategoryChange={handleCategoryChange}
        onPageChange={setOffset}
      />
    </section>
  );
}
