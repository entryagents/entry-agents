/**
 * The four paid subscription plans + Free tier Entry offers, backed by Bachs
 * for checkout/renewal (see lib/billing/bachs.ts) and a per-user credit
 * ledger (see lib/billing/credit-ledger.ts) for enforcement.
 *
 * Design:
 * - Free: $0, one-time $1 trial credit, restricted exclusively to models
 *   unlocked by the Admin in Platform Settings (getFreeTierModelId). When
 *   the trial credit hits zero, the user is hard-blocked (composer blurred,
 *   "Free tier ended, upgrade your account to use Entry") -- see
 *   resolveChatModelRuntime in app/workflows/chat.ts.
 * - GOAT (publicly named "Entry"; internal id "goat"): a $13/mo tier that
 *   grants $50 of credit per renewal with 5h / weekly / monthly usage
 *   windows in either sliding ("rolling") or fixed boundary ("fixed") mode,
 *   locked for the 1-month billing cycle.
 * - Plus/GOAT("Entry")/Pro/Max: paid, full access to every model in the live
 *   catalog. Each subscription cycle lasts 1 calendar month from the Bachs
 *   charge anchor (matching Bachs billing_cycle: { interval: "month", frequency: 1 }).
 */

export type PlanId = "free" | "plus" | "goat" | "pro" | "max";

/**
 * Usage windows -- exclusive to the "Entry" plan, id "goat".
 * A plan with usageWindows can spend at most fiveHourLimitCents in a 5-hour
 * window, weeklyLimitCents in a 7-day window, and monthlyLimitCents in a
 * 1-month cycle -- enforced at the pre-turn billing gate in
 * resolveChatModelRuntime by summing usage_debit rows from credit_transactions.
 */
export interface PlanUsageWindows {
  /** Max spend in a 5-hour window, USD cents. */
  fiveHourLimitCents: number;
  /** Max spend in a 7-day window, USD cents. */
  weeklyLimitCents: number;
  /** Max spend in a 1-month window, USD cents. */
  monthlyLimitCents: number;
}

export type ExceededUsageWindow = "fiveHour" | "weekly" | "monthly" | null;

/**
 * GOAT ("Entry") window mode:
 * - "rolling": sliding trailing 5h / 7d / 1-month windows
 * - "fixed": fixed 5h / 7d / 1-month boundaries anchored to billingCycleAnchor
 */
export type GoatWindowMode = "rolling" | "fixed";

export function normalizeGoatWindowMode(
  value: string | null | undefined,
): GoatWindowMode {
  return value === "fixed" ? "fixed" : "rolling";
}

/**
 * Adds exactly 1 calendar month in UTC to the given anchor date, matching
 * Bachs' `billing_cycle: { interval: "month", frequency: 1 }` calculation.
 * End-of-month dates clamp to the last day of the target month (e.g.,
 * Jan 31 -> Feb 28/29) while preserving the exact UTC time-of-day.
 */
export function addOneCalendarMonth(anchor: Date | string | number): Date {
  const start = new Date(anchor);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const day = start.getUTCDate();
  const hours = start.getUTCHours();
  const minutes = start.getUTCMinutes();
  const seconds = start.getUTCSeconds();
  const ms = start.getUTCMilliseconds();

  const targetMonth = month + 1;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(
    Date.UTC(year, targetMonth, clampedDay, hours, minutes, seconds, ms),
  );
}

/**
 * Subtracts 1 calendar month in UTC from the given date (used for trailing
 * 1-month window calculations when no billing cycle anchor is present).
 */
