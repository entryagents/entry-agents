import { and, eq, gte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { creditTransactions, usageEvents, users } from "@/lib/db/schema";
import { requireDesktopUser, unauthorized } from "@/lib/desktop/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WindowTotals {
  last5HoursCents: number;
  last7DaysCents: number;
  last30DaysCents: number;
}

async function getUsageWindowTotals(userId: string): Promise<WindowTotals> {
  const sums = await db
    .select({
      last5: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} > now() - interval '5 hours' then abs(${creditTransactions.amountCents}) else 0 end), 0)`,
      last7: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} > now() - interval '7 days' then abs(${creditTransactions.amountCents}) else 0 end), 0)`,
      last30: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} > now() - interval '30 days' then abs(${creditTransactions.amountCents}) else 0 end), 0)`,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage_debit"),
        gte(creditTransactions.createdAt, sql`now() - interval '30 days'`),
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
  if (!user) {
    return unauthorized();
  }

  const rows = await db
    .select({
      plan: users.plan,
      creditBalanceCents: users.creditBalanceCents,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const u = rows[0];
  if (!u) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const planNames: Record<string, string> = {
    free: "Free",
    plus: "Plus",
    goat: "Entry",
    pro: "Pro",
    max: "Max",
  };
  const windows = { fiveHour: 1000, weekly: 2500, monthly: 5000 };
  const hasWindows = u.plan === "goat";

  let usageWindows = null;
  if (hasWindows) {
    const totals = await getUsageWindowTotals(user.id);
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
    userId: user.id,
    email: user.email,
    plan: u.plan,
    planName: planNames[u.plan] ?? u.plan,
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
  if (!user) {
    return unauthorized();
  }

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
