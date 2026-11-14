"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getProviderDisplayName,
  getProviderFromModelId,
  ProviderIcon,
} from "@/components/provider-icons";
import type { AvailableModel } from "@/lib/models";

function formatContext(tokens: number | undefined): string {
  if (!tokens) return "—";
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

function formatPrice(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value === 0) return "Free";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

function isFree(model: AvailableModel): boolean {
  return model.cost?.input === 0 && model.cost?.output === 0;
}

export function PricingTable({
  models,
}: {
  readonly models: AvailableModel[];
}) {
  const [query, setQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");

  const providers = useMemo(() => {
    const set = new Set<string>();
    for (const m of models) {
      set.add(getProviderFromModelId(m.id));
    }
    return ["all", ...Array.from(set).toSorted()];
  }, [models]);

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...models]
      .filter((m) => {
        const provider = getProviderFromModelId(m.id);
        if (selectedProvider !== "all" && provider !== selectedProvider) {
          return false;
        }
        if (!q) return true;
        return (
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          getProviderDisplayName(provider).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aFree = isFree(a);
        const bFree = isFree(b);
        if (aFree !== bFree) return aFree ? -1 : 1;
        const aOut = a.cost?.output ?? 0;
        const bOut = b.cost?.output ?? 0;
        return aOut - bOut;
      });
  }, [models, query, selectedProvider]);

  return (
    <div className="space-y-4">
      {/* Search & Provider Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {providers.map((prov) => {
            const active = selectedProvider === prov;
            return (
              <button
                key={prov}
                type="button"
                onClick={() => setSelectedProvider(prov)}
                className={`shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                  active
                    ? "border-(--l-fg) bg-(--l-fg) text-(--l-bg)"
                    : "border-(--l-border) bg-(--l-surface) text-(--l-fg-2) hover:text-(--l-fg)"
                }`}
              >
                {prov === "all"
                  ? `All (${models.length})`
                  : getProviderDisplayName(prov)}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-(--l-fg-3)"
            strokeWidth={1.5}
          />
          <input
            type="search"
            aria-label="Filter models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter models..."
            className="h-9 w-full rounded-lg border border-(--l-border) bg-(--l-surface) pl-8 pr-3 text-xs text-(--l-fg) placeholder:text-(--l-fg-3) focus:border-(--l-fg) focus:outline-none"
          />
        </div>
      </div>

      {/* Responsive Table — exact column count matches visible cells at every breakpoint */}
      <div className="overflow-hidden rounded-xl border border-(--l-border) bg-(--l-surface)">
        <div className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_auto] gap-x-3 border-b border-(--l-border) bg-(--l-surface-2) px-3.5 py-3 text-xs font-medium text-(--l-fg-3) sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(68px,1fr))] sm:gap-x-4 sm:px-6 lg:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(76px,1fr))]">
          <div>Model</div>
          <div className="text-right">Context</div>
          <div className="text-right">Input</div>
          <div className="text-right">Output</div>
          <div className="hidden text-right sm:block">Cache read</div>
          <div className="hidden text-right lg:block">Cache write</div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-(--l-fg-3)">
            No models match &ldquo;{query}&rdquo;
          </div>
        ) : (
          sorted.map((model) => {
            const provider = getProviderFromModelId(model.id);
            const free = isFree(model);
            return (
              <div
                key={model.id}
                className="grid grid-cols-[minmax(0,1.6fr)_auto_auto_auto] items-center gap-x-3 border-b border-(--l-border) px-3.5 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(68px,1fr))] sm:gap-x-4 sm:px-6 sm:py-4 lg:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(76px,1fr))]"
              >
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  <ProviderIcon
                    provider={provider}
                    className="size-4 shrink-0 opacity-90 sm:size-5"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium sm:text-sm">
                      {model.name}
                    </div>
                    <div className="truncate text-[11px] text-(--l-fg-3)">
                      {getProviderDisplayName(provider)}
                      {free && (
                        <span className="ml-2 rounded bg-(--l-fg-6) px-1.5 py-0.5 text-[11px] font-medium text-(--l-fg-2)">
                          Free
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono text-xs tabular-nums text-(--l-fg-2) sm:text-sm">
                  {formatContext(model.context_window)}
                </div>
                <div className="text-right font-mono text-xs tabular-nums text-(--l-fg-2) sm:text-sm">
                  {formatPrice(model.cost?.input)}
                  {!free && <span className="text-(--l-fg-3)">/M</span>}
                </div>
                <div className="text-right font-mono text-xs tabular-nums text-(--l-fg-2) sm:text-sm">
                  {formatPrice(model.cost?.output)}
                  {!free && <span className="text-(--l-fg-3)">/M</span>}
                </div>
                <div className="hidden text-right font-mono text-xs tabular-nums text-(--l-fg-2) sm:block sm:text-sm">
                  {model.cost?.cache_read !== undefined
                    ? `${formatPrice(model.cost.cache_read)}${!free ? "/M" : ""}`
                    : "—"}
                </div>
                <div className="hidden text-right font-mono text-xs tabular-nums text-(--l-fg-2) lg:block sm:text-sm">
                  {model.cost?.cache_write !== undefined
                    ? `${formatPrice(model.cost.cache_write)}${!free ? "/M" : ""}`
                    : "—"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
