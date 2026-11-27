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
      className="flex h-8 min-w-[44px] shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/60 px-2.5 font-mono text-xs font-medium tabular-nums text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-muted/70 cursor-pointer"
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
 * (Plus $3/mo and Pro $10/mo).
 */
function getUsageWindowPercent(usedCents: number, limitCents: number): number {
  if (limitCents <= 0) return 0;
  if (usedCents >= limitCents) return 100;
  if (usedCents <= 0) return 0;
  return Math.max(1, Math.min(99, Math.floor((usedCents / limitCents) * 100)));
}

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
      className="group w-full cursor-pointer rounded-xl border border-border/70 bg-background/50 p-2.5 text-left transition-[border-color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-border hover:bg-background/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] font-medium text-foreground">
          {data.planName || "Usage"}
        </span>
        <span className="shrink-0 font-mono text-[11.5px] tabular-nums">
          <span className="font-medium text-foreground">
            {formatUsdCents(effectiveRemainingCents)}
          </span>
          <span className="ml-1 text-muted-foreground">left</span>
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
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
          const remaining = Math.max(0, win.limitCents - win.usedCents);
          return (
            <div
              key={label}
              title={`${label}: ${formatUsdCents(win.usedCents)} of ${formatUsdCents(win.limitCents)} used (${formatUsdCents(remaining)} left)`}
              className="flex items-center gap-2"
            >
              <span className="w-6 shrink-0 font-mono text-[11px] text-muted-foreground">
                {label}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    isFull
                      ? "bg-red-500"
                      : isWarn
                        ? "bg-amber-500"
                        : "bg-foreground/75",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={cn(
                  "w-8 shrink-0 text-right font-mono text-[11px] tabular-nums",
                  isFull
                    ? "font-medium text-red-500 dark:text-red-400"
                    : isWarn
                      ? "font-medium text-amber-600 dark:text-amber-400"
                      : pct > 0
                        ? "text-foreground/85"
                        : "text-muted-foreground/70",
                )}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {data.expiresAt ? (
        <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground">
          <span>Renews</span>
          <span className="font-mono tabular-nums text-foreground/80">
            {formatExpirationDate(data.expiresAt)}
          </span>
        </div>
      ) : null}
    </button>
  );
}
