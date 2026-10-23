"use client";

import { useEffect, useState } from "react";
import { formatUsdCents } from "@/lib/format-usd";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/footer";

interface PlanRow {
  id: string;
  name: string;
  priceUsdCents: number;
  creditGrantCents: number;
  modelAccess: "luna-only" | "all";
}

interface WindowUsage {
  usedCents: number;
  limitCents: number;
  resetsAt?: string | null;
}

interface BillingMeResponse {
  plan: string;
  planName: string;
  creditBalanceCents: number;
  creditGrantCents: number;
  /** Live window usage; non-null ONLY for plans with windows (the Entry/Goat plan). */
  usageWindows: {
    mode?: "rolling" | "fixed";
    fiveHour: WindowUsage;
    weekly: WindowUsage;
    monthly: WindowUsage;
  } | null;
}

const PLAN_BLURB: Record<string, string> = {
  free: "Try Entry with included starter models. $1 trial credit, no card required.",
  plus: "Full model access. $10 of credit every month.",
  goat: "The flagship Entry plan. $13/mo grants $50 of usage credit (3.8x). Choose between continuous Sliding Windows or Fixed Window Refill cycles for your $10 / 5-hour, $25 / 7-day, and $50 / 30-day limits.",
  pro: "$100 of credit every month for heavy builders.",
  max: "$180 of credit. Our biggest monthly pool.",
};

/**
 * Live status card for the Entry plan's rolling usage windows, rendered
 * on the billing page under the current-plan banner. Exclusive to the
 * Entry plan -- /api/billing/me returns usageWindows only for it, so
 * every other plan (Free/Plus/Pro/Max) never sees this card. Each bar
 * shows spend against its window limit; windows refill continuously as
 * the oldest usage slides out, so there is no fixed reset timestamp to
 * display.
 */

/**
 * The public plan catalog (was /billing/plans, now mounted at /pricing
 * -- owner 2026-09-15). Fully public: viewing plans needs no login; only
 * checkout (Bachs hosted checkout) does.
 */
