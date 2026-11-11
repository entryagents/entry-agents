import "server-only";

import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { billingUsageEvents, creditTransactions, users } from "@/lib/db/schema";
import {
  getPlanDefinition,
  type GoatWindowMode,
  type PlanId,
  type UsageWindowTotals,
} from "./plans";

export interface UserBillingState {
  plan: PlanId;
  creditBalanceCents: number;
  planGrantBalanceCents: number;
  billingCycleAnchor: Date | null;
  billingCustomerCode: string | null;
  billingSubscriptionCode: string | null;
}

export async function getUserBillingState(
  userId: string,
  opts?: { isAdmin?: boolean; skipAutoRevert?: boolean },
): Promise<UserBillingState | null> {
  const [row] = await db
    .select({
      plan: users.plan,
      creditBalanceCents: users.creditBalanceCents,
      planGrantBalanceCents: users.planGrantBalanceCents,
      billingCycleAnchor: users.billingCycleAnchor,
      billingCustomerCode: users.billingCustomerCode,
      billingSubscriptionCode: users.billingSubscriptionCode,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!row) {
    return null;
  }

  const effectiveIsAdmin = opts?.isAdmin ?? row.isAdmin ?? false;
  if (!opts?.skipAutoRevert && !effectiveIsAdmin) {
    const { shouldAutoRevertToFree } = await import("@/lib/billing/plans");
    if (shouldAutoRevertToFree(row.plan, row.billingCycleAnchor)) {
      const previousPlan = row.plan;
      await db
        .update(users)
        .set({
          plan: "free",
          billingSubscriptionCode: null,
          billingCycleAnchor: null,
        })
        .where(eq(users.id, userId));

      const pool = await expireGrantPoolOnPlanEnd(userId);
      console.info(
        "[billing] auto-revert to free: 1-month subscription cycle expired",
        { userId, previousPlan, expiredGrantCents: pool.expiredCents },
      );

      return {
        plan: "free",
        creditBalanceCents: pool.balanceAfterCents,
        planGrantBalanceCents: 0,
        billingCycleAnchor: null,
        billingCustomerCode: row.billingCustomerCode,
        billingSubscriptionCode: null,
      };
    }
  }

  return {
    plan: (row.plan as PlanId) ?? "free",
    creditBalanceCents: row.creditBalanceCents,
    planGrantBalanceCents: row.planGrantBalanceCents,
    billingCycleAnchor: row.billingCycleAnchor,
    billingCustomerCode: row.billingCustomerCode,
    billingSubscriptionCode: row.billingSubscriptionCode,
  };
}

/**
 * Removes unspent subscription-grant credit when a plan ends (owner
 * 2026-09-15: "user credit expires along with the subscription").
 * Uses expiredGrantCentsOnPlanEnd policy; writes a grant_expiry ledger
 * row for auditability; zeroes the pool. Paid top-up credit survives.
 */
export async function expireGrantPoolOnPlanEnd(
  userId: string,
): Promise<{ expiredCents: number; balanceAfterCents: number }> {
  const { expiredGrantCentsOnPlanEnd } = await import("@/lib/billing/plans");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        balance: users.creditBalanceCents,
        pool: users.planGrantBalanceCents,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!row) {
      return { expiredCents: 0, balanceAfterCents: 0 };
    }

    const expired = expiredGrantCentsOnPlanEnd(row.balance, row.pool);
    if (expired <= 0) {
      return { expiredCents: 0, balanceAfterCents: row.balance };
    }

    const [updated] = await tx
      .update(users)
      .set({
        creditBalanceCents: sql`${users.creditBalanceCents} - ${expired}`,
        planGrantBalanceCents: 0,
      })
      .where(eq(users.id, userId))
      .returning({ creditBalanceCents: users.creditBalanceCents });

    await tx.insert(creditTransactions).values({
      id: nanoid(),
      userId,
      type: "grant_expiry",
      amountCents: -expired,
      balanceAfterCents: updated.creditBalanceCents,
      description: "Subscription ended - unused plan credit expired",
    });

    return {
      expiredCents: expired,
      balanceAfterCents: updated.creditBalanceCents,
    };
  });
}

