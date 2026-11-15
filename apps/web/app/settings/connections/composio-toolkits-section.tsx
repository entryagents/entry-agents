"use client";

import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import type {
  ComposioConnectedAccountSummary,
  ComposioToolkitCatalogItem,
} from "@/lib/composio/client";

interface ComposioToolkitsResponse {
  configured: boolean;
  toolkits: ComposioToolkitCatalogItem[];
  connectedCount: number;
  sharedAccounts: ComposioConnectedAccountSummary[];
  error?: string;
}

const CATEGORIES = [
  "All",
  "Connected",
  "Communication",
  "Productivity",
  "Engineering",
  "Design",
  "CRM",
  "Analytics",
] as const;

const fetcher = (url: string) =>
  fetch(url).then((r) => r.json() as Promise<ComposioToolkitsResponse>);

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  if (normalized === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        Active
      </span>
    );
  }
  if (normalized === "EXPIRED" || normalized === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        {normalized === "EXPIRED" ? "Expired" : "Failed"}
      </span>
    );
  }
  if (normalized === "INITIATED" || normalized === "INITIALIZING") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        Pending
      </span>
    );
  }
  if (normalized === "INACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        Inactive
      </span>
    );
  }
  return null;
}

export function ComposioToolkitsSectionSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="h-5 w-48 rounded bg-muted/60" />
      <div className="h-4 w-80 rounded bg-muted/40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 rounded-lg border border-border/60 bg-background/60" />
        <div className="h-32 rounded-lg border border-border/60 bg-background/60" />
        <div className="h-32 rounded-lg border border-border/60 bg-background/60" />
      </div>
    </div>
  );
}

