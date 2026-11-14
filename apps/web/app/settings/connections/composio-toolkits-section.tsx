"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  ArrowUpRight,
  Check,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
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

function ToolkitBrandIcon({
  slug,
  className = "h-5 w-5",
}: {
  slug: string;
  className?: string;
}) {
  switch (slug.toLowerCase()) {
    case "gmail":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M4.5 3.5L16.5 2.5L20.5 5.5V20L7.5 21L3.5 18V4.5L4.5 3.5ZM8.5 8.5V17H10.3V11.8L14.2 17H16V8.5H14.2V13.6L10.4 8.5H8.5Z" />
        </svg>
      );
    case "linear":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
        <svg viewBox="0 0 24 24" className={className} fill="none">
          <path d="M9 4L3 14.5L6 19.5L12 9L9 4Z" fill="#0F9D58" />
          <path d="M9 4H15L21 14.5H15L9 4Z" fill="#FFC107" />
          <path d="M6 19.5L9 14.5H21L18 19.5H6Z" fill="#4285F4" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 16.64 4.51 20.57 8.68 21.96C9.2 22.05 9.39 21.74 9.39 21.46V19.5C6.47 20.14 5.85 18.26 5.85 18.26C5.37 17.05 4.68 16.72 4.68 16.72C3.73 16.07 4.75 16.08 4.75 16.08C5.8 16.16 6.36 17.16 6.36 17.16C7.29 18.77 8.81 18.3 9.41 18.03C9.5 17.35 9.78 16.89 10.08 16.62C7.75 16.36 5.3 15.46 5.3 11.43C5.3 10.28 5.71 9.34 6.38 8.6C6.27 8.34 5.91 7.27 6.48 5.82C6.48 5.82 7.36 5.54 9.37 6.9C10.21 6.67 11.11 6.55 12 6.55C12.89 6.55 13.79 6.67 14.63 6.9C16.64 5.54 17.52 5.82 17.52 5.82C18.09 7.27 17.73 8.34 17.62 8.6C18.29 9.34 18.7 10.28 18.7 11.43C18.7 15.47 16.24 16.36 13.9 16.61C14.28 16.94 14.61 17.58 14.61 18.57V21.46C14.61 21.74 14.8 22.06 15.33 21.96C19.49 20.57 22.5 16.64 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" />
        </svg>
      );
    case "jira":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
        <svg viewBox="0 0 24 24" className={className} fill="#5865F2">
          <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4C14.82 4.33 14.6 4.77 14.45 5.12C12.86 4.88 11.28 4.88 9.71 5.12C9.56 4.77 9.33 4.33 9.15 4C7.64 4.26 6.2 4.71 4.87 5.33C2.16 9.41 1.43 13.38 1.8 17.3C3.6 18.63 5.35 19.44 7.07 19.97C7.5 19.39 7.88 18.77 8.21 18.11C7.59 17.88 7 17.59 6.44 17.26C6.59 17.15 6.73 17.03 6.87 16.91C10.27 18.49 13.97 18.49 17.33 16.91C17.47 17.03 17.61 17.15 17.76 17.26C17.2 17.59 16.6 17.88 15.98 18.11C16.31 18.77 16.69 19.39 17.12 19.97C18.85 19.44 20.6 18.63 22.4 17.3C22.84 12.75 21.66 8.82 19.27 5.33ZM8.68 14.89C7.65 14.89 6.8 13.94 6.8 12.77C6.8 11.6 7.63 10.65 8.68 10.65C9.73 10.65 10.58 11.6 10.56 12.77C10.56 13.94 9.73 14.89 8.68 14.89ZM15.52 14.89C14.49 14.89 13.64 13.94 13.64 12.77C13.64 11.6 14.47 10.65 15.52 10.65C16.57 10.65 17.42 11.6 17.4 12.77C17.4 13.94 16.57 14.89 15.52 14.89Z" />
        </svg>
      );
    case "hubspot":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none">
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
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="#F06A6A">
          <circle cx="12" cy="7.5" r="3.8" />
          <circle cx="6.8" cy="16.2" r="3.8" />
          <circle cx="17.2" cy="16.2" r="3.8" />
        </svg>
      );
  }
}

export function ComposioToolkitsSectionSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

const CATEGORIES = [
  "All",
  "Communication",
  "Productivity",
  "Engineering",
  "Design",
  "CRM",
] as const;

