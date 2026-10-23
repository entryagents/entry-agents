import { getServerSession } from "@/lib/session/get-server-session";
import {
  enforcePlanExpiry,
  getUsageWindowTotals,
  getUserTopUpBalance,
} from "@/lib/billing/credit-ledger";
import { isUserAdmin } from "@/lib/db/users";
import { getPlanDefinition } from "@/lib/billing/plans";

/**
 * Lightweight "what plan am I on / how much credit do I have left" read,
 * used by the sidebar balance widget. Separate from /api/billing/verify
 * (which is tied to a specific Paystack transaction reference right
 * after checkout) -- this one is just a plain GET for whenever the UI
 * needs the current numbers.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  // OWN expiry enforcement (see enforcePlanExpiry): a lapsed
  // subscriber's plan reverts to Free on their next billing-page visit,
  // not just on their next chat turn. Admins are exempt.
  const isAdmin = await isUserAdmin(session.user.id).catch(() => false);
  const state = await enforcePlanExpiry(session.user.id, { isAdmin });
  if (!state) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const plan = getPlanDefinition(state.plan);
  const topUp = await getUserTopUpBalance(session.user.id);

  // Entry Windows (2026-09-15): plans with rolling usage windows (only
  // the Entry plan today) also get their live window usage returned so
  // the billing page can render the window status card. Everything
  // else gets null -- windows are exclusive to this plan.
  let usageWindows: {
    mode?: "rolling" | "fixed";
    fiveHour: {
      usedCents: number;
      limitCents: number;
      resetsAt?: string | null;
    };
    weekly: { usedCents: number; limitCents: number; resetsAt?: string | null };
    monthly: {
      usedCents: number;
      limitCents: number;
      resetsAt?: string | null;
    };
  } | null = null;
  if (plan.usageWindows) {
    const totals = await getUsageWindowTotals(session.user.id);
    usageWindows = {
      mode: totals.mode ?? "rolling",
      fiveHour: {
        usedCents: totals.last5HoursCents,
        limitCents: plan.usageWindows.fiveHourLimitCents,
        resetsAt: totals.resetsAt5h ?? null,
      },
      weekly: {
        usedCents: totals.last7DaysCents,
        limitCents: plan.usageWindows.weeklyLimitCents,
        resetsAt: totals.resetsAt7d ?? null,
      },
      monthly: {
        usedCents: totals.last30DaysCents,
        limitCents: plan.usageWindows.monthlyLimitCents,
        resetsAt: totals.resetsAt30d ?? null,
      },
    };
  }

  const anchorDate = state.billingCycleAnchor
    ? new Date(state.billingCycleAnchor)
    : null;
  const isPaidPlan = state.plan && state.plan !== "free";
  const expiresAt =
    anchorDate && isPaidPlan
      ? new Date(anchorDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

  return Response.json(
    {
      plan: state.plan,
      planName: plan.name,
      creditBalanceCents: state.creditBalanceCents,
      creditGrantCents: plan.creditGrantCents,
      topUpBalanceCents: topUp.balanceCents,
      topUpExpiresAt: topUp.expiresAt,
      billingCycleAnchor: anchorDate?.toISOString() ?? null,
      expiresAt,
      usageWindows,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, no-cache, must-revalidate",
      },
    },
  );
}