/**
 * OWN plan-expiry enforcement, independent of webhook delivery:
 * reads the billing state, and if the paid plan's last renewal
 * (`billingCycleAnchor`, refreshed by every successful subscription charge)
 * is older than 1 calendar month (`addOneCalendarMonth`), downgrades the
 * user to Free right here, clears stale subscription/anchor fields, expires
 * unused subscription-grant credit, and expires any top-ups older than 90 days.
 */
export async function enforcePlanExpiry(
  userId: string,
  opts: { isAdmin?: boolean } = {},
): Promise<UserBillingState | null> {
  // Always enforce 90-day top-up expiry before any billing decision
  await expireStaleTopUps(userId);
  return getUserBillingState(userId, { isAdmin: opts.isAdmin });
}

export type CreditTransactionType =
  | "signup_trial"
  | "subscription_grant"
  | "topup"
  | "usage_debit"
  | "refund"
  | "admin_adjustment"
  | "grant_expiry";

interface LedgerEntryOptions {
  description?: string;
  modelId?: string;
  billingReference?: string;
}

/**
 * Atomically adjusts a user's creditBalanceCents and writes a matching
 * ledger row. `amountCents` may be positive (grant/topup/refund) or
 * negative (usage_debit). Returns the resulting balance.
 */
async function applyLedgerEntry(
  userId: string,
  amountCents: number,
  type: CreditTransactionType,
  opts: LedgerEntryOptions = {},
): Promise<number> {
  return db.transaction(async (tx) => {
    // Usage debits consume the subscription-grant pool FIRST (see
    // planGrantBalanceCents on users): unspent grant credit is what
    // dies with the subscription, so it must be spent before top-up
    // money. Other entry types leave the pool alone (grants grow it,
    // expiry zeroes it, top-ups/refunds never touch it).
    const grantPoolConsumed =
      type === "usage_debit" && amountCents < 0
        ? sql`LEAST(${-amountCents}, ${users.planGrantBalanceCents})`
        : sql`0`;

    const [updated] = await tx
      .update(users)
      .set({
        creditBalanceCents: sql`${users.creditBalanceCents} + ${amountCents}`,
        planGrantBalanceCents: sql`${users.planGrantBalanceCents} - ${grantPoolConsumed}`,
      })
      .where(eq(users.id, userId))
      .returning({ creditBalanceCents: users.creditBalanceCents });

    if (!updated) {
      throw new Error(`applyLedgerEntry: user ${userId} not found`);
    }

    await tx.insert(creditTransactions).values({
      id: nanoid(),
      userId,
      type,
      amountCents,
      balanceAfterCents: updated.creditBalanceCents,
      description: opts.description ?? null,
      modelId: opts.modelId ?? null,
      billingReference: opts.billingReference ?? null,
    });

    return updated.creditBalanceCents;
  });
}

// Heartbeat is emitted every 30s during active turns; 2 minutes is 4 missed heartbeats.
const BILLING_TURN_LOCK_STALE_MS = 2 * 60 * 1000;

export interface UserGoatWindowModeState {
  mode: GoatWindowMode;
  lockedAnchorIso: string | null;
}

export async function getUserGoatWindowModeState(
  userId: string,
): Promise<UserGoatWindowModeState> {
  try {
    const { platformSettings } = await import("@/lib/db/schema");
    const [row] = await db
      .select({
        titleModelId: platformSettings.titleModelId,
        disabledReason: platformSettings.disabledReason,
      })
      .from(platformSettings)
      .where(eq(platformSettings.id, `goat_window_mode:${userId}`))
      .limit(1);

    return {
      mode: row?.titleModelId === "fixed" ? "fixed" : "rolling",
      lockedAnchorIso: row?.disabledReason ?? null,
    };
  } catch {
    return { mode: "rolling", lockedAnchorIso: null };
  }
}

export async function getUserGoatWindowMode(
  userId: string,
): Promise<GoatWindowMode> {
  const state = await getUserGoatWindowModeState(userId);
  return state.mode;
}

/**
 * Sets or locks the user's GOAT ("Entry") window mode ("rolling" vs "fixed").
 *
 * Permanent 1-month cycle lock policy:
 * Once a user is in an active 1-month GOAT subscription cycle (`plan === "goat"`
 * and `billingCycleAnchor` not yet expired) and their mode is locked to that
 * `billingCycleAnchor`, the mode CANNOT be changed mid-cycle! It can only be
 * updated when a new subscription cycle starts (a new `billingCycleAnchor` is
 * passed on renewal/purchase) or when the user is not in an active locked GOAT cycle.
 */