export function subtractOneCalendarMonth(from: Date | string | number): Date {
  const ref = new Date(from);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const day = ref.getUTCDate();
  const hours = ref.getUTCHours();
  const minutes = ref.getUTCMinutes();
  const seconds = ref.getUTCSeconds();
  const ms = ref.getUTCMilliseconds();

  const targetMonth = month - 1;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(year, targetMonth + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(
    Date.UTC(year, targetMonth, clampedDay, hours, minutes, seconds, ms),
  );
}

export interface FixedWindowBoundaries {
  cycleStart5hMs: number;
  cycleStart7dMs: number;
  cycleStart30dMs: number;
  resetsAt5h: string;
  resetsAt7d: string;
  resetsAt30d: string;
}

export function computeFixedWindowBoundaries(
  anchorMs: number,
  nowMs: number = Date.now(),
): FixedWindowBoundaries {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const cycleStart5hMs =
    anchorMs +
    Math.max(0, Math.floor((nowMs - anchorMs) / FIVE_HOURS_MS)) * FIVE_HOURS_MS;
  const cycleStart7dMs =
    anchorMs +
    Math.max(0, Math.floor((nowMs - anchorMs) / SEVEN_DAYS_MS)) * SEVEN_DAYS_MS;
  // The monthly cycle is fixed to the billing cycle anchor and expires/resets
  // exactly 1 calendar month after the anchor (matching Bachs monthly billing).
  const cycleStart30dMs = anchorMs;
  const nextMonthDate = addOneCalendarMonth(anchorMs);

  return {
    cycleStart5hMs,
    cycleStart7dMs,
    cycleStart30dMs,
    resetsAt5h: new Date(cycleStart5hMs + FIVE_HOURS_MS).toISOString(),
    resetsAt7d: new Date(cycleStart7dMs + SEVEN_DAYS_MS).toISOString(),
    resetsAt30d: nextMonthDate.toISOString(),
  };
}

export interface RollingWindowBoundaries {
  cutoff5hMs: number;
  cutoff7dMs: number;
  cutoff30dMs: number;
  resetsAt30d: string;
}

/**
 * Computes cutoffs for rolling/sliding windows.
 * A new subscription is a whole new cycle, so rolling windows cannot look back
 * before the active subscription cycle anchor (Math.max). This guarantees that
 * on renewal (anchorMs = now), all usage windows immediately reset to 100% capacity.
 */
export function computeRollingWindowBoundaries(
  anchorMs: number,
  nowMs: number = Date.now(),
): RollingWindowBoundaries {
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const cutoff5hMs = Math.max(nowMs - FIVE_HOURS_MS, anchorMs);
  const cutoff7dMs = Math.max(nowMs - SEVEN_DAYS_MS, anchorMs);
  const cutoff30dMs = anchorMs;

  return {
    cutoff5hMs,
    cutoff7dMs,
    cutoff30dMs,
    resetsAt30d: addOneCalendarMonth(anchorMs).toISOString(),
  };
}

/**
 * Calculates the exact reset/refill timestamp for a sliding window.
 * - If total spend >= limit (blocked): returns the exact timestamp when
 *   aging-out older transactions drops spend below the limit.
 * - If total spend > 0 and < limit: returns the timestamp when the oldest
 *   transaction in the window slides out and starts refilling.
 * - If total spend === 0: returns null (window is already 100% available).
 */
export function computeRollingResetTimestamp(
  txsAsc: { createdAt: Date | number; amountCents: number }[],
  totalSpendCents: number,
  limitCents: number,
  windowMs: number,
): string | null {
  if (totalSpendCents <= 0 || txsAsc.length === 0) {
    return null;
  }

  if (totalSpendCents >= limitCents) {
    let remaining = totalSpendCents;
    for (const tx of txsAsc) {
      const debitCost = Math.abs(tx.amountCents);
      remaining -= debitCost;
      if (remaining < limitCents) {
        const txTime =
          typeof tx.createdAt === "number"
            ? tx.createdAt
            : new Date(tx.createdAt).getTime();
        return new Date(txTime + windowMs).toISOString();
      }
    }
    const firstTxTime =
      typeof txsAsc[0].createdAt === "number"
        ? txsAsc[0].createdAt
        : new Date(txsAsc[0].createdAt).getTime();
    return new Date(firstTxTime + windowMs).toISOString();
  }

  const oldestTime =
    typeof txsAsc[0].createdAt === "number"
      ? txsAsc[0].createdAt
      : new Date(txsAsc[0].createdAt).getTime();
  return new Date(oldestTime + windowMs).toISOString();
}

export interface UsageWindowTotals {
  /** Total usage_debit spend in the current 5-hour window, USD cents. */
  last5HoursCents: number;
  /** Total usage_debit spend in the current 7-day window, USD cents. */
  last7DaysCents: number;
  /** Total usage_debit spend in the current 1-month window, USD cents. */
  last30DaysCents: number;
  /** Whether the user selected sliding ("rolling") or fixed boundary ("fixed") refill mode. */
  mode?: GoatWindowMode;
  resetsAt5h?: string | null;
  resetsAt7d?: string | null;
  resetsAt30d?: string | null;
}

/**
 * Grant-pool math (owner 2026-09-15: "when monthly subscription
 * expires, user credit expires along with it"). The pool tracks
 * unspent subscription-grant credit; usage consumes it FIRST, and when
 * a plan ends whatever remains of it is removed from the balance.
 * Paid top-up credit is never touched. Pure math, bun-testable.
 */
export function consumedFromGrantPool(
  costCents: number,
  grantPoolCents: number,
): number {
  if (costCents <= 0 || grantPoolCents <= 0) {
    return 0;
  }
  return Math.min(costCents, grantPoolCents);
}

/** How much credit to remove from the balance when a plan ends. */
export function expiredGrantCentsOnPlanEnd(
  balanceCents: number,
  grantPoolCents: number,
): number {
  if (grantPoolCents <= 0 || balanceCents <= 0) {
    return 0;
  }
  // Defensive min(): balance can briefly go negative (usage debits
  // don't block), so never remove more than actually exists.
  return Math.min(balanceCents, grantPoolCents);
}

/**
 * Should this paid plan auto-revert to Free? Pure policy (bun-testable).
 * Every paid plan expires exactly 1 calendar month after `billingCycleAnchor`
 * (matching Bachs' `billing_cycle: { interval: "month", frequency: 1 }`).
 * - Free (or no plan) never reverts -- nothing to revert.
 * - A NULL anchor means we never saw a renewal charge for this plan -- do NOT
 *   act on data we can't interpret.
 * - Strictly older than the 1-calendar-month expiry (`nowMs > expiresAtMs`)
 *   reverts; at or before `expiresAtMs` does not.
 */
export function shouldAutoRevertToFree(
  planId: string | null | undefined,
  billingCycleAnchor: Date | string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!planId || planId === "free") {
    return false;
  }
  if (!billingCycleAnchor) {
    return false;
  }
  const anchorDate = new Date(billingCycleAnchor);
  if (Number.isNaN(anchorDate.getTime())) {
    return false;
  }
  const expiresAtMs = addOneCalendarMonth(anchorDate).getTime();
  return nowMs > expiresAtMs;
}

