"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Loader2,
  RefreshCw,
  Search,
  Unplug,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ComposioToolkitCatalogItem,
  ComposioToolkitsStatusResult,
} from "@/lib/mcp/composio";
import { ToolkitBrandIcon } from "@/components/toolkit-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

export function ComposioToolkitsSectionSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-8" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

const CATEGORIES = [
  "All",
  "Connected",
  "Communication",
  "Productivity",
  "Engineering",
  "Design",
  "CRM",
] as const;

export function ComposioToolkitsSection() {
  const searchParams = useSearchParams();
  const { mutate: globalMutate } = useSWRConfig();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof CATEGORIES)[number]>("All");
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const swrKey = debouncedSearch
    ? `/api/composio/toolkits?q=${encodeURIComponent(debouncedSearch)}`
    : "/api/composio/toolkits";

  const { data, isLoading, isValidating, mutate } =
    useSWR<ComposioToolkitsStatusResult>(swrKey, fetcher, {
      revalidateOnFocus: true,
      keepPreviousData: true,
    });

  useEffect(() => {
    const composioStatus = searchParams.get("composio");
    const toolkit = searchParams.get("toolkit")?.trim().toLowerCase() ?? null;
    const callbackStatus = searchParams.get("status")?.trim().toLowerCase();
    const callbackError =
      searchParams.get("error_description") ?? searchParams.get("error");
    if (!composioStatus) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("composio");
    url.searchParams.delete("toolkit");
    url.searchParams.delete("status");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("connectedAccountId");
    url.searchParams.delete("connected_account_id");
    window.history.replaceState({}, "", url.toString());

    const label = toolkit ? toolkit.toUpperCase() : "App";

    if (
      composioStatus === "error" ||
      callbackStatus === "failed" ||
      callbackStatus === "error" ||
      Boolean(callbackError)
    ) {
      toast.error(
        callbackError
          ? `${label} authorization failed: ${callbackError}`
          : `${label} authorization was cancelled or failed`,
      );
      void mutate();
      return;
    }

    if (composioStatus === "connected") {
      let cancelled = false;
      const verifyConnection = async () => {
        if (!toolkit) {
          toast.success("App connected");
          await mutate();
          await globalMutate("/api/composio/toolkits");
          return;
        }
        try {
          const res = await fetch("/api/composio/connect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "verify",
              toolkitSlug: toolkit,
            }),
          });
          const verified = (await res.json()) as {
            ok?: boolean;
            isConnected?: boolean;
            status?: string;
            error?: string;
          };
          if (cancelled) return;
          if (res.ok && verified.isConnected) {
            toast.success(`${label} connected — agents can now use it`);
          } else if (res.ok && verified.status === "INITIATED") {
            toast.message(
              `${label} authorization is still finalizing with Composio. Click refresh in a moment if it does not appear connected.`,
            );
          } else {
            toast.error(
              verified.error ??
                `${label} authorization did not complete. Try connecting again.`,
            );
          }
        } catch {
          if (!cancelled) {
            toast.success(`${label} connected — refreshing status`);
          }
        } finally {
          if (!cancelled) {
            await mutate();
            await globalMutate("/api/composio/toolkits");
          }
        }
      };

      void verifyConnection();
      return () => {
        cancelled = true;
      };
    }
  }, [globalMutate, mutate, searchParams]);

  const toolkits = useMemo<ComposioToolkitCatalogItem[]>(
    () => data?.toolkits ?? [],
    [data?.toolkits],
  );

  const connectedCount = useMemo(
    () => toolkits.filter((t) => t.isConnected).length,
    [toolkits],
  );

  const filteredToolkits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return toolkits.filter((item) => {
      if (selectedCategory === "Connected" && !item.isConnected) {
        return false;
      }
      if (
        selectedCategory !== "All" &&
        selectedCategory !== "Connected" &&
        item.category !== selectedCategory
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    });
  }, [search, selectedCategory, toolkits]);

  const isConfigured = Boolean(data?.configured);
  const serviceError = data?.error?.trim() || null;

  const handleConnectToolkit = async (slug: string) => {
    if (!isConfigured) {
      toast.error(
        "Composio integration is not active on this server yet (COMPOSIO_API_KEY is unset)",
      );
      return;
    }

    setConnectingSlug(slug);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "authorize",
          toolkitSlug: slug,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        redirectUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.redirectUrl) {
        throw new Error(
          json.error || `Failed to start ${slug} authorization flow`,
        );
      }
      window.location.href = json.redirectUrl;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to authorize ${slug} via Composio`,
      );
      setConnectingSlug(null);
    }
  };

  const handleDisconnectToolkit = async (
    toolkit: ComposioToolkitCatalogItem,
  ) => {
    if (!toolkit.connectedAccountId) return;
    setDisconnectingId(toolkit.connectedAccountId);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "disconnect",
          connectedAccountId: toolkit.connectedAccountId,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Failed to disconnect ${toolkit.name}`);
      }
      toast.success(`${toolkit.name} disconnected`);
      await mutate();
      await globalMutate("/api/composio/toolkits");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to disconnect ${toolkit.name}`,
      );
    } finally {
      setDisconnectingId(null);
    }
  };

  if (isLoading && !data) {
    return <ComposioToolkitsSectionSkeleton />;
  }

  return (
    <section
      aria-label="Workspace apps"
      className="overflow-hidden rounded-xl border border-border/70 bg-card"
    >
      {/* Header */}
      <div className="border-b border-border/60 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="text-sm font-semibold text-foreground">
                App connections
              </h2>
              {isConfigured && (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {connectedCount} connected
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Authorize Gmail, Slack, Notion, Linear, Calendar, Drive, and 500+
              apps via Composio so agents can read and act directly from chat
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void mutate()}
            aria-label="Refresh connected apps"
            className="shrink-0"
          >
            <RefreshCw
              className={cn("size-3.5", isValidating && "animate-spin")}
              strokeWidth={1.5}
            />
          </Button>
        </div>

        {!isConfigured && (
          <div className="mt-3 rounded-lg border border-border/70 bg-muted/35 px-3 py-2.5 text-xs text-muted-foreground">
            App OAuth connections are unavailable on this deployment until{" "}
            <code className="font-mono text-[11px] text-foreground">
              COMPOSIO_API_KEY
            </code>{" "}
            is set in the server environment.
          </div>
        )}

        {isConfigured && serviceError && (
          <div
            role="alert"
            className="mt-3 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-3 py-2.5 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                strokeWidth={1.5}
              />
              <span className="leading-relaxed text-muted-foreground">
                {serviceError}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void mutate()}
              className="h-7 shrink-0 self-start px-2.5 text-xs sm:self-center"
            >
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div className="border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 sm:pb-0">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer",
                  selectedCategory === category
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value.trim() && selectedCategory !== "All") {
                  setSelectedCategory("All");
                }
              }}
              placeholder="Search 500+ apps..."
              className="h-8 pl-8 pr-8 text-xs"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolkit Grid */}
      {filteredToolkits.length === 0 ? (
        <div className="px-4 py-10 text-center text-xs text-muted-foreground sm:px-5">
          {selectedCategory === "Connected"
            ? "No apps connected yet. Switch to All to authorize an integration."
            : "No matching integrations found. Try another app name like Stripe, Jira, or Airtable."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          {filteredToolkits.map((toolkit) => {
            const isConnecting = connectingSlug === toolkit.slug;
            const isDisconnecting =
              Boolean(toolkit.connectedAccountId) &&
              disconnectingId === toolkit.connectedAccountId;
            return (
              <div
                key={toolkit.slug}
                className={cn(
                  "flex min-w-0 flex-col justify-between gap-3 rounded-lg border p-3.5 transition-colors duration-150",
                  toolkit.isConnected
                    ? "border-emerald-500/30 bg-emerald-500/[0.025]"
                    : "border-border/70 bg-background/60 hover:border-border",
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card">
                        <ToolkitBrandIcon
                          slug={toolkit.slug}
                          logo={toolkit.logo}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium leading-tight text-foreground">
                          {toolkit.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {toolkit.category}
                        </div>
                      </div>
                    </div>

                    {toolkit.isConnected ? (
                      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        <Check className="size-3" strokeWidth={1.75} />
                        Connected
                      </span>
                    ) : toolkit.status === "EXPIRED" ? (
                      <span className="shrink-0 font-mono text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        Expired
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {toolkit.description}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                  <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                    /{toolkit.slug}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {toolkit.isConnected && toolkit.connectedAccountId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={isDisconnecting || isConnecting}
                        onClick={() => void handleDisconnectToolkit(toolkit)}
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        {isDisconnecting ? (
                          <Loader2
                            className="size-3 animate-spin"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <Unplug className="size-3" strokeWidth={1.5} />
                        )}
                        <span>Disconnect</span>
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={toolkit.isConnected ? "ghost" : "outline"}
                      disabled={
                        !isConfigured || isConnecting || isDisconnecting
                      }
                      onClick={() => void handleConnectToolkit(toolkit.slug)}
                      className="h-7 gap-1 px-2.5 text-xs"
                    >
                      {isConnecting ? (
                        <>
                          <Loader2
                            className="size-3 animate-spin"
                            strokeWidth={1.5}
                          />
                          <span>Connecting</span>
                        </>
                      ) : toolkit.isConnected ? (
                        <>
                          <span>Reconnect</span>
                          <ArrowUpRight className="size-3" strokeWidth={1.5} />
                        </>
                      ) : (
                        <>
                          <span>Connect</span>
                          <ArrowUpRight className="size-3" strokeWidth={1.5} />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