export function ComposioToolkitsSection() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [addingAccountFor, setAddingAccountFor] = useState<string | null>(null);
  const [newAlias, setNewAlias] = useState("");
  const [newAccountType, setNewAccountType] = useState<"PRIVATE" | "SHARED">(
    "PRIVATE",
  );
  const [sharingAccountId, setSharingAccountId] = useState<string | null>(null);
  const [granteeUserId, setGranteeUserId] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const callbackBanner = useMemo(() => {
    const status = searchParams.get("composio");
    const toolkit = searchParams.get("toolkit");
    const reason = searchParams.get("reason");
    if (status === "connected") {
      return {
        type: "success" as const,
        message: `${toolkit ? toolkit.charAt(0).toUpperCase() + toolkit.slice(1) : "Integration"} connected and verified for your Entry account.`,
      };
    }
    if (status === "error") {
      return {
        type: "error" as const,
        message: reason || "OAuth connection did not complete.",
      };
    }
    return null;
  }, [searchParams]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (category !== "All") params.set("category", category);
    return `/api/composio/toolkits?${params.toString()}`;
  }, [search, category]);

  const { data, isLoading, mutate } = useSWR<ComposioToolkitsResponse>(
    queryUrl,
    fetcher,
    { keepPreviousData: true },
  );

  async function handleConnect(
    slug: string,
    options?: { alias?: string; accountType?: "PRIVATE" | "SHARED" },
  ) {
    setBusySlug(slug);
    setFeedback(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          toolkit: slug,
          alias: options?.alias?.trim() || null,
          accountType: options?.accountType ?? "PRIVATE",
          allowMultiple: true,
        }),
      });
      const payload = (await res.json()) as {
        redirectUrl?: string;
        error?: string;
      };
      if (!res.ok || !payload.redirectUrl) {
        setFeedback({
          type: "error",
          message: payload.error || `Failed to initiate ${slug} OAuth flow`,
        });
        return;
      }
      setAddingAccountFor(null);
      setNewAlias("");
      window.location.assign(payload.redirectUrl);
    } catch {
      setFeedback({
        type: "error",
        message: "Network error while initiating connection",
      });
    } finally {
      setBusySlug(null);
    }
  }

  async function handleReconnect(connectedAccountId: string) {
    setBusyAccountId(connectedAccountId);
    setFeedback(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reconnect",
          connectedAccountId,
        }),
      });
      const payload = (await res.json()) as {
        redirectUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: payload.error || "Failed to reconnect account",
        });
        return;
      }
      if (payload.redirectUrl) {
        window.location.assign(payload.redirectUrl);
        return;
      }
      setFeedback({
        type: "success",
        message: "Account credentials refreshed.",
      });
      await mutate();
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleSetDefault(connectedAccountId: string) {
    setBusyAccountId(connectedAccountId);
    setFeedback(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_default",
          connectedAccountId,
        }),
      });
      if (res.ok) {
        setFeedback({
          type: "success",
          message: "Updated default account for this toolkit.",
        });
        await mutate();
      }
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleDisconnect(connectedAccountId: string) {
    setBusyAccountId(connectedAccountId);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/composio/connect?connectedAccountId=${encodeURIComponent(connectedAccountId)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setFeedback({
          type: "success",
          message: "Connected account disconnected and revoked.",
        });
        await mutate();
      } else {
        const err = (await res.json()) as { error?: string };
        setFeedback({
          type: "error",
          message: err.error || "Failed to disconnect account",
        });
      }
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleGrantSharedAccess(connectedAccountId: string) {
    if (!granteeUserId.trim()) return;
    setBusyAccountId(connectedAccountId);
    setFeedback(null);
    try {
      const res = await fetch("/api/composio/shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectedAccountId,
          action: "grant",
          targetUserId: granteeUserId.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({
          type: "error",
          message: payload.error || "Failed to grant shared connection access",
        });
        return;
      }
      setFeedback({
        type: "success",
        message: `Granted shared connection access to user ${granteeUserId.trim()}.`,
      });
      setGranteeUserId("");
      setSharingAccountId(null);
      await mutate();
    } finally {
      setBusyAccountId(null);
    }
  }

  const activeBanner = feedback ?? callbackBanner;
  const toolkits = data?.toolkits ?? [];
  const sharedAccounts = data?.sharedAccounts ?? [];

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
            <KeyRound
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium text-foreground">
                Composio integrations
              </h2>
              <span className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {data?.connectedCount ?? 0} active
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Connect personal, work, or shared accounts with OAuth. Agents
              discover and run tools dynamically inside your session.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => mutate()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:self-auto"
        >
          <RefreshCw
            className={`size-3.5 ${isLoading ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
          <span>Sync status</span>
        </button>
      </div>

      {data && !data.configured ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-xs text-foreground">
          <AlertCircle
            className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
            strokeWidth={1.5}
          />
          <div>
            <span className="font-medium">COMPOSIO_API_KEY not configured</span>
            <p className="mt-0.5 text-muted-foreground">
              Add COMPOSIO_API_KEY to your server environment variables to
              enable live OAuth Connect Links and tool execution.
            </p>
          </div>
        </div>
      ) : null}

      {activeBanner ? (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
            activeBanner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/5 text-foreground"
              : "border-amber-500/30 bg-amber-500/5 text-foreground"
          }`}
        >
          {activeBanner.type === "success" ? (
            <CheckCircle2
              className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              strokeWidth={1.5}
            />
          ) : (
            <AlertCircle
              className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              strokeWidth={1.5}
            />
          )}
          <span>{activeBanner.message}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Gmail, Slack, Linear..."
            aria-label="Search integrations"
            className="h-8 w-full rounded-md border border-border bg-background pr-3 pl-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/40 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {toolkits.map((tk) => {
          const isAdding = addingAccountFor === tk.slug;
          const isBusy = busySlug === tk.slug;

          return (
            <div
              key={tk.slug}
              className="flex flex-col justify-between rounded-lg border border-border bg-background p-3.5"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">
                        {tk.name}
                      </h3>
                      <StatusBadge status={tk.status} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {tk.category}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      if (tk.accounts.length > 0) {
                        setAddingAccountFor(isAdding ? null : tk.slug);
                        setNewAlias("");
                        setNewAccountType("PRIVATE");
                      } else {
                        handleConnect(tk.slug);
                      }
                    }}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {tk.accounts.length > 0 ? (
                      <>
                        <Plus className="size-3" strokeWidth={1.5} />
                        <span>Add account</span>
                      </>
                    ) : (
                      <>
                        <span>Connect</span>
                        <ExternalLink className="size-3" strokeWidth={1.5} />
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {tk.description}
                </p>

                {isAdding ? (
                  <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor={`alias-${tk.slug}`}
                        className="block text-[11px] font-medium text-foreground"
                      >
                        Account label (for multiple accounts)
                      </label>
                      <input
                        id={`alias-${tk.slug}`}
                        type="text"
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        placeholder={`e.g. Work ${tk.name} or Personal`}
                        className="h-7 w-full rounded border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={newAccountType}
                        onChange={(e) =>
                          setNewAccountType(
                            e.target.value === "SHARED" ? "SHARED" : "PRIVATE",
                          )
                        }
                        aria-label="Account visibility"
                        className="h-7 rounded border border-border bg-background px-2 text-[11px] text-foreground"
                      >
                        <option value="PRIVATE">Private (only you)</option>
                        <option value="SHARED">Shared (authorized team)</option>
                      </select>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAddingAccountFor(null)}
                          className="h-7 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleConnect(tk.slug, {
                              alias: newAlias,
                              accountType: newAccountType,
                            })
                          }
                          className="h-7 rounded bg-foreground px-2.5 text-[11px] font-medium text-background hover:opacity-90 disabled:opacity-50"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {tk.accounts.length > 0 ? (
                  <div className="space-y-1.5 border-t border-border/60 pt-2">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      Your connected accounts ({tk.accounts.length})
                    </div>
                    {tk.accounts.map((acc) => {
                      const accBusy = busyAccountId === acc.connectedAccountId;
                      const isSharing =
                        sharingAccountId === acc.connectedAccountId;

                      return (
                        <div
                          key={acc.connectedAccountId}
                          className="space-y-1.5 rounded border border-border/70 bg-card/60 p-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-medium text-foreground">
                                {acc.alias ||
                                  acc.connectedAccountId.slice(0, 12)}
                              </span>
                              {acc.isDefault ? (
                                <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                  Default
                                </span>
                              ) : null}
                              {acc.accountType === "SHARED" ? (
                                <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                  <Users
                                    className="size-2.5"
                                    strokeWidth={1.5}
                                  />
                                  Shared
                                </span>
                              ) : null}
                            </div>
                            <StatusBadge status={acc.status} />
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {!acc.isDefault && acc.status === "ACTIVE" ? (
                              <button
                                type="button"
                                disabled={accBusy}
                                onClick={() =>
                                  handleSetDefault(acc.connectedAccountId)
                                }
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <Star className="size-2.5" strokeWidth={1.5} />
                                <span>Set default</span>
                              </button>
                            ) : null}

                            {acc.status === "EXPIRED" ||
                            acc.status === "FAILED" ||
                            acc.status === "INACTIVE" ? (
                              <button
                                type="button"
                                disabled={accBusy}
                                onClick={() =>
                                  handleReconnect(acc.connectedAccountId)
                                }
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
                              >
                                <RefreshCw
                                  className="size-2.5"
                                  strokeWidth={1.5}
                                />
                                <span>Reconnect</span>
                              </button>
                            ) : null}

                            {acc.accountType === "SHARED" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSharingAccountId(
                                    isSharing ? null : acc.connectedAccountId,
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <Share2
                                  className="size-2.5"
                                  strokeWidth={1.5}
                                />
                                <span>Share</span>
                              </button>
                            ) : null}

                            <button
                              type="button"
                              disabled={accBusy}
                              onClick={() =>
                                handleDisconnect(acc.connectedAccountId)
                              }
                              className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-2.5" strokeWidth={1.5} />
                              <span>Disconnect</span>
                            </button>
                          </div>

                          {isSharing ? (
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                value={granteeUserId}
                                onChange={(e) =>
                                  setGranteeUserId(e.target.value)
                                }
                                placeholder="Authorize Entry user ID"
                                className="h-6 flex-1 rounded border border-border bg-background px-2 text-[11px] text-foreground"
                              />
                              <button
                                type="button"
                                disabled={accBusy || !granteeUserId.trim()}
                                onClick={() =>
                                  handleGrantSharedAccess(
                                    acc.connectedAccountId,
                                  )
                                }
                                className="h-6 rounded bg-foreground px-2 text-[11px] font-medium text-background disabled:opacity-50"
                              >
                                Grant
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Strictly separated Shared Connections section */}
      {sharedAccounts.length > 0 ? (
        <div className="space-y-2.5 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="text-sm font-medium text-foreground">
              Shared connections authorized for you
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Team connections shared with your Entry account. These are kept
            separate from your private credentials.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {sharedAccounts.map((shared) => (
              <div
                key={shared.connectedAccountId}
                className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium capitalize text-foreground">
                      {shared.toolkitSlug}
                    </span>
                    {shared.alias ? (
                      <span className="truncate rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {shared.alias}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Shared by {shared.ownerUserId}
                  </p>
                </div>
                <StatusBadge status={shared.status} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