/**
 * Pure policy for the subscription.disable / subscription.cancelled webhook:
 * should this user be downgraded to Free?
 */
export function shouldDowngradeOnSubscriptionDisable(
  currentPlan: string | null | undefined,
  currentSubscriptionCode: string | null | undefined,
  disabledSubscriptionCode: string,
): boolean {
  if (!currentPlan || currentPlan === "free") {
    return false;
  }
  return currentSubscriptionCode === disabledSubscriptionCode;
}

export function findExceededUsageWindow(
  totals: UsageWindowTotals,
  windows: PlanUsageWindows,
): ExceededUsageWindow {
  if (totals.last5HoursCents >= windows.fiveHourLimitCents) {
    return "fiveHour";
  }
  if (totals.last7DaysCents >= windows.weeklyLimitCents) {
    return "weekly";
  }
  if (totals.last30DaysCents >= windows.monthlyLimitCents) {
    return "monthly";
  }
  return null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Monthly subscription price, in USD cents. 0 for the free plan. */
  priceUsdCents: number;
  /** Credit granted on signup (free) or each successful renewal (paid), in USD cents. */
  creditGrantCents: number;
  /** "luna-only" restricts to admin-configured free tier models; "all" is unrestricted. */
  modelAccess: "luna-only" | "all";
  /**
   * Optional usage windows (see PlanUsageWindows). Exclusive to the Entry
   * plan (id "goat").
   */
  usageWindows?: PlanUsageWindows;
  /**
   * Bachs product id (prod_...), created once from this catalog and then
   * pinned here.
   */
  bachsProductId: string | null;
}

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsdCents: 0,
    creditGrantCents: 100, // $1 one-time trial
    modelAccess: "luna-only",
    bachsProductId: null,
  },
  plus: {
    id: "plus",
    name: "Plus",
    priceUsdCents: 500, // $5/mo
    creditGrantCents: 1000, // $10 credit (2x)
    modelAccess: "all",
    bachsProductId: "prod_cf3431b0d90141368721",
  },
  goat: {
    id: "goat",
    name: "Entry",
    priceUsdCents: 1300, // $13/mo
    creditGrantCents: 5000, // $50 credit
    modelAccess: "all",
    usageWindows: {
      fiveHourLimitCents: 1000, // $10 per 5 hours
      weeklyLimitCents: 2500, // $25 per 7 days
      monthlyLimitCents: 5000, // $50 per 1-month cycle
    },
    bachsProductId: "prod_bf5c08cc52e447ecacdc",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdCents: 2000, // $20/mo
    creditGrantCents: 10000, // $100 credit (5x)
    modelAccess: "all",
    bachsProductId: "prod_7db0c6044eb54e9497e3",
  },
  max: {
    id: "max",
    name: "Max",
    priceUsdCents: 4000, // $40/mo
    creditGrantCents: 18000, // $180 credit (4.5x)
    modelAccess: "all",
    bachsProductId: "prod_7436be95761d4ab5a071",
  },
};

