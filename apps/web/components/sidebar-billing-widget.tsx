"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { formatUsdCents } from "@/lib/format-usd";

interface BillingMeResponse {
  plan: string;
  planName: string;
  creditBalanceCents: number;
  creditGrantCents: number;
}

/**
 * Per-plan visual identity, shared by the balance pill, the plan
 * badge below, and the desktop Codex billing status widget.
 */
const PLAN_STYLES: Record<
  string,
  {
    badge: string;
    dot: string;
    bar: string;
  }
> = {
  free: {
    badge: "bg-muted text-muted-foreground border-border/60",
    dot: "bg-muted-foreground/60",
    bar: "bg-muted-foreground/50",
  },
  plus: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    dot: "bg-blue-400",
    bar: "bg-blue-400",
  },
  goat: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
  },
  pro: {
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/25",
    dot: "bg-violet-400",
    bar: "bg-violet-400",
  },
  max: {
    badge:
      "bg-gradient-to-r from-amber-400/20 via-orange-400/20 to-pink-500/20 text-amber-400 border-amber-400/30",
    dot: "bg-amber-400",
    bar: "bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500",
  },
};

/**
 * Compact credit-balance pill shown in the mobile sidebar's profile footer,
 * next to the settings gear button.
 */
export function SidebarBalancePill() {
  const { data, isLoading } = useSWR<BillingMeResponse>(
    "/api/billing/me",
    fetcher,
    { refreshInterval: 60_000 },
  );

  if (isLoading || !data) {
    return (
      <div className="h-6 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
    );
  }

  return (
    <div
      title="Current credit balance"
      className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground"
    >
      {formatUsdCents(data.creditBalanceCents)}
    </div>
  );
}

/**
 * Small plan-name tag rendered right next to the username in the
 * profile footer row.
 */
export function SidebarPlanBadge() {
  const { data, isLoading } = useSWR<BillingMeResponse>(
    "/api/billing/me",
    fetcher,
    { refreshInterval: 60_000 },
  );

  if (isLoading || !data) {
    return null;
  }

  const style = PLAN_STYLES[data.plan] ?? PLAN_STYLES.free;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        style.badge,
      )}
    >
      {data.planName}
    </span>
  );
}

/**
 * Redesigned Desktop Codex Billing & Plan Telemetry Strip.
 * Displays the user's current plan badge (with live status dot),
 * read-only credit balance in crisp monospace tabular numerals, and a
 * subtle credit meter bar when creditGrantCents > 0.
 */
export function DesktopCodexBillingStatus() {
  const { data, isLoading } = useSWR<BillingMeResponse>(
    "/api/billing/me",
    fetcher,
    { refreshInterval: 60_000 },
  );

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-4 w-12 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const style = PLAN_STYLES[data.plan] ?? PLAN_STYLES.free;
  const grantCents = data.creditGrantCents > 0 ? data.creditGrantCents : 0;
  const ratio =
    grantCents > 0
      ? Math.min(100, Math.max(0, (data.creditBalanceCents / grantCents) * 100))
      : null;

  return (
    <div
      title="Current plan and available credit balance"
      className="space-y-1.5 rounded-lg border border-border/60 bg-background/50 px-2.5 py-2 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              style.badge,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
            {data.planName}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            Plan
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground">Balance</span>
          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
            {formatUsdCents(data.creditBalanceCents)}
          </span>
        </div>
      </div>

      {ratio !== null ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/80">
          <div
            className={cn("h-full rounded-full transition-all duration-300", style.bar)}
            style={{ width: `${ratio}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
