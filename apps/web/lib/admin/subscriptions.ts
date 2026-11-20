import "server-only";

import { and, count, desc, eq, gte } from "drizzle-orm";
import {
  getBachsEnvironmentStatus,
  type BachsEnvironmentStatus,
} from "@/lib/billing/bachs";
import {
  PLAN_CATALOG,
  addOneCalendarMonth,
  getPlanDefinition,
  resolveProductIdForPlan,
} from "@/lib/billing/plans";
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
  customerCode: string | null;
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
  bachsStatus: BachsEnvironmentStatus;
  plusProductId: string | null;
  builderProductId: string | null;
  subscribers: AdminSubscriptionRow[];
}

function toValidIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function getAdminSubscriptionOverview(): Promise<AdminSubscriptionOverview> {
  const now = Date.now();
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);
  const cutoff5hMs = now - 5 * 60 * 60 * 1000;
  const cutoff7dMs = now - 7 * 24 * 60 * 60 * 1000;
  const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [allUsers, dailyMsgRows, recentDebitRows, activeSessionRows] =
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
          billingCustomerCode: users.billingCustomerCode,
          billingSubscriptionCode: users.billingSubscriptionCode,
          billingCycleAnchor: users.billingCycleAnchor,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(300)
        .catch((err) => {
          console.error("[admin/subscriptions] Failed to query users:", err);
          return [];
        }),
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
        .groupBy(sessions.userId)
        .catch((err) => {
          console.error(
            "[admin/subscriptions] Failed to query 24h messages:",
            err,
          );
          return [];
        }),
      db
        .select({
          userId: creditTransactions.userId,
          amountCents: creditTransactions.amountCents,
          createdAt: creditTransactions.createdAt,
        })
        .from(creditTransactions)
        .where(
          and(
            eq(creditTransactions.type, "usage_debit"),
            gte(creditTransactions.createdAt, cutoff30d),
          ),
        )
        .catch((err) => {
          console.error(
            "[admin/subscriptions] Failed to query 30d credit debits:",
            err,
          );
          return [];
        }),
      db
        .select({
          userId: sessions.userId,
          total: count(),
        })
        .from(sessions)
        .where(eq(sessions.status, "running"))
        .groupBy(sessions.userId)
        .catch((err) => {
          console.error(
            "[admin/subscriptions] Failed to query active sessions:",
            err,
          );
          return [];
        }),
    ]);

  const dailyMsgMap = new Map(
    dailyMsgRows.map((r) => [r.userId, Number(r.total) || 0]),
  );

  const spendMap = new Map<
    string,
    { spend5h: number; spend7d: number; spend30d: number }
  >();
  for (const row of recentDebitRows) {
    const debitCents = Math.abs(Number(row.amountCents) || 0);
    if (debitCents <= 0) continue;
    const createdMs = new Date(row.createdAt).getTime();
    const current = spendMap.get(row.userId) ?? {
      spend5h: 0,
      spend7d: 0,
      spend30d: 0,
    };
    current.spend30d += debitCents;
    if (createdMs >= cutoff7dMs) {
      current.spend7d += debitCents;
    }
    if (createdMs >= cutoff5hMs) {
      current.spend5h += debitCents;
    }
    spendMap.set(row.userId, current);
  }

  const sessionMap = new Map(
    activeSessionRows.map((r) => [r.userId, Number(r.total) || 0]),
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
    const anchorIso = toValidIsoString(u.billingCycleAnchor);
    const nextRenewalAt = anchorIso
      ? toValidIsoString(addOneCalendarMonth(anchorIso))
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
      customerCode: u.billingCustomerCode ?? null,
      subscriptionCode: u.billingSubscriptionCode ?? null,
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
    bachsStatus: getBachsEnvironmentStatus(),
    plusProductId: resolveProductIdForPlan(PLAN_CATALOG.plus),
    builderProductId: resolveProductIdForPlan(PLAN_CATALOG.entry),
    subscribers,
  };
}
