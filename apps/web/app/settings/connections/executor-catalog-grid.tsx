"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plug,
  Search,
} from "lucide-react";
import { useState } from "react";
import type {
  IntegrationCatalogCategory,
  IntegrationConnectResult,
  IntegrationToolkitItem,
} from "@/lib/integrations/registry-types";

interface ExecutorCatalogGridProps {
  items: IntegrationToolkitItem[];
  categories: IntegrationCatalogCategory[];
  totalCount: number;
  catalogCount: number;
  connectedCount: number;
  search: string;
  selectedCategory: string;
  offset: number;
  limit: number;
  isLoading: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (category: string) => void;
  onPageChange: (nextOffset: number) => void;
}

function AppIcon({
  iconUrl,
  name,
}: {
  readonly iconUrl?: string;
  readonly name: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!iconUrl || failed) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
        <Plug className="size-4" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG sprites served from catalog.executor.sh */}
      <img
        src={iconUrl}
        alt={name}
        width={20}
        height={20}
        loading="lazy"
        onError={() => setFailed(true)}
        className="size-5 object-contain"
      />
    </div>
  );
}

export function ExecutorCatalogGrid({
  items,
  categories,
  totalCount,
  catalogCount,
  connectedCount,
  search,
  selectedCategory,
  offset,
  limit,
  isLoading,
  onSearchChange,
  onCategoryChange,
  onPageChange,
}: ExecutorCatalogGridProps) {
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const visibleCategories = categories.slice(0, 7);
  const startIndex = totalCount === 0 ? 0 : offset + 1;
  const endIndex = Math.min(totalCount, offset + items.length);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  async function handleConnectApp(slug: string) {
    setConnectingSlug(slug);
    setConnectError(null);
    try {
      const res = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, providerId: "executor" }),
      });
      const data = (await res.json()) as IntegrationConnectResult;
      if (!res.ok || data.error) {
        setConnectError(data.error ?? `Failed to start connection for ${slug}`);
        return;
      }
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setConnectError(`Network error connecting ${slug}`);
    } finally {
      setConnectingSlug(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={`Search ${catalogCount > 0 ? `${catalogCount.toLocaleString()} official` : "Executor"} apps (Gmail, Linear, Slack, Notion, Stripe...)`}
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
          />
        </div>

        <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
          {startIndex}–{endIndex} of {totalCount.toLocaleString()}
        </span>
      </div>

      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onCategoryChange("all")}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
            selectedCategory === "all"
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>All apps</span>
          {catalogCount > 0 && (
            <span className="font-mono text-[11px] opacity-75 tabular-nums">
              {catalogCount.toLocaleString()}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onCategoryChange("connected")}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
            selectedCategory === "connected"
              ? "border-foreground/20 bg-foreground text-background"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Connected</span>
          <span className="font-mono text-[11px] opacity-75 tabular-nums">
            {connectedCount}
          </span>
        </button>

        {visibleCategories.map((cat) => (
          <button
            key={cat.name}
            type="button"
            onClick={() => onCategoryChange(cat.name)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs capitalize transition-colors ${
              selectedCategory === cat.name
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{cat.name}</span>
            <span className="font-mono text-[11px] opacity-75 tabular-nums">
              {cat.count}
            </span>
          </button>
        ))}
      </div>

      {connectError && (
        <p className="text-xs text-destructive">{connectError}</p>
      )}

      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {["a", "b", "c", "d", "e", "f"].map((key) => (
            <div
              key={key}
              className="h-20 rounded-lg border border-border/70 bg-background/60 p-3"
            />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const busy = connectingSlug === item.slug;
            return (
              <div
                key={item.slug}
                className="flex min-w-0 flex-col justify-between gap-2.5 rounded-lg border border-border/80 bg-background p-3 transition-colors hover:border-border"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <AppIcon iconUrl={item.iconUrl} name={item.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {item.name}
                      </span>
                      {item.connected && (
                        <CheckCircle2
                          className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                          strokeWidth={1.5}
                        />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate capitalize">{item.category}</span>
                    {item.authKind && (
                      <span className="shrink-0 font-mono text-[10px] opacity-80">
                        · {item.authKind}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConnectApp(item.slug)}
                    disabled={busy}
                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-[11px] font-medium transition-colors ${
                      item.connected
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    <span>
                      {busy
                        ? "Opening..."
                        : item.connected
                          ? "Manage"
                          : "Connect"}
                    </span>
                    <ExternalLink className="size-2.5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-border/70 bg-background p-6 text-center text-xs text-muted-foreground">
          No integrations match this filter. Try clearing the search or
          switching back to all apps.
        </div>
      )}

      {totalCount > limit && (
        <div className="flex items-center justify-between border-t border-border/60 pt-3">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            Showing {startIndex}–{endIndex} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(0, offset - limit))}
              disabled={!hasPrev}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-foreground hover:bg-muted disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" strokeWidth={1.5} />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={() => onPageChange(offset + limit)}
              disabled={!hasNext}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs text-foreground hover:bg-muted disabled:opacity-40"
            >
              <span>Next</span>
              <ChevronRight className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
