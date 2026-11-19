import "server-only";

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { addOneCalendarMonth, getPlanDefinition } from "@/lib/billing/plans";
import { resolveSandboxVcpusForPlan } from "@/lib/billing/sandbox-limits";
import { db } from "@/lib/db/client";
import {
  chatMessages,
  chats,
  creditTransactions,
  sessions,
  users,
} from "@/lib/db/schema";

export interface AdminSubscriptionRow {
  id: string;
  username: string;
  email: string | null;
  isAdmin: boolean;
  planId: string;
  planName: string;
  priceUsdCents: number;
  creditBalanceCents: number;
  subscriptionGrantCents: number;
  subscriptionCode: string | null;
  billingCycleAnchor: string | null;
  nextRenewalAt: string | null;
  dailyMessages24h: number;
  spend5hCents: number;
  spend7dCents: number;
  spend30dCents: number;
  activeSessions: number;
  sandboxVcpus: number;
}

export interface AdminSubscriptionOverview {
  estimatedMrrCents: number;
  paidCount: number;
  freeCount: number;
  planCounts: Record<string, number>;
  totalActiveSessions: number;
  twoVcpuUsers: number;
  subscribers: AdminSubscriptionRow[];
}

export async function getAdminSubscriptionOverview(): Promise<AdminSubscriptionOverview> {
  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);
  const cutoff5h = new Date(now - 5 * 60 * 60 * 1000);
  const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [allUsers, dailyMsgRows, spendRows, activeSessionRows] =
    await Promise.all([
      db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          isAdmin: users.isAdmin,
          plan: users.plan,
          creditBalanceCents: users.creditBalanceCents,
          planGrantBalanceCents: users.planGrantBalanceCents,
          billingSubscriptionCode: users.billingSubscriptionCode,
          billingCycleAnchor: users.billingCycleAnchor,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(200),
      db
        .select({
          userId: sessions.userId,
          total: count(),
        })
        .from(chatMessages)
        .innerJoin(chats, eq(chatMessages.chatId, chats.id))
        .innerJoin(sessions, eq(chats.sessionId, sessions.id))
        .where(
          and(
            eq(chatMessages.role, "user"),
            gte(chatMessages.createdAt, cutoff24h),
          ),
        )
        .groupBy(sessions.userId),
      db
        .select({
          userId: creditTransactions.userId,
          spend5h: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff5h} then abs(${creditTransactions.amountCents}) else 0 end), 0)`,
          spend7d: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff7d} then abs(${creditTransactions.amountCents}) else 0 end), 0)`,
          spend30d: sql<number>`coalesce(sum(case when ${creditTransactions.createdAt} >= ${cutoff30d} then abs(${creditTransactions.amountCents}) else 0 end), 0)`,
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.type, "usage_debit"),
            gte(creditTransactions.createdAt, cutoff30d),
          ),
        )
        .groupBy(creditTransactions.userId),
      db
        .select({
          userId: sessions.userId,
          total: count(),
        })
        .from(sessions)
        .where(eq(sessions.status, "running"))
        .groupBy(sessions.userId),
    ]);

  const dailyMsgMap = new Map(
    dailyMsgRows.map((r) => [r.userId, Number(r.total)]),
  );
  const spendMap = new Map(
    spendRows.map((r) => [
      r.userId,
      {
        spend5h: Number(r.spend5h),
        spend7d: Number(r.spend7d),
        spend30d: Number(r.spend30d),
      },
    ]),
  );
  const sessionMap = new Map(
    activeSessionRows.map((r) => [r.userId, Number(r.total)]),
  );

  let estimatedMrrCents = 0;
  let paidCount = 0;
  let freeCount = 0;
  let totalActiveSessions = 0;
  let twoVcpuUsers = 0;
  const planCounts: Record<string, number> = {};

  const subscribers: AdminSubscriptionRow[] = allUsers.map((u) => {
    const plan = getPlanDefinition(u.plan);
    planCounts[plan.id] = (planCounts[plan.id] ?? 0) + 1;
    if (plan.id === "free") {
      freeCount += 1;
    } else {
      paidCount += 1;
      estimatedMrrCents += plan.priceUsdCents;
    }

    const activeSessions = sessionMap.get(u.id) ?? 0;
    totalActiveSessions += activeSessions;

    const sandboxVcpus = resolveSandboxVcpusForPlan({
      planId: plan.id,
      isAdmin: u.isAdmin,
      providerType: "boxd",
    });
    if (sandboxVcpus >= 2) {
      twoVcpuUsers += 1;
    }

    const spend = spendMap.get(u.id);
    const anchorIso = u.billingCycleAnchor
      ? new Date(u.billingCycleAnchor).toISOString()
      : null;
    const nextRenewalAt = u.billingCycleAnchor
      ? addOneCalendarMonth(u.billingCycleAnchor).toISOString()
      : null;

    return {
      id: u.id,
      username: u.username,
      email: u.email,
      isAdmin: u.isAdmin,
      planId: plan.id,
      planName: plan.name,
      priceUsdCents: plan.priceUsdCents,
      creditBalanceCents: u.creditBalanceCents,
      subscriptionGrantCents: u.planGrantBalanceCents,
      subscriptionCode: u.billingSubscriptionCode,
      billingCycleAnchor: anchorIso,
      nextRenewalAt,
      dailyMessages24h: dailyMsgMap.get(u.id) ?? 0,
      spend5hCents: spend?.spend5h ?? 0,
      spend7dCents: spend?.spend7d ?? 0,
      spend30dCents: spend?.spend30d ?? 0,
      activeSessions,
      sandboxVcpus,
    };
  });

  // Sort paid subscribers first, then by 30d spend descending
  subscribers.sort((a, b) => {
    if (a.priceUsdCents !== b.priceUsdCents) {
      return b.priceUsdCents - a.priceUsdCents;
    }
    return b.spend30dCents - a.spend30dCents;
  });

  return {
    estimatedMrrCents,
    paidCount,
    freeCount,
    planCounts,
    totalActiveSessions,
    twoVcpuUsers,
    subscribers,
  };
}
