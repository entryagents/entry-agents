"use client";

import { CreditCard } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { formatUsdCents } from "@/lib/format-usd";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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
  free: "Grants $1 of real execution credit on included starter models — no card required.",
  plus: "Try our $5 plan and get $10 of AI credit (2x value) with full model access and up to 99% prompt caching.",
  goat: "The flagship Entry (Goat) plan. $13/mo grants $50 of usage credit (3.8x) with your choice of continuous Sliding or Fixed $10 / 5h, $25 / 7d, and $50 / 30d windows.",
  pro: "$100 of AI credit every month for sustained multi-repo builds with up to 99% prompt caching.",
  max: "$180 of AI credit every month — our largest pool for high-volume /team wave runs.",
};

export function PlansCatalog({
  initialPlans,
}: {
  readonly initialPlans?: PlanRow[];
}) {
  const [plans, setPlans] = useState<PlanRow[] | null>(initialPlans ?? null);
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <div className="relative z-10">
          <LandingNav showSignIn />

          <section className="pt-24 pb-16 sm:pt-28 md:pt-32 md:pb-24">
            <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
              <div className="max-w-[740px]">
                <h1 className="text-3xl font-semibold leading-[1.06] tracking-tight sm:text-5xl md:text-6xl">
                  Pricing
                </h1>
                <p className="mt-4 text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-lg">
                  Start free with $1 of real execution credit — or try our $5
                  Plus plan and get $10 of AI credit. Every tier passes through
                  zero per-token markup with up to 99% prompt caching across
                  main chat and subagents.
                </p>
                <div className="mt-4 inline-flex items-start gap-2.5 rounded-xl border border-(--l-border) bg-(--l-surface) px-3.5 py-2.5 text-xs leading-relaxed text-(--l-fg-2) sm:items-center sm:text-sm">
                  <CreditCard
                    className="mt-0.5 size-4 shrink-0 text-(--l-fg-3) sm:mt-0"
                    strokeWidth={1.5}
                  />
                  <span>
                    Nigerian debit &amp; credit cards, bank transfer and mobile
                    money accepted — you pay in your local currency, we price in
                    dollars.
                  </span>
                </div>
                <div className="mt-3 text-sm text-(--l-fg-2)">
                  {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
                  <a
                    href="/model"
                    className="underline decoration-(--l-fg-3) underline-offset-4 transition-colors duration-150 hover:text-(--l-fg)"
                  >
                    See the price of every model &rarr;
                  </a>
                </div>
              </div>

              {errorMessage && (
                <p className="mt-6 text-sm text-red-500">{errorMessage}</p>
              )}

              {me && (
                <div className="mt-6 flex flex-col justify-between gap-3 rounded-xl border border-(--l-border) bg-(--l-surface) px-5 py-4 sm:flex-row sm:items-center">
                  <p className="text-sm text-(--l-fg-2)">
                    Current subscription:{" "}
                    <span className="font-semibold text-(--l-fg)">
                      {me.planName}
                    </span>{" "}
                    plan.
                  </p>
                  <Link
                    href="/settings/usage"
                    className="inline-flex items-center text-sm font-medium text-(--l-fg) underline decoration-(--l-fg-3) underline-offset-4 transition-colors duration-150 hover:decoration-(--l-fg)"
                  >
                    View balance &amp; usage windows &rarr;
                  </Link>
                </div>
              )}

              <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {(plans ?? []).map((plan, index) => {
                  const isCurrentPlan = me?.plan === plan.id;
                  const isFlagship = plan.id === "goat";
                  const isPlusValue = plan.id === "plus";
                  return (
                    <motion.div
                      key={plan.id}
                      initial={false}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      transition={{
                        duration: 0.24,
                        delay: index * 0.03,
                        ease: EASE_OUT,
                      }}
                      className={`flex min-w-0 flex-col justify-between rounded-2xl border bg-(--l-surface) p-5 ${
                        isCurrentPlan || isFlagship
                          ? "border-(--l-fg) ring-1 ring-(--l-fg)/20"
                          : "border-(--l-border)"
                      }`}
                    >
                      <div>
                        <div className="flex min-h-[28px] items-center justify-between gap-2">
                          <div className="truncate text-base font-semibold tracking-tight sm:text-lg">
                            {plan.id === "goat" ? "Entry (Goat)" : plan.name}
                          </div>
                          {isCurrentPlan ? (
                            <span className="shrink-0 whitespace-nowrap rounded-md bg-(--l-fg) px-2 py-0.5 text-[11px] font-medium text-(--l-bg)">
                              Current
                            </span>
                          ) : isFlagship ? (
                            <span className="shrink-0 whitespace-nowrap rounded-md border border-(--l-border) bg-(--l-surface-2) px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-(--l-fg-2)">
                              3.8x
                            </span>
                          ) : (
                            isPlusValue && (
                              <span className="shrink-0 whitespace-nowrap rounded-md border border-amber-600/35 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-amber-800 dark:border-amber-400/35 dark:text-amber-300">
                                2x credit
                              </span>
                            )
                          )}
                        </div>
                        <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                          {formatUsdCents(plan.priceUsdCents)}
                          <span className="text-sm font-normal text-(--l-fg-3)">
                            /mo
                          </span>
                        </div>
                        <div className="mt-1 min-h-[32px] text-xs leading-snug text-(--l-fg-3)">
                          {plan.priceUsdCents > 0
                            ? "Billed in USD; charged in local currency at checkout"
                            : "Starter allowance with no card required"}
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-(--l-fg-2)">
                          {PLAN_BLURB[plan.id]}
                        </p>
                        <div className="mt-4 space-y-1 border-t border-(--l-border-subtle) pt-3 text-xs text-(--l-fg-2)">
                          <p className="tabular-nums">
                            {plan.creditGrantCents > 0
                              ? `${formatUsdCents(plan.creditGrantCents)} credit ${
                                  plan.priceUsdCents === 0
                                    ? "one-time"
                                    : "every renewal"
                                }`
                              : "No credit included"}
                          </p>
                          <p>
                            {plan.modelAccess === "all"
                              ? "Every model · up to 99% caching"
                              : "Included starter models · 99% caching"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={
                          plan.id === "free" ||
                          pendingPlan === plan.id ||
                          isCurrentPlan
                        }
                        onClick={() => handleSubscribe(plan.id)}
                        className={`mt-6 rounded-lg px-4 py-2.5 text-sm font-medium transition-[opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-50 ${
                          isCurrentPlan
                            ? "border border-(--l-border) bg-transparent text-(--l-fg)"
                            : "bg-(--l-btn-bg) text-(--l-btn-fg) hover:opacity-90"
                        }`}
                      >
                        {isCurrentPlan
                          ? "Your plan"
                          : plan.id === "free"
                            ? "Included ($1 credit)"
                            : pendingPlan === plan.id
                              ? "Redirecting..."
                              : me
                                ? "Switch"
                                : "Subscribe"}
                      </button>
                    </motion.div>
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
                Choose your Entry (Goat) window method
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-(--l-fg-2)">
                Select how your 5-hour ($10), 7-day ($25), and 30-day ($50)
                usage windows replenish during your subscription:
              </p>

              <div className="mt-4 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedGoatMode("rolling")}
                  className={`w-full rounded-xl border p-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] ${
                    selectedGoatMode === "rolling"
                      ? "border-(--l-fg) bg-(--l-fg)/[0.06]"
                      : "border-(--l-border) hover:border-(--l-fg-3)"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      1. Sliding Window (Continuous)
                    </span>
                    <span className="rounded-md border border-(--l-border) px-2 py-0.5 text-[11px] font-medium">
                      Default
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-(--l-fg-2)">
                    Capacity returns continuously as older usage ages past 5
                    hours / 7 days / 30 days. You never wait for a fixed reset
                    day.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedGoatMode("fixed")}
                  className={`w-full rounded-xl border p-3.5 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.99] ${
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
                    cycle boundary and refills 100% of the window capacity all
                    at once.
                  </p>
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <strong>Permanent for this billing cycle:</strong> Once you
                subscribe, this window method is locked and can only be changed
                when you renew your subscription again.
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGoatModalOpen(false)}
                  className="rounded-lg border border-(--l-border) px-4 py-2 text-xs font-medium text-(--l-fg-2) transition-[color,border-color,transform] duration-150 hover:border-(--l-fg-3) hover:text-(--l-fg) active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSubscribe("goat", selectedGoatMode)}
                  className="rounded-lg bg-(--l-btn-bg) px-5 py-2 text-xs font-semibold text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
                >
                  Confirm &amp; Continue
                </button>
              </div>
            </div>
          </div>
        )}

        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
