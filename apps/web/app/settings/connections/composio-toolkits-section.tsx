"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowUpRight,
  Check,
  Loader2,
  Plug,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

function PresetToolkitIcon({
  slug,
  className = "size-5",
}: {
  slug: string;
  className?: string;
}) {
  switch (slug.toLowerCase()) {
    case "gmail":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4Z"
            stroke="#EA4335"
            strokeWidth="1.75"
          />
          <path
            d="M3 6.5L12 13L21 6.5"
            stroke="#EA4335"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M14.5 10C13.67 10 13 9.33 13 8.5V3.5C13 2.67 13.67 2 14.5 2C15.33 2 16 2.67 16 3.5V8.5C16 9.33 15.33 10 14.5 10Z"
            fill="#2EB67D"
          />
          <path
            d="M9.5 14C10.33 14 11 14.67 11 15.5V20.5C11 21.33 10.33 22 9.5 22C8.67 22 8 21.33 8 20.5V15.5C8 14.67 8.67 14 9.5 14Z"
            fill="#E01E5A"
          />
          <path
            d="M10 9.5C10 10.33 9.33 11 8.5 11H3.5C2.67 11 2 10.33 2 9.5C2 8.67 2.67 8 3.5 8H8.5C9.33 8 10 8.67 10 9.5Z"
            fill="#36C5F0"
          />
          <path
            d="M14 14.5C14 13.67 14.67 13 15.5 13H20.5C21.33 13 22 13.67 22 14.5C22 15.33 21.33 16 20.5 16H15.5C14.67 16 14 15.33 14 14.5Z"
            fill="#ECB22E"
          />
        </svg>
      );
    case "notion":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden
        >
          <path d="M4.5 3.5L16.5 2.5L20.5 5.5V20L7.5 21L3.5 18V4.5L4.5 3.5ZM8.5 8.5V17H10.3V11.8L14.2 17H16V8.5H14.2V13.6L10.4 8.5H8.5Z" />
        </svg>
      );
    case "linear":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke="#5E6AD2" strokeWidth="1.8" />
          <path
            d="M5.5 14.5L9.5 18.5M4.8 11L13 19.2M7 7L17 17"
            stroke="#5E6AD2"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "googlecalendar":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <rect
            x="3"
            y="4"
            width="18"
            height="17"
            rx="2.5"
            stroke="#4285F4"
            strokeWidth="1.75"
          />
          <path d="M3 9H21" stroke="#4285F4" strokeWidth="1.75" />
          <path
            d="M8 2.5V5.5M16 2.5V5.5"
            stroke="#34A853"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <rect x="8" y="12" width="3.5" height="3.5" rx="0.7" fill="#EA4335" />
          <rect
            x="12.5"
            y="12"
            width="3.5"
            height="3.5"
            rx="0.7"
            fill="#FBBC04"
          />
        </svg>
      );
    case "googledrive":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M9 4L3 14.5L6 19.5L12 9L9 4Z" fill="#0F9D58" />
          <path d="M9 4H15L21 14.5H15L9 4Z" fill="#FFC107" />
          <path d="M6 19.5L9 14.5H21L18 19.5H6Z" fill="#4285F4" />
        </svg>
      );
    case "github":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 16.64 4.51 20.57 8.68 21.96C9.2 22.05 9.39 21.74 9.39 21.46V19.5C6.47 20.14 5.85 18.26 5.85 18.26C5.37 17.05 4.68 16.72 4.68 16.72C3.73 16.07 4.75 16.08 4.75 16.08C5.8 16.16 6.36 17.16 6.36 17.16C7.29 18.77 8.81 18.3 9.41 18.03C9.5 17.35 9.78 16.89 10.08 16.62C7.75 16.36 5.3 15.46 5.3 11.43C5.3 10.28 5.71 9.34 6.38 8.6C6.27 8.34 5.91 7.27 6.48 5.82C6.48 5.82 7.36 5.54 9.37 6.9C10.21 6.67 11.11 6.55 12 6.55C12.89 6.55 13.79 6.67 14.63 6.9C16.64 5.54 17.52 5.82 17.52 5.82C18.09 7.27 17.73 8.34 17.62 8.6C18.29 9.34 18.7 10.28 18.7 11.43C18.7 15.47 16.24 16.36 13.9 16.61C14.28 16.94 14.61 17.58 14.61 18.57V21.46C14.61 21.74 14.8 22.06 15.33 21.96C19.49 20.57 22.5 16.64 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" />
        </svg>
      );
    case "jira":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M11.6 3L4 10.6L8.2 14.8L11.6 11.4L15.8 15.6L20 11.4L11.6 3Z"
            fill="#2684FF"
          />
          <path
            d="M11.6 11.4L7.4 15.6L11.6 19.8L15.8 15.6L11.6 11.4Z"
            fill="#0052CC"
          />
        </svg>
      );
    case "figma":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M8.5 2H12V9H8.5C6.57 9 5 7.43 5 5.5C5 3.57 6.57 2 8.5 2Z"
            fill="#F24E1E"
          />
          <path
            d="M12 2H15.5C17.43 2 19 3.57 19 5.5C19 7.43 17.43 9 15.5 9H12V2Z"
            fill="#FF7262"
          />
          <path
            d="M12 12.5C12 10.57 13.57 9 15.5 9C17.43 9 19 10.57 19 12.5C19 14.43 17.43 16 15.5 16C13.57 16 12 14.43 12 12.5Z"
            fill="#1ABCFE"
          />
          <path
            d="M5 19.5C5 17.57 6.57 16 8.5 16H12V19.5C12 21.43 10.43 23 8.5 23C6.57 23 5 21.43 5 19.5Z"
            fill="#0ACF83"
          />
          <path
            d="M5 12.5C5 10.57 6.57 9 8.5 9H12V16H8.5C6.57 16 5 14.43 5 12.5Z"
            fill="#A259FF"
          />
        </svg>
      );
    case "discord":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="#5865F2"
          aria-hidden
        >
          <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4C14.82 4.33 14.6 4.77 14.45 5.12C12.86 4.88 11.28 4.88 9.71 5.12C9.56 4.77 9.33 4.33 9.15 4C7.64 4.26 6.2 4.71 4.87 5.33C2.16 9.41 1.43 13.38 1.8 17.3C3.6 18.63 5.35 19.44 7.07 19.97C7.5 19.39 7.88 18.77 8.21 18.11C7.59 17.88 7 17.59 6.44 17.26C6.59 17.15 6.73 17.03 6.87 16.91C10.27 18.49 13.97 18.49 17.33 16.91C17.47 17.03 17.61 17.15 17.76 17.26C17.2 17.59 16.6 17.88 15.98 18.11C16.31 18.77 16.69 19.39 17.12 19.97C18.85 19.44 20.6 18.63 22.4 17.3C22.84 12.75 21.66 8.82 19.27 5.33ZM8.68 14.89C7.65 14.89 6.8 13.94 6.8 12.77C6.8 11.6 7.63 10.65 8.68 10.65C9.73 10.65 10.58 11.6 10.56 12.77C10.56 13.94 9.73 14.89 8.68 14.89ZM15.52 14.89C14.49 14.89 13.64 13.94 13.64 12.77C13.64 11.6 14.47 10.65 15.52 10.65C16.57 10.65 17.42 11.6 17.4 12.77C17.4 13.94 16.57 14.89 15.52 14.89Z" />
        </svg>
      );
    case "hubspot":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <circle
            cx="14.5"
            cy="12"
            r="4.2"
            stroke="#FF7A59"
            strokeWidth="1.8"
          />
          <circle cx="14.5" cy="4.5" r="1.7" fill="#FF7A59" />
          <circle cx="6.2" cy="17.2" r="2.2" fill="#FF7A59" />
          <path
            d="M14.5 6.2V7.8M11 14.4L8 16.2"
            stroke="#FF7A59"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "asana":
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="#F06A6A"
          aria-hidden
        >
          <circle cx="12" cy="7.5" r="3.6" />
          <circle cx="6.8" cy="16.2" r="3.6" />
          <circle cx="17.2" cy="16.2" r="3.6" />
        </svg>
      );
    default:
      return (
        <Plug
          className={cn(className, "text-muted-foreground")}
          strokeWidth={1.5}
        />
      );
  }
}

function ToolkitBrandIcon({
  toolkit,
}: {
  toolkit: ComposioToolkitCatalogItem;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  if (toolkit.logo && !logoFailed) {
    return (
      <Image
        src={toolkit.logo}
        alt=""
        width={20}
        height={20}
        unoptimized
        onError={() => setLogoFailed(true)}
        className="size-5 rounded-sm object-contain"
      />
    );
  }

  return <PresetToolkitIcon slug={toolkit.slug} className="size-5" />;
}

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
    const toolkit = searchParams.get("toolkit");
    if (!composioStatus) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("composio");
    url.searchParams.delete("toolkit");
    window.history.replaceState({}, "", url.toString());

    if (composioStatus === "connected") {
      toast.success(
        toolkit
          ? `${toolkit.toUpperCase()} connected — agents can now use it`
          : "App connected",
      );
      void mutate();
    }
  }, [mutate, searchParams]);

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
                        <ToolkitBrandIcon toolkit={toolkit} />
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
