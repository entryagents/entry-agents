import { NextRequest, NextResponse } from "next/server";
import { requireDesktopUser, unauthorized } from "@/lib/auth";
import { db, users, creditTransactions } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/desktop/usage — live usage/billing state for the signed-in
 * desktop user: plan, credit balance, and (for the "Entry" plan, id
 * "goat" — the only plan with rolling usage windows) the 5h/weekly/monthly
 * window totals. Reads the SAME tables the web billing page uses.
 *
 * POST /api/desktop/usage — records per-turn token usage (source=desktop)
 * into the SAME usage_events table the web app writes via recordUsage().
 */

interface WindowTotals {
  last5HoursCents: number;
  last7DaysCents: number;
  last30DaysCents: number;
}

async function getUsageWindowTotals(
  userId: string,
  billingCycleAnchor?: Date | null,
): Promise<WindowTotals> {
  const now = Date.now();
  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const anchorMs = billingCycleAnchor
    ? billingCycleAnchor.getTime()
    : now - THIRTY_DAYS_MS;

  const cutoff5hIso = new Date(
    Math.max(now - FIVE_HOURS_MS, anchorMs),
  ).toISOString();
  const cutoff7dIso = new Date(
    Math.max(now - SEVEN_DAYS_MS, anchorMs),
  ).toISOString();
  const cutoff30d = new Date(anchorMs);

  const sums = await db
    .select({
      last5: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff5hIso}::timestamptz then -${creditTransactions.amountCents} else 0 end), 0)`,
      last7: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff7dIso}::timestamptz then -${creditTransactions.amountCents} else 0 end), 0)`,
      last30: sql<number>`coalesce(sum(-${creditTransactions.amountCents}), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage_debit"),
        gte(creditTransactions.createdAt, cutoff30d),
      ),
    );
  const s = sums[0];
  return {
    last5HoursCents: Number(s?.last5 ?? 0),
    last7DaysCents: Number(s?.last7 ?? 0),
    last30DaysCents: Number(s?.last30 ?? 0),
  };
}

export async function GET(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) return unauthorized();

  const rows = await db
    .select({
      plan: users.plan,
      creditBalanceCents: users.creditBalanceCents,
      billingCycleAnchor: users.billingCycleAnchor,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const u = rows[0];
  if (!u) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Plan display names (goat is publicly named "Entry").
  const planNames: Record<string, string> = {
    free: "Free",
    plus: "Plus",
    goat: "Entry",
    pro: "Pro",
    max: "Max",
  };

  let currentPlan = u.plan ?? "free";
  if (currentPlan !== "free" && u.billingCycleAnchor) {
    const anchor = new Date(u.billingCycleAnchor);
    if (!Number.isNaN(anchor.getTime())) {
      const targetMonth = anchor.getUTCMonth() + 1;
      const year = anchor.getUTCFullYear();
      const lastDayOfTargetMonth = new Date(
        Date.UTC(year, targetMonth + 1, 0),
      ).getUTCDate();
      const clampedDay = Math.min(anchor.getUTCDate(), lastDayOfTargetMonth);
      const expiresAtMs = new Date(
        Date.UTC(
          year,
          targetMonth,
          clampedDay,
          anchor.getUTCHours(),
          anchor.getUTCMinutes(),
          anchor.getUTCSeconds(),
          anchor.getUTCMilliseconds(),
        ),
      ).getTime();

      if (Date.now() > expiresAtMs) {
        currentPlan = "free";
        await db
          .update(users)
          .set({
            plan: "free",
            billingSubscriptionCode: null,
            billingCycleAnchor: null,
          })
          .where(eq(users.id, user.id));
      }
    }
  }

  // Rolling windows exist only on the goat/"Entry" plan: $10/5h, $25/week,
  // $50/month (20% / 50% / 100% of the $50 grant).
  const windows = { fiveHour: 1000, weekly: 2500, monthly: 5000 };
  const hasWindows = currentPlan === "goat";

  let usageWindows = null;
  if (hasWindows) {
    const totals = await getUsageWindowTotals(user.id, u.billingCycleAnchor);
    usageWindows = {
      fiveHour: {
        usedCents: totals.last5HoursCents,
        limitCents: windows.fiveHour,
      },
      weekly: { usedCents: totals.last7DaysCents, limitCents: windows.weekly },
      monthly: {
        usedCents: totals.last30DaysCents,
        limitCents: windows.monthly,
      },
    };
  }

  return NextResponse.json({
    plan: currentPlan,
    planName: planNames[currentPlan] ?? currentPlan,
    creditBalanceCents: u.creditBalanceCents,
    usageWindows,
  });
}

interface DesktopUsageBody {
  modelId?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  toolCallCount?: number;
}

export async function POST(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) return unauthorized();

  let body: DesktopUsageBody;
  try {
    body = (await req.json()) as DesktopUsageBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const inputTokens = Math.max(0, Math.floor(body.inputTokens ?? 0));
  const cachedInputTokens = Math.max(
    0,
    Math.floor(body.cachedInputTokens ?? 0),
  );
  const outputTokens = Math.max(0, Math.floor(body.outputTokens ?? 0));

  await db.insert(usageEvents).values({
    id: `desktop-${crypto.randomUUID()}`,
    userId: user.id,
    source: "desktop",
    agentType: "main",
    provider: body.modelId?.split("/")[0] ?? null,
    modelId: body.modelId ?? null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    toolCallCount: Math.max(0, Math.floor(body.toolCallCount ?? 0)),
  });

  return NextResponse.json({ ok: true });
}