export async function setUserGoatWindowMode(
  userId: string,
  mode: GoatWindowMode,
  billingCycleAnchor?: Date | null,
): Promise<{ applied: boolean; mode: GoatWindowMode }> {
  const { platformSettings } = await import("@/lib/db/schema");
  const { shouldAutoRevertToFree } = await import("@/lib/billing/plans");

  const [billingState, currentModeState] = await Promise.all([
    getUserBillingState(userId),
    getUserGoatWindowModeState(userId),
  ]);

  const activeGoatCycle =
    billingState?.plan === "goat" &&
    billingState.billingCycleAnchor !== null &&
    !shouldAutoRevertToFree("goat", billingState.billingCycleAnchor);

  const activeAnchorIso = billingState?.billingCycleAnchor
    ? billingState.billingCycleAnchor.toISOString()
    : null;
  const incomingAnchorIso = billingCycleAnchor
    ? billingCycleAnchor.toISOString()
    : null;

  // If the user is already in an active GOAT cycle and their mode is already
  // locked to this cycle's anchor, reject any attempt to flip the mode mid-cycle
  // (unless a brand-new cycle anchor is being granted on renewal).
  if (
    activeGoatCycle &&
    currentModeState.lockedAnchorIso !== null &&
    currentModeState.lockedAnchorIso === activeAnchorIso &&
    incomingAnchorIso === null
  ) {
    return { applied: false, mode: currentModeState.mode };
  }

  const anchorIsoToLock = incomingAnchorIso ?? activeAnchorIso;

  await db
    .insert(platformSettings)
    .values({
      id: `goat_window_mode:${userId}`,
      titleModelId: mode,
      disabledReason: anchorIsoToLock,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: {
        titleModelId: mode,
        disabledReason: anchorIsoToLock,
        updatedAt: new Date(),
      },
    });

  return { applied: true, mode };
}

