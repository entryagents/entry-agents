"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import useSWR, { mutate } from "swr";
import { EntryMark } from "@/components/entry-mark";
import { cn } from "@/lib/utils";
import { formatUsdCents } from "@/lib/format-usd";

export interface UsageWindowMetric {
  usedCents: number;
  limitCents: number;
  resetsAt?: string | null;
}

export interface BillingMeResponse {
  plan: string;
  planName: string;
  creditBalanceCents: number;
  creditGrantCents: number;
  topUpBalanceCents?: number;
  topUpExpiresAt?: string | null;
  billingCycleAnchor?: string | null;
  expiresAt?: string | null;
  usageWindows?: {
    mode?: "rolling" | "fixed";
    fiveHour: UsageWindowMetric;
    weekly: UsageWindowMetric;
    monthly: UsageWindowMetric;
  } | null;
}

export function formatExpirationDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return "";
  }
}

const BILLING_SWR_KEY = "/api/billing/me";
const BILLING_SYNC_CHANNEL = "entry-billing-sync";

async function fetchBillingMeNoStore(url: string): Promise<BillingMeResponse> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch billing state: ${res.status}`);
  }
  return res.json() as Promise<BillingMeResponse>;
}

/**
 * Triggers an immediate revalidation of `/api/billing/me` in the current tab
 * and broadcasts to all other open tabs/windows on the same device.
 * Other devices stay synchronized within ~2 seconds via `refreshInterval: 2000`.
 */
export function triggerBillingSync(): void {
  void mutate(BILLING_SWR_KEY);
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    try {
      const bc = new BroadcastChannel(BILLING_SYNC_CHANNEL);
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      bc.postMessage({ type: "sync", at: Date.now() });
      bc.close();
    } catch {
      // Ignore BroadcastChannel errors in restricted contexts
    }
  }
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
    badge: "bg-blue-500/12 text-blue-600 dark:text-blue-400 border-blue-500/25",
    card: "border-border/70 bg-muted/20",
    segmentActive: "bg-blue-400",
  },
  entry: {
    badge:
      "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    card: "border-border/70 bg-muted/20",
    segmentActive: "bg-emerald-400",
  },
  pro: {
    badge:
      "bg-violet-500/12 text-violet-600 dark:text-violet-400 border-violet-500/25",
    card: "border-border/70 bg-muted/20",
    segmentActive: "bg-violet-400",
  },
  max: {
    badge:
      "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25",
    card: "border-border/70 bg-muted/20",
    segmentActive: "bg-amber-400",
  },
};

export function useBillingMe() {
  const swr = useSWR<BillingMeResponse>(
    BILLING_SWR_KEY,
    fetchBillingMeNoStore,
    {
      refreshInterval: 2_000,
      dedupingInterval: 800,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshWhenHidden: false,
    },
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BILLING_SYNC_CHANNEL);
      bc.addEventListener("message", () => {
        void swr.mutate();
      });
    } catch {
      // Ignore if unsupported
    }
    return () => {
      try {
        bc?.close();
      } catch {
        // Ignore close error
      }
    };
  }, [swr]);

  return swr;
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
      <div className="h-6 w-14 shrink-0 rounded-full border border-border/50 bg-muted/70" />
    );
  }

  return (
    <div
      title="Current credit balance"
      className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-foreground"
    >
      {formatUsdCents(data.creditBalanceCents)}
    </div>
  );
}

function hasPlanUsageWindows(data: BillingMeResponse): boolean {
  return (
    Boolean(data.usageWindows) ||
    data.plan === "entry" ||
    data.plan === "goat" ||
    data.plan === "plus"
  );
}

/**
 * Rounded-rectangle balance badge rendered on the right side of the desktop
 * profile footer row (e.g. "$1"). Hidden for plans with usage windows since
 * their balance and usage windows are displayed in DesktopCodexBillingStatus.
 */
export function DesktopBalanceBox() {
  const { data, isLoading } = useBillingMe();
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();

  if (isLoading || !data || hasPlanUsageWindows(data)) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (isMobile) setOpenMobile(false);
        router.push("/pricing");
      }}
      title={`Credit balance: ${formatUsdCents(data.creditBalanceCents)} (View plans & top up)`}
      className="flex h-8 min-w-[48px] shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background/85 px-2.5 font-mono text-xs font-medium tabular-nums text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,background-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-foreground/25 hover:bg-background active:scale-[0.98] cursor-pointer dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
    >
      {formatCompactUsdCents(data.creditBalanceCents)}
    </button>
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

  const normalizedPlan = data.plan === "goat" ? "entry" : data.plan;
  const style = PLAN_STYLES[normalizedPlan] ?? PLAN_STYLES.free;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
        style.badge,
      )}
    >
      {showIcon ? <EntryMark className="h-2.5 w-2.5 shrink-0" /> : null}
      <span>{data.planName}</span>
    </span>
  );
}

/**
 * Usage Windows Telemetry for the Desktop Sidebar.
 * Rendered when the user is on a paid plan with 5h / 7d / 30d usage windows
 * (Plus $3/mo and Builder $10/mo).
 */
function getUsageWindowPercent(usedCents: number, limitCents: number): number {
  if (limitCents <= 0) return 0;
  if (usedCents >= limitCents) return 100;
  if (usedCents <= 0) return 0;
  return Math.max(1, Math.min(99, Math.floor((usedCents / limitCents) * 100)));
}

const SEGMENT_COUNT = 10;
const SEGMENT_INDICES = Array.from({ length: SEGMENT_COUNT }, (_, idx) => idx);

export function DesktopCodexBillingStatus() {
  const { data, isLoading } = useBillingMe();

  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();

  if (isLoading || !data || !hasPlanUsageWindows(data)) {
    return null;
  }

  const isPlusPlan = data.plan === "plus";
  const defaultGrantCents = isPlusPlan ? 600 : 2800;
  const grantCents =
    data.creditGrantCents > 0 ? data.creditGrantCents : defaultGrantCents;
  const windows = data.usageWindows ?? {
    fiveHour: { usedCents: 0, limitCents: isPlusPlan ? 150 : 600 },
    weekly: { usedCents: 0, limitCents: isPlusPlan ? 350 : 1400 },
    monthly: {
      usedCents: Math.max(0, grantCents - data.creditBalanceCents),
      limitCents: grantCents,
    },
  };

  const monthlyRemainingCents = Math.max(
    0,
    windows.monthly.limitCents - windows.monthly.usedCents,
  );
  const effectiveRemainingCents =
    data.creditBalanceCents >= 0
      ? Math.min(data.creditBalanceCents, monthlyRemainingCents)
      : 0;

  return (
    <button
      type="button"
      onClick={() => {
        if (isMobile) setOpenMobile(false);
        router.push("/settings/usage");
      }}
      title="Open usage and billing details"
      className="group w-full cursor-pointer rounded-xl border border-border/80 bg-background/80 p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,background-color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-foreground/20 hover:bg-background active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-white/[0.03] dark:hover:bg-white/[0.05]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-[#c85c20] dark:bg-[#e07638]"
          />
          <span className="truncate text-[12px] font-medium tracking-[-0.01em] text-foreground">
            {data.planName || "Usage"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[12px] tabular-nums">
          <span className="font-semibold text-foreground">
            {formatUsdCents(effectiveRemainingCents)}
          </span>
          <span className="ml-1 text-[10.5px] text-muted-foreground">left</span>
        </span>
      </div>

      <div className="mt-2.5 space-y-2">
        {(
          [
            { label: "5h", win: windows.fiveHour },
            { label: "7d", win: windows.weekly },
            { label: "30d", win: windows.monthly },
          ] as const
        ).map(({ label, win }) => {
          const pct = getUsageWindowPercent(win.usedCents, win.limitCents);
          const isFull = win.usedCents >= win.limitCents;
          const isWarn = !isFull && pct >= 80;
          const filledSegments =
            pct <= 0
              ? 0
              : isFull
                ? SEGMENT_COUNT
                : Math.max(1, Math.round((pct / 100) * SEGMENT_COUNT));
          const remaining = Math.max(0, win.limitCents - win.usedCents);
          return (
            <div
              key={label}
              title={`${label}: ${formatUsdCents(win.usedCents)} of ${formatUsdCents(win.limitCents)} used (${formatUsdCents(remaining)} left)`}
              className="grid grid-cols-[24px_1fr_30px] items-center gap-2"
            >
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {label}
              </span>
              <div aria-hidden="true" className="grid grid-cols-10 gap-[2.5px]">
                {SEGMENT_INDICES.map((segmentIdx) => {
                  const active = segmentIdx < filledSegments;
                  return (
                    <span
                      key={segmentIdx}
                      className={cn(
                        "h-[5px] rounded-[1.5px] transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        active
                          ? isFull
                            ? "bg-red-500"
                            : isWarn
                              ? "bg-amber-500"
                              : "bg-[#c85c20] dark:bg-[#e07638]"
                          : "bg-foreground/[0.08] dark:bg-white/[0.08]",
                      )}
                    />
                  );
                })}
              </div>
              <span
                className={cn(
                  "text-right font-mono text-[10.5px] tabular-nums",
                  isFull
                    ? "font-semibold text-red-500 dark:text-red-400"
                    : isWarn
                      ? "font-semibold text-amber-600 dark:text-amber-400"
                      : pct > 0
                        ? "text-foreground/85"
                        : "text-muted-foreground/65",
                )}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {data.expiresAt ? (
        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-[10.5px] text-muted-foreground">
          <span>Cycle renews</span>
          <span className="font-mono tabular-nums text-foreground/80">
            {formatExpirationDate(data.expiresAt)}
          </span>
        </div>
      ) : null}
    </button>
  );
}
