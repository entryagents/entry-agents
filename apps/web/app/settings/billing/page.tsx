"use client";

import { ArrowUpRight, Calendar, ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EntryLoadingScreen } from "@/components/entry-loading-screen";
import { EntryMark } from "@/components/entry-mark";
import {
  formatExpirationDate,
  PLAN_STYLES,
  useBillingMe,
} from "@/components/sidebar-billing-widget";
import { Button } from "@/components/ui/button";
import { formatUsdCents } from "@/lib/format-usd";

export default function SettingsBillingPage() {
  const { data: billing, isLoading: isBillingLoading } = useBillingMe();
  const [isCheckingOut, setIsCheckingOut] = useState<number | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const handleOpenPortal = async () => {
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
          "Could not open billing portal right now. Please try again.",
      );
    } catch {
      toast.error("Failed to connect to billing portal");
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
    return <EntryLoadingScreen fullScreen={false} />;
  }

  const planStyle = PLAN_STYLES[billing.plan] ?? PLAN_STYLES.free;
  const isPaidPlan = billing.plan !== "free";
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
            Subscription, spendable balance, and credit top-ups
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPaidPlan ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isOpeningPortal}
              onClick={() => void handleOpenPortal()}
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

      {/* Primary Billing Cards (no usage windows — those live in the sidebar) */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Entry Plan & Spendable Balance Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl border border-border/80 bg-background">
                  <EntryMark className="size-4 text-foreground" />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Entry {billing.planName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isPaidPlan ? "Active subscription" : "Free plan"}
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
                <span>Monthly credit grant</span>
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
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isOpeningPortal}
                onClick={() => void handleOpenPortal()}
                className="w-full cursor-pointer rounded-xl"
              >
                {isOpeningPortal ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="mr-1.5 size-3.5" strokeWidth={1.5} />
                )}
                {isOpeningPortal ? "Opening portal..." : "Manage billing"}
              </Button>
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
              Add one-time credits whenever you need extra capacity beyond your
              monthly grant. Top-up credits are valid for 90 days.
            </p>
          </div>

          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="mb-2.5 text-xs font-medium text-muted-foreground">
              Quick top-up
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 2500, 5000].map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isCheckingOut !== null}
                  onClick={() => void handleTopup(amount)}
                  className="h-8 cursor-pointer rounded-xl font-mono text-xs font-medium tabular-nums"
                >
                  {isCheckingOut === amount ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    `+$${amount / 100}`
                  )}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