export async function getUsageWindowTotals(
  userId: string,
): Promise<UsageWindowTotals> {
  const now = Date.now();
  const mode = await getUserGoatWindowMode(userId);
  const {
    addOneCalendarMonth: _addOneCalendarMonth,
    computeFixedWindowBoundaries,
    computeRollingWindowBoundaries,
    computeRollingResetTimestamp,
    subtractOneCalendarMonth,
  } = await import("@/lib/billing/plans");

  const userRow = await db
    .select({
      billingCycleAnchor: users.billingCycleAnchor,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // Never fall back to users.createdAt (which would sum lifetime spend if
  // billingCycleAnchor is null). Bound fallback to 1 calendar month ago.
  const oneMonthAgoMs = subtractOneCalendarMonth(now).getTime();
  const rawAnchorMs =
    userRow[0]?.billingCycleAnchor?.getTime() ?? oneMonthAgoMs;
  const anchorMs = Math.max(rawAnchorMs, oneMonthAgoMs);

  let cutoff5hIso: string;
  let cutoff7dIso: string;
  let cutoff30d: Date;
  let resetsAt5h: string | null = null;
  let resetsAt7d: string | null = null;
  let resetsAt30d: string | null = null;
  let cutoff5hMs = 0;
  let cutoff7dMs = 0;

  if (mode === "fixed") {
    const boundaries = computeFixedWindowBoundaries(anchorMs, now);
    cutoff5hIso = new Date(boundaries.cycleStart5hMs).toISOString();
    cutoff7dIso = new Date(boundaries.cycleStart7dMs).toISOString();
    cutoff30d = new Date(boundaries.cycleStart30dMs);
    resetsAt5h = boundaries.resetsAt5h;
    resetsAt7d = boundaries.resetsAt7d;
    resetsAt30d = boundaries.resetsAt30d;
  } else {
    // Rolling / sliding 5h and 7d sub-windows; bounded by the 1-month subscription
    // cycle anchor so a new subscription cycle resets all allowances to 100%.
    const boundaries = computeRollingWindowBoundaries(anchorMs, now);
    cutoff5hMs = boundaries.cutoff5hMs;
    cutoff7dMs = boundaries.cutoff7dMs;
    cutoff5hIso = new Date(cutoff5hMs).toISOString();
    cutoff7dIso = new Date(cutoff7dMs).toISOString();
    cutoff30d = new Date(boundaries.cutoff30dMs);
    resetsAt30d = boundaries.resetsAt30d;
  }

  const [row] = await db
    .select({
      last5HoursCents: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff5hIso}::timestamptz then -${creditTransactions.amountCents} else 0 end), 0)::int`,
      last7DaysCents: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff7dIso}::timestamptz then -${creditTransactions.amountCents} else 0 end), 0)::int`,
      last30DaysCents: sql<number>`coalesce(sum(-${creditTransactions.amountCents}), 0)::int`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage_debit"),
        gte(creditTransactions.createdAt, cutoff30d),
      ),
    );

  const last5HoursCents = row?.last5HoursCents ?? 0;
  const last7DaysCents = row?.last7DaysCents ?? 0;
  const last30DaysCents = row?.last30DaysCents ?? 0;

  if (mode !== "fixed") {
    const { asc } = await import("drizzle-orm");

    if (last5HoursCents > 0) {
      const txs5h = await db
        .select({
          createdAt: creditTransactions.createdAt,
          amountCents: creditTransactions.amountCents,
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, userId),
            eq(creditTransactions.type, "usage_debit"),
            gte(creditTransactions.createdAt, new Date(cutoff5hMs)),
          ),
        )
        .orderBy(asc(creditTransactions.createdAt));

      resetsAt5h = computeRollingResetTimestamp(
        txs5h,
        last5HoursCents,
        1000,
        FIVE_HOURS_MS,
      );
    }

    if (last7DaysCents > 0) {
      const txs7d = await db
        .select({
          createdAt: creditTransactions.createdAt,
          amountCents: creditTransactions.amountCents,
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.userId, userId),
            eq(creditTransactions.type, "usage_debit"),
            gte(creditTransactions.createdAt, new Date(cutoff7dMs)),
          ),
        )
        .orderBy(asc(creditTransactions.createdAt));

      resetsAt7d = computeRollingResetTimestamp(
        txs7d,
        last7DaysCents,
        2500,
        SEVEN_DAYS_MS,
      );
    }
  }

  return {
    last5HoursCents,
    last7DaysCents,
    last30DaysCents,
    mode,
    resetsAt5h,
    resetsAt7d,
    resetsAt30d,
  };
}

export async function claimUserBillingTurn(
  userId: string,
  workflowRunId: string,
): Promise<boolean> {
  const now = new Date();
  const staleThreshold = new Date(Date.now() - BILLING_TURN_LOCK_STALE_MS);

  // 1. Fast path: claim if unheld, self-owned, or older than stale threshold
  const [updated] = await db
    .update(users)
    .set({
      activeBillingRunId: workflowRunId,
      activeBillingRunClaimedAt: now,
    })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.activeBillingRunId),
          eq(users.activeBillingRunId, workflowRunId),
          isNull(users.activeBillingRunClaimedAt),
          lt(users.activeBillingRunClaimedAt, staleThreshold),
        ),
      ),
    )
    .returning({ id: users.id });

  if (updated) {
    return true;
  }

  // 2. Slow path: check if the holding run is actually still alive.
  // If the run reached a terminal state (completed/failed/cancelled) or does not exist,
  // we immediately steal the lease rather than waiting for staleThreshold.
  try {
    const [userRow] = await db
      .select({
        activeBillingRunId: users.activeBillingRunId,
        activeBillingRunClaimedAt: users.activeBillingRunClaimedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow?.activeBillingRunId) {
      const [retryClaim] = await db
        .update(users)
        .set({
          activeBillingRunId: workflowRunId,
          activeBillingRunClaimedAt: now,
        })
        .where(and(eq(users.id, userId), isNull(users.activeBillingRunId)))
        .returning({ id: users.id });
      return Boolean(retryClaim);
    }

    if (userRow.activeBillingRunId === workflowRunId) {
      return true;
    }

    const { verifyRunState } = await import("@/lib/workflow-run-recovery");
    const outcome = await verifyRunState(userRow.activeBillingRunId);
    if (outcome === "gone") {
      const [stolen] = await db
        .update(users)
        .set({
          activeBillingRunId: workflowRunId,
          activeBillingRunClaimedAt: now,
        })
        .where(
          and(
            eq(users.id, userId),
            eq(users.activeBillingRunId, userRow.activeBillingRunId),
          ),
        )
        .returning({ id: users.id });
      if (stolen) {
        return true;
      }
    }
  } catch (err) {
    console.error("[billing] Failed to verify activeBillingRunId state:", err);
  }

  return false;
}