export const PLAN_IDS = Object.keys(PLAN_CATALOG) as PlanId[];

/**
 * Rates used to lock exact local-currency prices for ONE-TIME top-ups.
 */
export const LOCAL_CURRENCY_RATES: Record<string, number> = {
  NGN: 1328.77796,
  GHS: 11.632012,
  KES: 129.660848,
};

/** Exact local prices for a USD amount, ready for a checkout's currency_options. */
export function localCurrencyOptionsFor(
  usdCents: number,
): Record<string, string> {
  const usd = usdCents / 100;
  return Object.fromEntries(
    Object.entries(LOCAL_CURRENCY_RATES).map(([currency, rate]) => [
      currency,
      (Math.round(usd * rate * 100) / 100).toFixed(2),
    ]),
  );
}

let cachedProductIds: Record<string, string> | null | undefined;

function environmentProductIds(): Record<string, string> | null {
  if (cachedProductIds !== undefined) {
    return cachedProductIds;
  }

  const raw = process.env.BACHS_PRODUCT_IDS;
  if (!raw) {
    cachedProductIds = null;
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    cachedProductIds =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : null;
  } catch {
    cachedProductIds = null;
  }

  return cachedProductIds;
}

/** The product id to sell for a plan in the current environment. */
export function resolveProductIdForPlan(plan: PlanDefinition): string | null {
  return environmentProductIds()?.[plan.id] ?? plan.bachsProductId;
}

/** Reverse lookup, for resolving a webhook's product_id back to a plan. */
export function resolvePlanForProductId(
  productId: string | null | undefined,
): PlanId | null {
  if (!productId) {
    return null;
  }

  const fromEnvironment = Object.entries(environmentProductIds() ?? {}).find(
    ([, id]) => id === productId,
  );
  if (fromEnvironment && isPlanId(fromEnvironment[0])) {
    return fromEnvironment[0];
  }

  return (
    Object.values(PLAN_CATALOG).find(
      (plan) => plan.bachsProductId === productId,
    )?.id ?? null
  );
}

export function getPlanDefinition(
  planId: string | null | undefined,
): PlanDefinition {
  if (planId && planId in PLAN_CATALOG) {
    return PLAN_CATALOG[planId as PlanId];
  }
  return PLAN_CATALOG.free;
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return !!value && value in PLAN_CATALOG;
}
