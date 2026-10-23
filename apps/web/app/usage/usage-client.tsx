"use client";

import { useBillingMe, formatExpirationDate, PLAN_STYLES } from "@/components/sidebar-billing-widget";
import { formatUsdCents } from "@/lib/format-usd";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";
import { UsageSection } from "@/app/settings/usage-section";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, CheckCircle2, Clock, Sparkles } from "lucide-react";

export function UsageClient() {
  const { data: billing, isLoading } = useBillingMe();

  const planStyle = billing ? PLAN_STYLES[billing.plan] ?? PLAN_STYLES.free : PLAN_STYLES.free;
  const windows = billing?.usageWindows;
  const isFixed = windows?.mode === "fixed";

  const windowRows = windows
    ? [
        { label: isFixed ? "Fixed 5 Hours" : "Rolling 5 Hours", ...windows.fiveHour },
        { label: isFixed ? "Fixed 7 Days" : "Rolling 7 Days", ...windows.weekly },
        { label: isFixed ? "Fixed 30 Days" : "Rolling 30 Days", ...windows.monthly },
      ]
    : null;

  return (
    <div className="landing relative isolate min-h-screen bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
      <div className="relative z-10">
        <LandingNav showSignIn />

        <main className="mx-auto max-w-[1320px] px-6 pt-32 pb-24 md:pt-40">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-(--l-border) pb-8">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Usage &amp; Balance
              </h1>
              <p className="mt-3 text-base text-(--l-fg-2) sm:text-lg">
                Monitor your live balance, rolling usage limits, and agent compute telemetry.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" className="rounded-full border-(--l-border)">
                <a href="/pricing">
                  Pricing Plans
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Account & Telemetry Cards */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {/* Balance & Subscription Card */}
            <div className="flex flex-col justify-between rounded-3xl border border-(--l-border) bg-(--l-fg)/[0.02] p-6 sm:p-8">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-(--l-fg-3)">
                    Subscription State
                  </span>
                  {billing ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${planStyle.badge}`}
                    >
                      <Sparkles className="h-3 w-3" />
                      {billing.planName} Plan
                    </span>
                  ) : null}
                </div>

                <div className="mt-4">
                  <p className="text-xs text-(--l-fg-3)">Available Credit Balance</p>
                  <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-(--l-fg) sm:text-5xl">
                    {isLoading ? "..." : formatUsdCents(billing?.creditBalanceCents ?? 0)}
                  </p>
                </div>

                <div className="mt-6 space-y-2 border-t border-(--l-border) pt-4 text-xs text-(--l-fg-2)">
                  <div className="flex justify-between">
                    <span>Monthly Credit Grant</span>
                    <span className="font-mono font-medium text-(--l-fg)">
                      {billing?.creditGrantCents ? formatUsdCents(billing.creditGrantCents) : "$0"}
                    </span>
                  </div>
                  {billing?.expiresAt ? (
                    <div className="flex justify-between">
                      <span>Subscription Expiry</span>
                      <span className="font-mono font-medium text-(--l-fg)">
                        {formatExpirationDate(billing.expiresAt)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-(--l-border)">
                <Button asChild className="w-full rounded-xl">
                  <a href="/pricing">Change Plan or Add Credit</a>
                </Button>
              </div>
            </div>

            {/* Windows Telemetry Card */}
            <div className="flex flex-col justify-between rounded-3xl border border-(--l-border) bg-(--l-fg)/[0.02] p-6 sm:p-8">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-(--l-fg-3)">
                    Usage Windows
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-(--l-fg-3)">
                    <Clock className="h-3.5 w-3.5" />
                    {isFixed ? "Fixed Refill Cycle" : "Continuous Sliding Windows"}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-(--l-fg-2)">
                  {isFixed
                    ? "Fixed usage cycles reset 100% of your allowance at the end of each window period."
                    : "Rolling allowances refill continuously as your previous requests age out of the lookback window."}
                </p>

                {windowRows ? (
                  <div className="mt-6 flex flex-col gap-4">
                    {windowRows.map((row) => {
                      const pct =
                        row.usedCents >= row.limitCents
                          ? 100
                          : row.usedCents > 0
                            ? Math.max(
                                1,
                                Math.min(
                                  99,
                                  Math.floor((row.usedCents / Math.max(1, row.limitCents)) * 100),
                                ),
                              )
                            : 0;
                      const full = row.usedCents >= row.limitCents;

                      return (
                        <div key={row.label} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-(--l-fg-2)">{row.label}</span>
                            <span
                              className={`font-mono tabular-nums ${full ? "font-semibold text-red-500" : "text-(--l-fg-2)"}`}
                            >
                              {formatUsdCents(row.usedCents)} / {formatUsdCents(row.limitCents)}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-(--l-border)">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                full ? "bg-red-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-8 rounded-2xl border border-dashed border-(--l-border) p-6 text-center text-xs text-(--l-fg-3)">
                    Usage windows apply to the Entry (Goat) plan. Your current plan uses standard balance metering.
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-(--l-border) flex items-center justify-between text-xs text-(--l-fg-3)">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  Real-time synchronization active
                </span>
              </div>
            </div>
          </div>

          {/* Historical Token Analytics & Breakdown */}
          <div className="mt-12 rounded-3xl border border-(--l-border) bg-(--l-fg)/[0.01] p-6 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight text-(--l-fg) mb-6">
              Activity &amp; Consumption History
            </h2>
            <UsageSection />
          </div>
        </main>

        <LandingFooter />
      </div>
    </div>
  );
}