/**
 * Releases the billing-turn slot, but only if `workflowRunId` is still
 * the current holder -- so a slow/stale release from an already-aborted
 * run can never clobber a newer run's active lock.
 */
/** Refreshes the active billing lease during long model/tool steps. */
export async function heartbeatUserBillingTurn(
  userId: string,
  workflowRunId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(users)
    .set({ activeBillingRunClaimedAt: new Date() })
    .where(
      and(eq(users.id, userId), eq(users.activeBillingRunId, workflowRunId)),
    )
    .returning({ id: users.id });
  return Boolean(updated);
}

export async function releaseUserBillingTurn(
  userId: string,
  workflowRunId: string,
): Promise<void> {
  await db
    .update(users)
    .set({ activeBillingRunId: null, activeBillingRunClaimedAt: null })
    .where(
      and(eq(users.id, userId), eq(users.activeBillingRunId, workflowRunId)),
    );
}

export async function creditAccount(
  userId: string,
  amountCents: number,
  type: Exclude<CreditTransactionType, "usage_debit">,
  opts: LedgerEntryOptions = {},
): Promise<number> {
  if (amountCents <= 0) {
    throw new Error("creditAccount: amountCents must be positive");
  }
  return applyLedgerEntry(userId, amountCents, type, opts);
}

/**
 * Admin-only manual decrease -- e.g. clawing back unused credit when an
 * admin downgrades a comped account. `amountCents` must be positive (the
 * function negates it internally) and is capped at the user's current
 * balance so this can never push a user into negative credit -- if the
 * requested amount is more than they have, it just zeroes the balance.
 * Returns the resulting balance.
 */
export async function debitAccountAdmin(
  userId: string,
  amountCents: number,
  opts: LedgerEntryOptions = {},
): Promise<number> {
  if (amountCents <= 0) {
    throw new Error("debitAccountAdmin: amountCents must be positive");
  }

  const state = await getUserBillingState(userId);
  if (!state) {
    throw new Error(`debitAccountAdmin: user ${userId} not found`);
  }

  const cappedAmountCents = Math.min(amountCents, state.creditBalanceCents);
  if (cappedAmountCents <= 0) {
    return state.creditBalanceCents;
  }

  return applyLedgerEntry(userId, -cappedAmountCents, "admin_adjustment", opts);
}

/**
 * Persists and settles one model-usage event exactly once.
 *
 * `reference` must be stable across Workflow SDK retries/replays. The event
 * row is inserted in the same transaction as the persistent sub-cent carry,
 * balance update, and credit ledger row. A replay therefore returns the
 * already-applied result instead of charging twice, while a crash before the
 * transaction commits leaves the whole operation safe to retry.
 */
