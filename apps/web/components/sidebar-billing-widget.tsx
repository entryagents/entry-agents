"use client";

import useSWR from "swr";
import { EntryMark } from "@/components/entry-mark";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { formatUsdCents } from "@/lib/format-usd";

export interface UsageWindowMetric {
  usedCents: number;
  limitCents: number;
}

export interface BillingMeResponse {
  plan: string;
  planName: string;
  creditBalanceCents: number;
  creditGrantCents: number;
  usageWindows?: {
    fiveHour: UsageWindowMetric;
    weekly: UsageWindowMetric;
    monthly: UsageWindowMetric;
  } | null;
}

export const PLAN_STYLES: Record<
  string,
  {
    badge: string;
    card: string;
    segmentActive: string;
  }
> = {
  free: {
    badge: "bg-muted text-muted-foreground border-border/60",
    card: "border-border/60 bg-background/40",
    segmentActive: "bg-muted-foreground/60",
  },
  plus: {
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    card: "border-blue-500/20 bg-gradient-to-b from-blue-500/[0.05] to-transparent",
    segmentActive: "bg-blue-400",
  },
  goat: {
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    card: "border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] via-background/60 to-background/30",
    segmentActive: "bg-emerald-400",
  },
  pro: {
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    card: "border-violet-500/20 bg-gradient-to-b from-violet-500/[0.05] to-transparent",
    segmentActive: "bg-violet-400",
  },
  max: {
    badge:
      "bg-gradient-to-r from-amber-400/20 via-orange-400/20 to-pink-500/20 text-amber-400 border-amber-400/30",
    card: "border-amber-400/20 bg-gradient-to-b from-amber-400/[0.06] to-transparent",
    segmentActive: "bg-amber-400",
  },
};

export function useBillingMe() {
  return useSWR<BillingMeResponse>("/api/billing/me", fetcher, {
    refreshInterval: 60_000,
  });
}

export function formatCompactUsdCents(cents: number): string {
  if (!Number.isFinite(cents)) {
    return "$0";
  }
  const dollars = cents / 100;
  if (cents % 100 === 0) {
    return `$${dollars.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
  return formatUsdCents(cents);
}

/**
 * Compact credit-balance pill shown in the mobile sidebar's profile footer,
 * next to the settings gear button.
 */
export function SidebarBalancePill() {
  const { data, isLoading } = useBillingMe();

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
 * Rounded-rectangle balance badge rendered on the right side of the desktop
 * profile footer row (e.g. "$5" or "$184.20"), matching the compact footer design.
 */
export function DesktopBalanceBox() {
  const { data, isLoading } = useBillingMe();

  if (isLoading || !data) {
    return (
      <div className="h-9 w-12 shrink-0 animate-pulse rounded-xl border border-border/50 bg-muted/60" />
    );
  }

  return (
    <div
      title={`Credit balance: ${formatUsdCents(data.creditBalanceCents)}`}
      className="flex h-9 min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-border bg-background/80 px-2.5 font-mono text-xs font-semibold tabular-nums text-foreground shadow-2xs"
    >
      {formatCompactUsdCents(data.creditBalanceCents)}
    </div>
  );
}

/**
 * Small plan-name tag rendered in the mobile profile footer row or inside
 * the desktop profile popover menu.
 */
export function SidebarPlanBadge({ showIcon = false }: { showIcon?: boolean }) {
  const { data, isLoading } = useBillingMe();

  if (isLoading || !data) {
    return null;
  }

  const style = PLAN_STYLES[data.plan] ?? PLAN_STYLES.free;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        style.badge,
      )}
    >
      {showIcon ? <EntryMark className="h-2.5 w-2.5 shrink-0" /> : null}
      <span>{data.planName}</span>
    </span>
  );
}

/**
 * Improved Method 1 Rolling Usage Windows Telemetry for the Desktop Sidebar.
 * Exclusively rendered when the user is on the "goat" (flagship Entry) plan.
 * Does not render a redundant plan badge (plan is shown inside the profile menu).
 */
export function DesktopCodexBillingStatus() {
  const { data, isLoading } = useBillingMe();

  if (isLoading || !data || data.plan !== "goat") {
    return null;
  }

  const grantCents = data.creditGrantCents > 0 ? data.creditGrantCents : 20000;
  const windows = data.usageWindows ?? {
    fiveHour: { usedCents: 0, limitCents: 2000 },
    weekly: { usedCents: 0, limitCents: 8000 },
    monthly: {
      usedCents: Math.max(0, grantCents - data.creditBalanceCents),
      limitCents: grantCents,
    },
  };

  return (
    <div
      title="Rolling usage windows and available credit balance"
      className={cn(
        "space-y-1.5 rounded-xl border p-2 shadow-2xs transition-colors",
        PLAN_STYLES.goat.card,
      )}
    >
      <div className="flex items-center justify-between gap-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Usage Windows
          </span>
        </div>

        <div className="flex items-baseline gap-1 font-mono text-[11px] tabular-nums">
          <span className="font-semibold text-foreground">
            {formatUsdCents(data.creditBalanceCents)}
          </span>
          {grantCents > 0 ? (
            <span className="text-[10px] text-muted-foreground/75">
              / {formatCompactUsdCents(grantCents)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        {(
          [
            { label: "5h", win: windows.fiveHour },
            { label: "7d", win: windows.weekly },
            { label: "30d", win: windows.monthly },
          ] as const
        ).map(({ label, win }) => {
          const pct = Math.min(
            100,
            Math.round((win.usedCents / Math.max(1, win.limitCents)) * 100),
          );
          const isFull = win.usedCents >= win.limitCents;
          const isWarn = !isFull && pct >= 75;
          return (
            <div
              key={label}
              title={`Rolling ${label}: ${formatUsdCents(win.usedCents)} used of ${formatUsdCents(win.limitCents)}`}
              className="rounded-lg border border-border/60 bg-background/75 px-1.5 py-1"
            >
              <div className="flex items-center justify-between font-mono text-[10px] leading-none">
                <span className="text-muted-foreground">{label}</span>
                <span
                  className={cn(
                    "tabular-nums",
                    isFull
                      ? "font-semibold text-red-400"
                      : isWarn
                        ? "font-medium text-amber-400"
                        : "text-foreground/90",
                  )}
                >
                  {pct}%
                </span>
              </div>
              <div className="my-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    isFull
                      ? "bg-red-500"
                      : isWarn
                        ? "bg-amber-400"
                        : "bg-emerald-400",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="truncate font-mono text-[9px] leading-none tabular-nums text-muted-foreground/75">
                {formatCompactUsdCents(win.usedCents)}/
                {formatCompactUsdCents(win.limitCents)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
