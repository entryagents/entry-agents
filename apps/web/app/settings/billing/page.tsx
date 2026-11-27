"use client";

import { ExternalLink, Info, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EntryLoadingScreen } from "@/components/entry-loading-screen";
import { EntryMark } from "@/components/entry-mark";
import {
  formatExpirationDate,
  useBillingMe,
} from "@/components/sidebar-billing-widget";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { formatUsdCents } from "@/lib/format-usd";

const PLAN_MONTHLY_PRICE_CENTS: Record<string, number> = {
  free: 0,
  plus: 300,
  entry: 1000,
  goat: 1000,
  pro: 2000,
  max: 4000,
};

function getDaysUntil(isoString: string | null | undefined): number | null {
  if (!isoString) return null;
  const target = new Date(isoString).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - Date.now();
  if (diffMs <= 0) return null;
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export default function SettingsBillingPage() {
  const { data: billing, isLoading: isBillingLoading } = useBillingMe();
  const { session } = useSession();
  const [isCheckingOut, setIsCheckingOut] = useState<number | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [showTopupPicker, setShowTopupPicker] = useState(false);

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

  const isPaidPlan = billing.plan !== "free";
  const priceCents = PLAN_MONTHLY_PRICE_CENTS[billing.plan] ?? 0;
  const grantCents = billing.creditGrantCents ?? 0;
  const topUpBalanceCents = billing.topUpBalanceCents ?? 0;
  const totalAvailableCents = Math.max(0, billing.creditBalanceCents);
  const monthlyRemainingCents = Math.max(
    0,
    totalAvailableCents - topUpBalanceCents,
  );
  const renewalDays = getDaysUntil(billing.expiresAt);
  const hasFutureRenewal = renewalDays !== null && Boolean(billing.expiresAt);
  const username = session?.user?.username ?? "entry-user";

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Billing
      </h1>

      {/* Current Plan Section */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-medium text-muted-foreground">
          Current Plan
        </h2>
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-foreground">
              {billing.planName} Plan
            </span>
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {formatUsdCents(priceCents)}/mo
            </span>
          </div>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            {isPaidPlan
              ? `Includes ${formatUsdCents(grantCents)} in credit every month. Remaining credit keeps its existing expiration date.`
              : `Includes ${formatUsdCents(grantCents || 100)} in trial credit. Upgrade for monthly credits and full model access.`}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link href="/pricing">
                View Plans
                <ExternalLink className="ml-1.5 size-3.5" strokeWidth={1.5} />
              </Link>
            </Button>

            {isPaidPlan ? (
              <Button
                type="button"
                size="sm"
                disabled={isOpeningPortal}
                onClick={() => void handleOpenPortal()}
                className="cursor-pointer rounded-lg"
              >
                {isOpeningPortal ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                {isOpeningPortal ? "Opening portal..." : "Manage Subscription"}
              </Button>
            ) : (
              <Button asChild size="sm" className="rounded-lg">
                <Link href="/pricing">Upgrade</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Credit Balance Section */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">
          Credit Balance
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {hasFutureRenewal ? (
            <>
              Your monthly credit renews in{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {renewalDays} {renewalDays === 1 ? "day" : "days"}
              </span>
              .{" "}
            </>
          ) : null}
          {isPaidPlan
            ? `Includes ${formatUsdCents(grantCents)} in credit every month. Remaining credit keeps its existing expiration date.`
            : `Includes ${formatUsdCents(grantCents || 100)} in trial credit.`}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {isPaidPlan ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowTopupPicker((prev) => !prev)}
              className="cursor-pointer rounded-lg"
            >
              <Plus className="mr-1.5 size-3.5" strokeWidth={1.5} />
              Add Credit
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="rounded-lg">
              <Link href="/pricing">Upgrade</Link>
            </Button>
          )}
        </div>

        {showTopupPicker ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
            <span className="mr-1 text-xs font-medium text-muted-foreground">
              Select top-up amount
            </span>
            {[500, 1000, 2500, 5000].map((amount) => (
              <Button
                key={amount}
                type="button"
                size="sm"
                variant="outline"
                disabled={isCheckingOut !== null}
                onClick={() => void handleTopup(amount)}
                className="h-7 cursor-pointer rounded-md bg-background px-2.5 font-mono text-xs font-medium tabular-nums"
              >
                {isCheckingOut === amount ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  `+$${amount / 100}`
                )}
              </Button>
            ))}
          </div>
        ) : null}

        {/* Entry Obsidian Credit Card */}
        <div className="mt-6">
          <div className="relative flex aspect-[1.62/1] w-full max-w-[300px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 p-5 text-white shadow-sm">
            {/* Subtle diagonal card sheen */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.02)_42%,transparent_43%,transparent_100%)]"
            />

            <div className="relative flex items-start justify-between gap-3">
              <span className="font-mono text-[11px] tracking-wide text-white/65">
                entry {billing.planName.toLowerCase()}
              </span>
              {/* Metallic Entry Cloud chip emblem */}
              <span className="flex h-7 w-9 items-center justify-center rounded-md border border-white/25 bg-white/12 shadow-inner">
                <EntryMark className="size-4 text-white" />
              </span>
            </div>

            <div className="relative">
              <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums text-white sm:text-[28px]">
                {formatUsdCents(totalAvailableCents)}
              </p>
              <p className="mt-1.5 truncate text-xs text-white/75">
                {username}
              </p>
            </div>
          </div>
        </div>

        {/* Credit Breakdown Rows */}
        <div className="mt-6 space-y-1 text-sm">
          <div className="flex items-center justify-between rounded-lg px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              Monthly credit
              <Info
                className="size-3.5 text-muted-foreground/70"
                strokeWidth={1.5}
              />
            </span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {formatUsdCents(monthlyRemainingCents)} /{" "}
              {formatUsdCents(grantCents)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              Purchased credit
              <Info
                className="size-3.5 text-muted-foreground/70"
                strokeWidth={1.5}
              />
            </span>
            <span className="font-mono text-sm tabular-nums text-foreground">
              {formatUsdCents(topUpBalanceCents)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/70 px-3 py-2.5 font-medium">
            <span className="text-foreground">Total Available Credit</span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatUsdCents(totalAvailableCents)}
            </span>
          </div>
        </div>
      </section>

      {/* Credit Expiration Schedule Section */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-foreground">
          Credit Expiration Schedule
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th className="pb-2.5 font-medium">Type</th>
                <th className="pb-2.5 font-medium">Credit Balance</th>
                <th className="pb-2.5 text-right font-medium">Expiration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <tr>
                <td className="py-3 font-medium text-foreground">Included</td>
                <td className="py-3 font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
                  {formatUsdCents(monthlyRemainingCents)} /{" "}
                  {formatUsdCents(grantCents)}
                </td>
                <td className="py-3 text-right font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
                  {hasFutureRenewal && billing.expiresAt
                    ? formatExpirationDate(billing.expiresAt)
                    : "No expiration"}
                </td>
              </tr>
              {topUpBalanceCents > 0 ? (
                <tr>
                  <td className="py-3 font-medium text-foreground">
                    Purchased
                  </td>
                  <td className="py-3 font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
                    {formatUsdCents(topUpBalanceCents)}
                  </td>
                  <td className="py-3 text-right font-mono text-xs tabular-nums text-muted-foreground sm:text-sm">
                    {billing.topUpExpiresAt
                      ? formatExpirationDate(billing.topUpExpiresAt)
                      : "90 days"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