export async function recordBillableUsage(
  userId: string,
  costUsd: number,
  opts: LedgerEntryOptions & { billingReference: string },
): Promise<{ balanceCents: number; chargedCents: number; duplicate: boolean }> {
  if (!Number.isFinite(costUsd) || costUsd <= 0) {
    return {
      balanceCents:
        (await getUserBillingState(userId))?.creditBalanceCents ?? 0,
      chargedCents: 0,
      duplicate: false,
    };
  }

  const costMicros = Math.max(1, Math.round(costUsd * 1_000_000));
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(billingUsageEvents)
      .values({
        id: nanoid(),
        userId,
        reference: opts.billingReference,
        costMicros,
        modelId: opts.modelId ?? null,
      })
      .onConflictDoNothing({
        target: [billingUsageEvents.userId, billingUsageEvents.reference],
      })
      .returning({ id: billingUsageEvents.id });

    if (!inserted) {
      const [existing] = await tx
        .select({ balance: users.creditBalanceCents })
        .from(users)
        .where(eq(users.id, userId));
      return {
        balanceCents: existing?.balance ?? 0,
        chargedCents: 0,
        duplicate: true,
      };
    }

    const [current] = await tx
      .select({
        balance: users.creditBalanceCents,
        grantPool: users.planGrantBalanceCents,
        accruedMicros: users.billingAccruedMicros,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!current)
      throw new Error(`recordBillableUsage: user ${userId} not found`);

    const totalMicros = current.accruedMicros + costMicros;
    const chargedCents = Math.floor(totalMicros / 10_000);
    const remainderMicros = totalMicros % 10_000;
    const grantConsumed = Math.min(chargedCents, current.grantPool);
    const nextBalance = current.balance - chargedCents;

    const [updated] = await tx
      .update(users)
      .set({
        billingAccruedMicros: remainderMicros,
        creditBalanceCents: nextBalance,
        planGrantBalanceCents: current.grantPool - grantConsumed,
      })
      .where(eq(users.id, userId))
      .returning({ creditBalanceCents: users.creditBalanceCents });
    if (!updated)
      throw new Error(`recordBillableUsage: user ${userId} disappeared`);

    if (chargedCents > 0) {
      await tx.insert(creditTransactions).values({
        id: nanoid(),
        userId,
        type: "usage_debit",
        amountCents: -chargedCents,
        balanceAfterCents: updated.creditBalanceCents,
        description: opts.description ?? "Model usage",
        modelId: opts.modelId ?? null,
        billingReference: opts.billingReference,
      });
    }

    return {
      balanceCents: updated.creditBalanceCents,
      chargedCents,
      duplicate: false,
    };
  });
}

/** Debits usage cost from a user's balance. Never blocks/throws on insufficient balance -- the balance is simply allowed to go negative; enforcement (hard-block for free, soft-cutoff for paid) happens at turn-start, not here. */
export async function debitUsage(
  userId: string,
  costCents: number,
  opts: LedgerEntryOptions = {},
): Promise<number> {
  if (costCents <= 0) {
    return (await getUserBillingState(userId))?.creditBalanceCents ?? 0;
  }
  return applyLedgerEntry(userId, -costCents, "usage_debit", opts);
}

/** Applies a plan's renewal credit grant and resets the billing cycle anchor to now. */
export async function grantSubscriptionRenewal(
  userId: string,
  planId: PlanId,
  billingReference?: string,
): Promise<number> {
  const plan = getPlanDefinition(planId);
  const balance = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({
        plan: planId,
        billingCycleAnchor: new Date(),
        creditBalanceCents: sql`${users.creditBalanceCents} + ${plan.creditGrantCents}`,
        planGrantBalanceCents: sql`${users.planGrantBalanceCents} + ${plan.creditGrantCents}`,
      })
      .where(eq(users.id, userId))
      .returning({ creditBalanceCents: users.creditBalanceCents });

    if (!updated) {
      throw new Error(`grantSubscriptionRenewal: user ${userId} not found`);
    }

    await tx.insert(creditTransactions).values({
      id: nanoid(),
      userId,
      type: "subscription_grant",
      amountCents: plan.creditGrantCents,
      balanceAfterCents: updated.creditBalanceCents,
      description: `${plan.name} plan renewal`,
      billingReference: billingReference ?? null,
    });

    return updated.creditBalanceCents;
  });

  return balance;
}

/** $1 = $1 one-off top-up, independent of plan. */
export async function applyTopup(
  userId: string,
  amountCents: number,
  billingReference: string,
): Promise<number> {
  return creditAccount(userId, amountCents, "topup", {
    description: "Wallet top-up",
    billingReference,
  });
}

export async function setBillingCustomerCode(
  userId: string,
  customerCode: string,
): Promise<void> {
  await db
    .update(users)
    .set({ billingCustomerCode: customerCode })
    .where(eq(users.id, userId));
}

export async function setBillingSubscriptionCode(
  userId: string,
  subscriptionCode: string,
): Promise<void> {
  await db
    .update(users)
    .set({ billingSubscriptionCode: subscriptionCode })
    .where(eq(users.id, userId));
}