export function PlansCatalog() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Current subscription state, if the visitor is logged in and already
  // on a plan -- undefined while still loading, null once we know
  // they're logged out / /api/billing/me 401'd. Added 2026-08-17: this
  // page previously never checked this at all, so an already-subscribed
  // user clicking the sidebar balance pill landed on the exact same
  // "pick a plan" marketing page a first-time visitor sees, with no
  // acknowledgement they were already paying for something.
  const [me, setMe] = useState<BillingMeResponse | null | undefined>(undefined);
  const [goatModalOpen, setGoatModalOpen] = useState(false);
  const [selectedGoatMode, setSelectedGoatMode] = useState<"rolling" | "fixed">(
    "rolling",
  );

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.plans);
      })
      .catch(() => setErrorMessage("Couldn't load plans, try refreshing."));

    fetch("/api/billing/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data))
      .catch(() => setMe(null));
  }, []);

  async function handleSubscribe(
    planId: string,
    windowMode?: "rolling" | "fixed",
  ) {
    if (planId === "free") {
      return;
    }
    if (planId === "goat" && !windowMode) {
      setGoatModalOpen(true);
      return;
    }
    setGoatModalOpen(false);
    setErrorMessage(null);
    setPendingPlan(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          ...(windowMode ? { windowMode } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Checkout failed");
      }
      // In-place plan change (already a subscriber): no hosted checkout
      // to visit, the plan is already switched. Just reload so the page
      // reflects the new plan and balance.
      if (data.updated) {
        window.location.reload();
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Checkout failed");
      setPendingPlan(null);
    }
  }

  return (
    <div className="landing relative isolate min-h-screen bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
      <div className="relative z-10">
        <LandingNav showSignIn />

        <section className="pt-32 pb-16 md:pt-44 md:pb-24">
          <div className="mx-auto max-w-[1320px] px-6">
            <div className="max-w-[740px]">
              <h1 className="text-4xl font-semibold leading-[1.03] tracking-tighter sm:text-5xl md:text-6xl">
                Pricing.
              </h1>
              <p className="mt-4 text-balance text-base leading-relaxed text-(--l-fg-2) sm:mt-6 sm:text-xl">
                Credit-based pricing -- $1 in credit is $1 of usage, no markup.
                Subscriptions include a bonus credit top-up every month.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-(--l-border) px-4 py-2 text-sm text-(--l-fg-2)">
                🇳🇬 Nigerian debit &amp; credit cards, bank transfer and mobile
                money accepted -- you pay in your local currency, we price in
                dollars.
              </div>
              <div className="mt-3 text-sm text-(--l-fg-2)">
                {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
                {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
                <a
                  href="/model"
                  className="underline decoration-(--l-fg-3) underline-offset-4 transition-colors hover:text-(--l-fg)"
                >
                  See the price of every model &rarr;
                </a>
              </div>
            </div>

            {errorMessage && (
              <p className="mt-6 text-sm text-red-500">{errorMessage}</p>
            )}

            {me && (
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-(--l-border) bg-(--l-fg)/[0.04] px-5 py-4">
                <p className="text-sm text-(--l-fg-2)">
                  Current subscription:{" "}
                  <span className="font-semibold text-(--l-fg)">
                    {me.planName}
                  </span>{" "}
                  plan.
                </p>
                <a
                  href="/usage"
                  className="inline-flex items-center text-sm font-medium text-(--l-fg) underline decoration-(--l-fg-3) underline-offset-4 transition-colors hover:decoration-(--l-fg)"
                >
                  View balance &amp; usage windows &rarr;
                </a>
              </div>
            )}

            <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-4">
              {(plans ?? []).map((plan) => {
                const isCurrentPlan = me?.plan === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`flex flex-col justify-between rounded-2xl border p-6 ${
                      isCurrentPlan
                        ? "border-(--l-fg) ring-1 ring-(--l-fg)/20"
                        : "border-(--l-border)"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-semibold">{plan.name}</div>
                        {isCurrentPlan && (
                          <span className="rounded-full bg-(--l-fg) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--l-bg)">
                            Current plan
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-3xl font-semibold tracking-tight">
                        {formatUsdCents(plan.priceUsdCents)}
                        <span className="text-sm font-normal text-(--l-fg-3)">
                          /mo
                        </span>
                      </div>
                      {plan.priceUsdCents > 0 && (
                        <div className="mt-1 text-sm text-(--l-fg-3)">
                          Billed in USD; charged in your local currency at
                          checkout.
                        </div>
                      )}
                      <p className="mt-3 text-sm text-(--l-fg-2)">
                        {PLAN_BLURB[plan.id]}
                      </p>
                      <p className="mt-3 text-sm text-(--l-fg-2)">
                        {plan.creditGrantCents > 0
                          ? `${formatUsdCents(plan.creditGrantCents)} credit ${
                              plan.priceUsdCents === 0
                                ? "one-time"
                                : "every renewal"
                            }`
                          : "No credit included"}
                      </p>
                      <p className="mt-1 text-sm text-(--l-fg-2)">
                        {plan.modelAccess === "all"
                          ? "Every model, full access"
                          : "Included starter models"}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        plan.id === "free" ||
                        pendingPlan === plan.id ||
                        isCurrentPlan
                      }
                      onClick={() => handleSubscribe(plan.id)}
                      className={`mt-6 rounded-full px-6 py-2.5 text-sm font-medium disabled:opacity-50 ${
                        isCurrentPlan
                          ? "border border-(--l-border) bg-transparent text-(--l-fg)"
                          : "bg-(--l-fg) text-(--l-bg)"
                      }`}
                    >
                      {isCurrentPlan
                        ? "Your plan"
                        : plan.id === "free"
                          ? "Default"
                          : pendingPlan === plan.id
                            ? "Redirecting..."
                            : me
                              ? "Switch"
                              : "Subscribe"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {goatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-(--l-border) bg-(--l-bg) p-6 text-(--l-fg) shadow-2xl">
            <h2 className="text-lg font-semibold">
              Choose your Entry (GOAT) Window Method
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-(--l-fg-2)">
              Select how your 5-hour ($10), 7-day ($25), and 30-day ($50) usage
              windows replenish during your subscription:
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => setSelectedGoatMode("rolling")}
                className={`w-full rounded-xl border p-3.5 text-left transition ${
                  selectedGoatMode === "rolling"
                    ? "border-(--l-fg) bg-(--l-fg)/[0.06]"
                    : "border-(--l-border) hover:border-(--l-fg-3)"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    1. Sliding Window (Continuous)
                  </span>
                  <span className="rounded-full border border-(--l-border) px-2 py-0.5 text-[10px] uppercase">
                    Default
                  </span>
                </div>
                <p className="mt-1 text-xs text-(--l-fg-2)">
                  Capacity returns continuously as older usage ages past 5 hours
                  / 7 days / 30 days. You never wait for a fixed reset day.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedGoatMode("fixed")}
                className={`w-full rounded-xl border p-3.5 text-left transition ${
                  selectedGoatMode === "fixed"
                    ? "border-(--l-fg) bg-(--l-fg)/[0.06]"
                    : "border-(--l-border) hover:border-(--l-fg-3)"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    2. Fixed Window Refill (Full Reset)
                  </span>
                </div>
                <p className="mt-1 text-xs text-(--l-fg-2)">
                  Waits until the end of each fixed 5-hour / 7-day / 30-day
                  cycle boundary and refills 100% of the window capacity all at
                  once.
                </p>
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
              <strong>Permanent for this billing cycle:</strong> Once you
              subscribe, this window method is locked and can only be changed
              when you renew your subscription again.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setGoatModalOpen(false)}
                className="rounded-full border border-(--l-border) px-4 py-2 text-xs font-medium text-(--l-fg-2) hover:text-(--l-fg)"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubscribe("goat", selectedGoatMode)}
                className="rounded-full bg-(--l-fg) px-5 py-2 text-xs font-semibold text-(--l-bg)"
              >
                Confirm &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      <LandingFooter />
    </div>
  );
}
