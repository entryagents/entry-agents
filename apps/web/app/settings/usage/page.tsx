"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { toast } from "sonner";
import {
  CreditCard,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  Calendar,
} from "lucide-react";
import {
  useBillingMe,
  formatExpirationDate,
  PLAN_STYLES,
} from "@/components/sidebar-billing-widget";
import { formatUsdCents } from "@/lib/format-usd";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/swr";
import { UsageInsightsSection } from "./usage-insights-section";
import type { UsageInsights } from "@/lib/usage/types";

interface DailyUsageRow {
  date: string;
  source: "web";
  agentType: "main" | "subagent";
  provider: string | null;
  modelId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  messageCount: number;
  toolCallCount: number;
  costUsd: number | null;
}

interface UsageApiResponse {
  usage: DailyUsageRow[];
  insights: UsageInsights;
}

function getUsageWindowPercent(usedCents: number, limitCents: number): number {
  if (limitCents <= 0) return 0;
  if (usedCents >= limitCents) return 100;
  if (usedCents <= 0) return 0;
  return Math.max(1, Math.min(99, Math.floor((usedCents / limitCents) * 100)));
}

export default function SettingsUsagePage() {
  const { data: billing, isLoading: isBillingLoading } = useBillingMe();
  const { data: usageData } = useSWR<UsageApiResponse>("/api/usage", fetcher);
  const [isCheckingOut, setIsCheckingOut] = useState<number | null>(null);

  const handleTopup = async (amountCents: number) => {
    setIsCheckingOut(amountCents);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupAmountCents: amountCents }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create top-up checkout");
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch {
      toast.error("An unexpected error occurred starting checkout");
    } finally {
      setIsCheckingOut(null);
    }
  };

  if (isBillingLoading || !billing) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const planStyle = PLAN_STYLES[billing.plan] ?? PLAN_STYLES.free;
  const windows = billing.usageWindows;
  const isFixed = windows?.mode === "fixed";
  const topUpBalance = billing.topUpBalanceCents ?? 0;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Usage &amp; Credit Telemetry
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Real-time balance, active billing windows, and compute utilization.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="rounded-xl">
          <Link href="/pricing">
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            Pricing &amp; Plans
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* Primary Account Balances Grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Subscription Balance Card */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Plan allowance
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${planStyle.badge}`}
              >
                {billing.planName}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-xs text-muted-foreground">Spendable balance</p>
              <p className="mt-0.5 font-mono text-3xl font-medium tracking-tight tabular-nums text-foreground">
                {formatUsdCents(billing.creditBalanceCents)}
              </p>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Monthly grant</span>
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {billing.creditGrantCents
                    ? formatUsdCents(billing.creditGrantCents)
                    : "$0"}
                </span>
              </div>
              {billing.expiresAt ? (
                <div className="flex justify-between">
                  <span>Cycle renewal</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatExpirationDate(billing.expiresAt)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="w-full rounded-xl"
            >
              <Link href="/pricing">
                Manage subscription
                <ArrowUpRight className="ml-1 size-3.5" strokeWidth={1.5} />
              </Link>
            </Button>
          </div>
        </div>

        {/* Top-up Balance & Quick Top-Up Card */}
        <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Top-up credit
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Calendar className="size-3.5" strokeWidth={1.5} />
                {billing.topUpExpiresAt
                  ? `Valid until ${formatExpirationDate(billing.topUpExpiresAt)}`
                  : "90-day expiry"}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-xs text-muted-foreground">
                Active top-up balance
              </p>
              <p className="mt-0.5 font-mono text-3xl font-medium tracking-tight tabular-nums text-foreground">
                {formatUsdCents(topUpBalance)}
              </p>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Top-up credits stay valid for 90 days from purchase and carry
              across billing cycles.
            </p>
          </div>

          {/* Quick Top-Up Package Buttons */}
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Quick add credit
              </span>
              <span className="tabular-nums">1 USD = $1 compute</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "+$5", cents: 500 },
                { label: "+$10", cents: 1000 },
                { label: "+$25", cents: 2500 },
                { label: "+$50", cents: 5000 },
              ].map(({ label, cents }) => (
                <Button
                  key={cents}
                  size="sm"
                  variant="outline"
                  onClick={() => handleTopup(cents)}
                  disabled={isCheckingOut !== null}
                  className="rounded-lg font-mono text-xs tabular-nums"
                >
                  {isCheckingOut === cents ? "..." : label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Windows Telemetry Card (For Entry / GOAT tier) */}
      {windows && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Usage windows
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pacing limits for predictable compute throughput.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 font-mono text-xs text-muted-foreground">
              <Clock className="size-3.5" strokeWidth={1.5} />
              {isFixed ? "Fixed refill cycles" : "Rolling sliding windows"}
            </span>
          </div>

          <div className="mt-6 space-y-4">
            {[
              {
                label: "5 Hours",
                win: windows.fiveHour,
                desc: isFixed
                  ? windows.fiveHour.resetsAt
                    ? `Fixed 5h block · resets ${new Date(windows.fiveHour.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Fixed 5h refill period"
                  : "Trailing 5-hour rolling window",
              },
              {
                label: "7 Days",
                win: windows.weekly,
                desc: isFixed
                  ? windows.weekly.resetsAt
                    ? `Fixed 7-day block · resets ${formatExpirationDate(windows.weekly.resetsAt)}`
                    : "Fixed 7-day refill period"
                  : "Trailing 7-day rolling window",
              },
              {
                label: "Monthly Cycle",
                win: windows.monthly,
                desc: isFixed
                  ? windows.monthly.resetsAt
                    ? `Cycle renewal on ${formatExpirationDate(windows.monthly.resetsAt)}`
                    : "Monthly subscription allowance"
                  : "Trailing 1-month rolling window",
              },
            ].map(({ label, win, desc }) => {
              const pct = getUsageWindowPercent(win.usedCents, win.limitCents);
              const isFull = win.usedCents >= win.limitCents;
              const isWarn = !isFull && pct >= 75;

              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {label}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ({desc})
                      </span>
                    </div>
                    <span
                      className={`font-mono tabular-nums ${
                        isFull
                          ? "font-medium text-red-500"
                          : isWarn
                            ? "text-amber-500"
                            : "text-muted-foreground"
                      }`}
                    >
                      {formatUsdCents(win.usedCents)} /{" "}
                      {formatUsdCents(win.limitCents)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${
                        isFull
                          ? "bg-red-500"
                          : isWarn
                            ? "bg-amber-400"
                            : "bg-emerald-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2
                className="size-3.5 text-muted-foreground"
                strokeWidth={1.5}
              />
              Real-time ledger sync active
            </span>
            <span className="font-mono text-[11px]">Next sync in ~2s</span>
          </div>
        </div>
      )}

      {/* Model Consumption & Insights */}
      {usageData?.insights && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
          <UsageInsightsSection insights={usageData.insights} />
        </div>
      )}
    </div>
  );
}