export function ComposioToolkitsSection() {
  const searchParams = useSearchParams();
  const { data, isLoading, mutate } = useSWR<ComposioToolkitsStatusResult>(
    "/api/composio/toolkits",
    fetcher,
    { revalidateOnFocus: true },
  );

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<(typeof CATEGORIES)[number]>("All");
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);

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
          ? `${toolkit.toUpperCase()} connected via Composio — ready for Entry Agent`
          : "Composio app connected",
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
      if (selectedCategory !== "All" && item.category !== selectedCategory) {
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

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsSavingKey(true);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_api_key",
          apiKey: apiKeyInput.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Failed to save Composio API key");
      }
      setApiKeyInput("");
      setShowKeyForm(false);
      toast.success(
        "Composio API key saved to your encrypted vault. You can now connect apps below.",
      );
      await mutate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save Composio API key",
      );
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleConnectToolkit = async (slug: string) => {
    if (!data?.configured) {
      setShowKeyForm(true);
      toast.info(
        "Enter your Composio API key first to authorize OAuth app connections.",
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
          : `Failed to authorize ${slug} with Composio`,
      );
      setConnectingSlug(null);
    }
  };

  if (isLoading && !data) {
    return <ComposioToolkitsSectionSkeleton />;
  }

  const isConfigured = Boolean(data?.configured);

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/60 px-4 py-3.5 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">
                Composio App Integrations
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-2.5 w-2.5" />
                {connectedCount} Connected · {toolkits.length} Featured
              </span>
              {data?.keySource === "user_secret" && (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Vault Key Active
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Connect Gmail, Slack, Notion, Linear, Google Calendar, Drive,
              Jira, and Figma so Entry Agent can read and act across your
              workspace tools via Composio Tool Router MCP.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowKeyForm((prev) => !prev)}
              className="h-8 gap-1.5 text-xs"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {isConfigured ? "Update API Key" : "Set Composio Key"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void mutate()}
              aria-label="Refresh Composio connections"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Inline Encrypted API Key Setup when not configured or toggled */}
        {(!isConfigured || showKeyForm) && (
          <form
            onSubmit={handleSaveApiKey}
            className="mt-3 flex flex-col gap-2.5 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {isConfigured
                  ? "Replace your encrypted COMPOSIO_API_KEY"
                  : "Add your Composio API Key (encrypted in your Vault)"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Stored encrypted with AES-256-GCM in your user vault and never
                exposed to model text output. Get a key at{" "}
                <a
                  href="https://platform.composio.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  platform.composio.dev
                </a>
                .
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="ak_..."
                className="h-8 w-full font-mono text-xs sm:w-56"
              />
              <Button
                type="submit"
                size="sm"
                disabled={isSavingKey || !apiKeyInput.trim()}
                className="h-8 shrink-0 text-xs"
              >
                {isSavingKey ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Save Key"
                )}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* Filters & Search */}
      <div className="border-b border-border/50 bg-muted/20 px-4 py-2.5 sm:px-5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory(category)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedCategory === category
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Gmail, Slack, Notion..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Toolkit Grid */}
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
        {filteredToolkits.map((toolkit) => {
          const isConnecting = connectingSlug === toolkit.slug;
          return (
            <div
              key={toolkit.slug}
              className={cn(
                "flex flex-col justify-between gap-3 rounded-xl border p-3.5 transition-colors",
                toolkit.isConnected
                  ? "border-emerald-500/35 bg-emerald-500/[0.03]"
                  : "border-border/70 bg-background/60 hover:border-border",
              )}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card shadow-2xs">
                      <ToolkitBrandIcon
                        slug={toolkit.slug}
                        className="h-5 w-5"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium leading-none">
                          {toolkit.name}
                        </span>
                      </div>
                      <span className="mt-1 inline-block font-mono text-[10px] text-muted-foreground">
                        {toolkit.category}
                      </span>
                    </div>
                  </div>

                  {toolkit.isConnected ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-2.5 w-2.5" />
                      Connected
                    </span>
                  ) : toolkit.status === "EXPIRED" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      Expired
                    </span>
                  ) : null}
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {toolkit.description}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  /{toolkit.slug}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={toolkit.isConnected ? "ghost" : "outline"}
                  disabled={isConnecting}
                  onClick={() => handleConnectToolkit(toolkit.slug)}
                  className="h-7 gap-1 px-2.5 text-xs"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Connecting...
                    </>
                  ) : toolkit.isConnected ? (
                    <>
                      Reconnect
                      <ArrowUpRight className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Connect
                      <ArrowUpRight className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
