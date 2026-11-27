"use client";

import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EntryMark } from "@/components/entry-mark";
import {
  formatExpirationDate,
  PLAN_STYLES,
  useBillingMe,
} from "@/components/sidebar-billing-widget";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsdCents } from "@/lib/format-usd";

function getUsageWindowPercent(usedCents: number, limitCents: number): number {
  if (limitCents <= 0) return 0;
  if (usedCents >= limitCents) return 100;
  if (usedCents <= 0) return 0;
  return Math.max(1, Math.min(99, Math.floor((usedCents / limitCents) * 100)));
}

export default function SettingsBillingPage() {
  const { data: billing, isLoading: isBillingLoading } = useBillingMe();
  const [isCheckingOut, setIsCheckingOut] = useState<number | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const handleManageSubscription = async () => {
    setIsOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      toast.error(
        data?.error ??
          "Could not open billing portal — redirecting to plans instead",
      );
      window.location.href = "/pricing";
    } catch {
      toast.error("Failed to open billing portal");
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleTopup = async (amountCents: number) => {
    setIsCheckingOut(amountCents);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupAmountCents: amountCents }),
      });
      const data = (await res.json().catch(() => null)) as {
        checkoutUrl?: string;
        error?: string;
      } | null;
      if (!res.ok) {
        toast.error(data?.error ?? "Failed to create top-up checkout");
        return;
      }
      if (data?.checkoutUrl) {
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
        <Skeleton className="h-14 w-64 rounded-xl" />
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-60 rounded-2xl" />
          <Skeleton className="h-60 rounded-2xl" />
        </div>
      </div>
    );
  }

  const planStyle = PLAN_STYLES[billing.plan] ?? PLAN_STYLES.free;
  const isPaidPlan = billing.plan !== "free";
  const windows = billing.usageWindows;
  const isFixed = windows?.mode === "fixed";
  const topUpBalance = billing.topUpBalanceCents ?? 0;
  const hasFutureRenewal =
    Boolean(billing.expiresAt) &&
    new Date(billing.expiresAt as string).getTime() > Date.now();

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan, credit balance, top-ups, and active usage windows
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPaidPlan ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isOpeningPortal}
              onClick={() => void handleManageSubscription()}
              className="cursor-pointer rounded-xl"
            >
              {isOpeningPortal ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <ExternalLink className="mr-1.5 size-3.5" strokeWidth={1.5} />
              )}
              Manage subscription
            </Button>
          ) : (
            <Button asChild size="sm" className="rounded-xl">
              <Link href="/pricing">
                Upgrade plan
                <ArrowUpRight className="ml-1 size-3.5" strokeWidth={1.5} />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Primary Billing Cards */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Branded Entry Plan & Spendable Balance Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg border border-border/80 bg-background">
                  <EntryMark className="size-4 text-foreground" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Entry {billing.planName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isPaidPlan ? "Active subscription" : "Free trial"}
                  </p>
                </div>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${planStyle.badge}`}
              >
                {billing.planName}
              </span>
            </div>

            <div className="mt-6">
              <p className="text-xs text-muted-foreground">Spendable balance</p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {formatUsdCents(billing.creditBalanceCents)}
              </p>
            </div>

            <div className="mt-5 space-y-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Monthly grant</span>
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {billing.creditGrantCents
                    ? formatUsdCents(billing.creditGrantCents)
                    : "$0"}
                </span>
              </div>
              {hasFutureRenewal && billing.expiresAt ? (
                <div className="flex items-center justify-between">
                  <span>Next renewal</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {formatExpirationDate(billing.expiresAt)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 border-t border-border/60 pt-4">
            {isPaidPlan ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isOpeningPortal}
                  onClick={() => void handleManageSubscription()}
                  className="flex-1 cursor-pointer rounded-xl"
                >
                  {isOpeningPortal ? "Opening portal..." : "Manage billing"}
                  <ExternalLink className="ml-1.5 size-3.5" strokeWidth={1.5} />
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-muted-foreground hover:text-foreground"
                >
                  <Link href="/pricing">Compare plans</Link>
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="w-full rounded-xl">
                <Link href="/pricing">
                  Upgrade plan
                  <ArrowUpRight className="ml-1 size-3.5" strokeWidth={1.5} />
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Top-up Credit Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                Top-up credit
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <Calendar className="size-3.5" strokeWidth={1.5} />
                {billing.topUpExpiresAt
                  ? `Valid until ${formatExpirationDate(billing.topUpExpiresAt)}`
                  : "90-day expiry"}
              </span>
            </div>

            <div className="mt-6">
              <p className="text-xs text-muted-foreground">
                Active top-up balance
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {formatUsdCents(topUpBalance)}
              </p>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Top-up credits stay valid for 90 days from purchase and carry
              across billing cycles.
            </p>
          </div>

          <div className="mt-5 border-t border-border/60 pt-4">
            <div className="mb-2.5 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Quick add credit
              </span>
              <span className="font-mono tabular-nums">$1 = $1 compute</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "+$5", cents: 500 },
                { label: "+$10", cents: 1000 },
                { label: "+$25", cents: 2500 },
                { label: "+$50", cents: 5000 },
              ].map(({ label, cents }) => (
                <Button
                  key={cents}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleTopup(cents)}
                  disabled={isCheckingOut !== null}
                  className="cursor-pointer rounded-xl font-mono text-xs tabular-nums"
                >
                  {isCheckingOut === cents ? "..." : label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Usage Windows Card */}
      {windows && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-4">
            <div>
              <h2 className="text-sm font-medium text-foreground">
                Usage windows
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pacing limits for predictable compute throughput
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 font-mono text-xs text-muted-foreground">
              <Clock className="size-3.5" strokeWidth={1.5} />
              {isFixed ? "Fixed refill cycles" : "Rolling sliding windows"}
            </span>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {[
              {
                label: "5-hour window",
                used: windows.fiveHour.usedCents,
                limit: windows.fiveHour.limitCents,
              },
              {
                label: "Weekly window",
                used: windows.weekly.usedCents,
                limit: windows.weekly.limitCents,
              },
              {
                label: "Monthly cycle",
                used: windows.monthly.usedCents,
                limit: windows.monthly.limitCents,
              },
            ].map((row) => {
              const pct = getUsageWindowPercent(row.used, row.limit);
              const isFull = pct >= 100;
              const isWarn = pct >= 80 && !isFull;
              return (
                <div
                  key={row.label}
                  className="rounded-xl border border-border/60 bg-background/60 p-4"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                    <div
                      className={`h-full rounded-full transition-[width] duration-200 ${
                        isFull
                          ? "bg-red-500"
                          : isWarn
                            ? "bg-amber-500"
                            : "bg-foreground/80"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
                    <span>{formatUsdCents(row.used)} used</span>
                    <span>{formatUsdCents(row.limit)} limit</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Link to Usage Breakdown */}
      <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <CheckCircle2
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.5}
          />
          <p className="text-xs text-muted-foreground">
            Looking for token totals, model breakdown, or repository activity?
          </p>
        </div>
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="rounded-xl text-xs"
        >
          <Link href="/settings/usage">
            Open Usage
            <ArrowUpRight className="ml-1 size-3.5" strokeWidth={1.5} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
