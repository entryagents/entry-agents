"use client";

import { CheckCircle2, ExternalLink, Plug, Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import type { IntegrationToolkitsResult } from "@/lib/integrations/registry-types";

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<IntegrationToolkitsResult>);

export function IntegrationProvidersSectionSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function IntegrationProvidersSection() {
  const [search, setSearch] = useState("");
  const swrKey = search.trim()
    ? `/api/integrations?q=${encodeURIComponent(search.trim())}`
    : "/api/integrations";

  const { data, isLoading } = useSWR<IntegrationToolkitsResult>(
    swrKey,
    fetcher,
  );

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Plug className="size-4 text-muted-foreground" strokeWidth={1.5} />
          <div>
            <h2 className="text-base font-medium text-foreground">
              {data?.providerName ?? "Executor"} integrations
            </h2>
            <p className="text-xs text-muted-foreground">
              Pluggable MCP gateway for Gmail, GitHub, Linear, Slack, and custom
              apps
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
              data?.configured
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
            {data?.configured ? "Connected" : "Env setup required"}
          </span>
          <a
            href="https://app.executor.sh"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <span>Open Executor</span>
            <ExternalLink className="size-3.5" strokeWidth={1.5} />
          </a>
        </div>
      </div>

      {!data?.configured && data?.requiredEnvVars ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium text-foreground">
            Required environment variables
          </p>
          <div className="mt-2 space-y-1.5">
            {data.requiredEnvVars.map((envVar) => (
              <div
                key={envVar.key}
                className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-center sm:gap-2"
              >
                <code className="font-mono text-foreground">{envVar.key}</code>
                <span className="text-muted-foreground">
                  {envVar.required ? "(required)" : "(optional)"} —{" "}
                  {envVar.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.5}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Executor apps..."
          className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
        />
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Loading connected apps...
        </p>
      ) : data?.error ? (
        <p className="mt-4 text-xs text-destructive">{data.error}</p>
      ) : data?.items && data.items.length > 0 ? (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.items.map((item) => (
            <div
              key={item.slug}
              className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">
                  {item.name}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.description}
                </div>
              </div>
              <span className="ml-2 shrink-0 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                ready
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No Executor apps listed yet. Add apps in your Executor dashboard and
          they will appear here automatically.
        </p>
      )}
    </section>
  );
}