/**
 * Syncs which plan a subscription is on after an in-place plan change
 * (PATCH /v1/subscriptions, see bachs.ts updateSubscription).
 *
 * Deliberately does NOT grant credit and does NOT touch
 * billingCycleAnchor:
 * - credit comes from the charge itself (collection.succeeded), so a
 *   renewal that really happened grants on its own;
 * - a DOWNGRADE produces no charge at all, and inventing a grant here
 *   would hand out a month of credit nobody paid for;
 * - refreshing the anchor without money changing hands would also hold
 *   expiry enforcement off for another 35 days on a plan the user may
 *   have just left.
 */
export async function syncSubscriptionPlan(
  userId: string,
  planId: "free" | "plus" | "goat" | "pro" | "max",
  subscriptionCode: string,
): Promise<void> {
  await db
    .update(users)
    .set({ plan: planId, billingSubscriptionCode: subscriptionCode })
    .where(eq(users.id, userId));
}

export async function findUserIdByBillingCustomerCode(
  customerCode: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.billingCustomerCode, customerCode));
  return row?.id ?? null;
}

/**
 * End-of-subscription downgrade (subscription.disable webhook).
 *
 * Owner report 2026-09-15: "after one month user account doesn't go
 * back to free" -- the webhook only handled charge.success and
 * subscription.create, so when a Paystack subscription ended (user
 * cancels, or Paystack gives up after failed renewal charges), the
 * users.plan column kept its paid value forever: full model access
 * with no one paying.
 *
 * Guard: only downgrade when the DISABLED subscription_code matches
 * the one currently stored on the user. Paystack sends subscription
 * .disable for every ended subscription -- including a previous one
 * after the user has re-subscribed on a new code -- and that must
 * never kick them off their active plan.
 *
 * Balance is deliberately left untouched: credit is prepaid value
 * ($1 = $1), so a lapsed subscriber keeps whatever wallet balance
 * they've already paid for; only plan perks (model access + future
 * monthly grants) revert to Free.
 */
