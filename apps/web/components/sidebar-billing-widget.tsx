"use client";

import useSWR from "swr";
import { EntryMark } from "@/components/entry-mark";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import { formatUsdCents } from "@/lib/format-usd";

interface WindowUsage {
  usedCents: number;
  limitCents: number;
}

interface BillingMeResponse {
  plan: string;
  planName: string;
  creditBalanceCents: number;
  creditGrantCents: number;
  usageWindows?: {
    fiveHour: WindowUsage;
    weekly: WindowUsage;
    monthly: WindowUsage;
  } | null;
}

/**
 * Per-plan visual identity, shared by the balance pill, the plan
 * badge below, and the bespoke desktop telemetry deck.
 */
const PLAN_STYLES: Record<
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
    card: "border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-transparent",
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
 * mobile profile footer row.
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

const TOTAL_LED_SEGMENTS = 20;

/**
 * Bespoke Desktop Telemetry Deck for Plan & Credit Balance.
 * - Uses the official EntryMark SVG inside the plan badge.
 * - Displays read-only credit balance vs. plan grant in crisp tabular numerals.
 * - For the flagship Entry plan (which returns rolling usageWindows from /api/billing/me),
 *   renders a 3-column live micro-gauge for the 5h, 7d, and 30d rolling windows.
 * - For all other plans (Free, Plus, Pro, Max), renders a 20-segment precision LED
 *   credit pool meter.
 */
export function DesktopCodexBillingStatus() {
  const { data, isLoading } = useSWR<BillingMeResponse>(
    "/api/billing/me",
    fetcher,
    { refreshInterval: 60_000 },
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-2 rounded-xl border border-border/50 bg-background/40 p-2.5">
        <div className="flex items-center justify-between">
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-2 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const style = PLAN_STYLES[data.plan] ?? PLAN_STYLES.free;
  const grantCents = data.creditGrantCents > 0 ? data.creditGrantCents : 0;
  const ratio =
    grantCents > 0
      ? Math.min(1, Math.max(0, data.creditBalanceCents / grantCents))
      : 0;
  const activeSegments = Math.round(ratio * TOTAL_LED_SEGMENTS);
  const windows = data.usageWindows ?? null;

  return (
    <div
      title="Current plan and available credit balance"
      className={cn(
        "space-y-2 rounded-xl border p-2.5 transition-colors",
        style.card,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            style.badge,
          )}
        >
          <EntryMark className="h-2.5 w-2.5 shrink-0" />
          <span>{data.planName}</span>
        </span>

        <div className="flex items-baseline gap-1 font-mono text-xs tabular-nums">
          <span className="font-semibold text-foreground">
            {formatUsdCents(data.creditBalanceCents)}
          </span>
          {grantCents > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              / {formatUsdCents(grantCents)}
            </span>
          ) : null}
        </div>
      </div>

      {windows ? (
        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
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
            return (
              <div
                key={label}
                title={`Rolling ${label}: ${formatUsdCents(win.usedCents)} of ${formatUsdCents(win.limitCents)}`}
                className="rounded-lg border border-border/60 bg-background/60 px-2 py-1"
              >
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-muted-foreground">{label}</span>
                  <span
                    className={
                      isFull
                        ? "font-semibold text-red-400"
                        : "text-foreground/85"
                    }
                  >
                    {pct}%
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      isFull ? "bg-red-500" : style.segmentActive,
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : grantCents > 0 ? (
        <div className="flex items-center gap-0.5 pt-0.5">
          {Array.from({ length: TOTAL_LED_SEGMENTS }).map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "h-1.5 flex-1 rounded-[1px] transition-colors",
                idx < activeSegments ? style.segmentActive : "bg-muted/70",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