export async function downgradeToFreeOnSubscriptionEnd(
  customerCode: string,
  subscriptionCode: string,
): Promise<{ downgraded: boolean; userId?: string }> {
  const [row] = await db
    .select({
      id: users.id,
      plan: users.plan,
      billingSubscriptionCode: users.billingSubscriptionCode,
    })
    .from(users)
    .where(
      customerCode
        ? or(
            eq(users.billingCustomerCode, customerCode),
            eq(users.billingSubscriptionCode, subscriptionCode),
          )
        : eq(users.billingSubscriptionCode, subscriptionCode),
    );

  if (!row) {
    return { downgraded: false };
  }

  // Policy (shouldDowngradeOnSubscriptionDisable, in plans.ts): a
  // disable for a subscription the user is no longer on (they
  // re-subscribed on a new code) never kicks them off, and repeat
  // deliveries for an already-Free user are a no-op.
  const shouldDowngrade = (
    await import("@/lib/billing/plans")
  ).shouldDowngradeOnSubscriptionDisable(
    row.plan,
    row.billingSubscriptionCode,
    subscriptionCode,
  );
  if (!shouldDowngrade) {
    return { downgraded: false, userId: row.id };
  }

  await db
    .update(users)
    .set({
      plan: "free",
      billingSubscriptionCode: null,
      billingCycleAnchor: null,
    })
    .where(eq(users.id, row.id));

  // Subscription credit expires with the plan; unexpired paid top-ups survive.
  const pool = await expireGrantPoolOnPlanEnd(row.id);
  if (pool.expiredCents > 0) {
    console.info("[billing] subscription ended: expired unused grant credit", {
      userId: row.id,
      expiredCents: pool.expiredCents,
    });
  }

  return { downgraded: true, userId: row.id };
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Expires any unspent top-up credit from top-ups purchased more than 90 days
 * ago. If a user's non-grant balance (`creditBalanceCents - planGrantBalanceCents`)
 * exceeds the sum of active (<=90d) top-ups (plus any signup trial on free plan),
 * the excess old top-up credit is expired and recorded as a `topup_expiry`
 * ledger entry.
 */
export async function expireStaleTopUps(
  userId: string,
): Promise<{ expiredCents: number }> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);

  return db.transaction(async (tx) => {
    const [userRow] = await tx
      .select({
        plan: users.plan,
        creditBalanceCents: users.creditBalanceCents,
        planGrantBalanceCents: users.planGrantBalanceCents,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!userRow) {
      return { expiredCents: 0 };
    }

    const nonGrantBalance = Math.max(
      0,
      userRow.creditBalanceCents - userRow.planGrantBalanceCents,
    );
    if (nonGrantBalance <= 0) {
      return { expiredCents: 0 };
    }

    const [sums] = await tx
      .select({
        oldTopUpCents: sql<number>`coalesce(sum(case when ${creditTransactions.type} = 'topup' and ${creditTransactions.createdAt} < ${cutoff.toISOString()}::timestamptz then ${creditTransactions.amountCents} else 0 end), 0)::int`,
        activeTopUpCents: sql<number>`coalesce(sum(case when ${creditTransactions.type} = 'topup' and ${creditTransactions.createdAt} >= ${cutoff.toISOString()}::timestamptz then ${creditTransactions.amountCents} else 0 end), 0)::int`,
        trialCents: sql<number>`coalesce(sum(case when ${creditTransactions.type} = 'signup_trial' then ${creditTransactions.amountCents} else 0 end), 0)::int`,
      })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));

    const oldTopUpCents = sums?.oldTopUpCents ?? 0;
    if (oldTopUpCents <= 0) {
      return { expiredCents: 0 };
    }

    const activeTopUpCents = sums?.activeTopUpCents ?? 0;
    const trialAllowance =
      userRow.plan === "free"
        ? Math.max(
            0,
            sums?.trialCents && sums.trialCents > 0 ? sums.trialCents : 100,
          )
        : 0;
    const maxValidNonGrantCents = activeTopUpCents + trialAllowance;

    const expiredCents = Math.max(0, nonGrantBalance - maxValidNonGrantCents);
    if (expiredCents <= 0) {
      return { expiredCents: 0 };
    }

    const [updated] = await tx
      .update(users)
      .set({
        creditBalanceCents: sql`${users.creditBalanceCents} - ${expiredCents}`,
      })
      .where(eq(users.id, userId))
      .returning({ creditBalanceCents: users.creditBalanceCents });

    if (!updated) {
      return { expiredCents: 0 };
    }

    await tx.insert(creditTransactions).values({
      id: nanoid(),
      userId,
      type: "grant_expiry",
      amountCents: -expiredCents,
      balanceAfterCents: updated.creditBalanceCents,
      description: "Top-up credit expired after 90 days",
    });

    return { expiredCents };
  });
}

/**
 * Calculates a user's active, unspent top-up credit balance and 90-day expiry
 * timestamp. Also enforces 90-day top-up expiry first so stale top-ups are
 * removed from `users.creditBalanceCents`.
 */
export async function getUserTopUpBalance(userId: string): Promise<{
  balanceCents: number;
  expiresAt: string | null;
}> {
  await expireStaleTopUps(userId);

  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);

  const [state, topUpRows] = await Promise.all([
    getUserBillingState(userId),
    db
      .select({
        amountCents: creditTransactions.amountCents,
        createdAt: creditTransactions.createdAt,
      })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.type, "topup"),
          gte(creditTransactions.createdAt, cutoff),
        ),
      )
      .orderBy(desc(creditTransactions.createdAt)),
  ]);

  if (!state || topUpRows.length === 0) {
    return { balanceCents: 0, expiresAt: null };
  }

  const totalActiveTopUpPurchased = topUpRows.reduce(
    (acc, r) => acc + Math.max(0, r.amountCents),
    0,
  );
  // Actual remaining unspent top-up credit cannot exceed total balance minus
  // the current subscription grant pool.
  const nonGrantBalanceCents = Math.max(
    0,
    state.creditBalanceCents - state.planGrantBalanceCents,
  );
  const unspentTopUpCents = Math.min(
    totalActiveTopUpPurchased,
    nonGrantBalanceCents,
  );

  if (unspentTopUpCents <= 0) {
    return { balanceCents: 0, expiresAt: null };
  }

  const latestCreatedAt = topUpRows[0]?.createdAt ?? new Date();
  const expiresAt = new Date(
    latestCreatedAt.getTime() + NINETY_DAYS_MS,
  ).toISOString();

  return {
    balanceCents: unspentTopUpCents,
    expiresAt,
  };
}
