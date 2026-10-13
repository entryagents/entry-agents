import { sql } from "drizzle-orm";
import type { AvailableModel } from "@/lib/models";
import { db } from "./client";
import { usageEvents, users } from "./schema";

export interface AdminUsagePerModelRow {
  modelId: string;
  provider: string | null;
  eventCount: number;
  totalInputTokens: number;
  totalCachedInputTokens: number;
  totalOutputTokens: number;
  /** undefined when one or more events have no persisted cost snapshot. */
  estimatedCostUsd: number | undefined;
}

export interface AdminUsageTopUserRow {
  userId: string;
  username: string;
  name: string | null;
  email: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  hasUnpricedUsage: boolean;
}

export interface AdminPlatformUsageOverview {
  rangeDays: number;
  totalActiveUsers: number;
  totalEvents: number;
  totalInputTokens: number;
  totalCachedInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  /** True if any usage event has no persisted cost snapshot. */
  hasUnpricedUsage: boolean;
  perModel: AdminUsagePerModelRow[];
  topUsers: AdminUsageTopUserRow[];
}

interface RawUserEventRow {
  userId: string;
  username: string;
  name: string | null;
  email: string | null;
  modelId: string | null;
  provider: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface AdminUsageOverviewOptions {
  /** Lookback window in days. Defaults to 30. */
  days?: number;
  /**
   * Retained for call-site compatibility. Historical usage ignores this
   * catalog and reads the per-event cost snapshot instead.
   */
  modelCostCatalog?: AvailableModel[];
  /** Max number of top-spending users to return. Defaults to 10. */
  topUserLimit?: number;
}

/**
 * Platform-wide usage + estimated spend across every user, for the admin
 * dashboard. Cost is read from the immutable `usage_events.cost_usd`
 * snapshot written when the event is recorded. It must never be recalculated
 * from the live model catalog: routes can be removed and prices can change.
 * Legacy rows with no snapshot remain explicitly unpriced rather than being
 * silently repriced with today's catalog.
 *
 * Historical costs are read from each usage event's immutable cost_usd
 * snapshot. The live model catalog is intentionally not consulted here.
 */
export async function getAdminPlatformUsageOverview(
  options: AdminUsageOverviewOptions,
): Promise<AdminPlatformUsageOverview> {
  const days = options.days ?? 30;
  const topUserLimit = options.topUserLimit ?? 10;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const rows: RawUserEventRow[] = await db
    .select({
      userId: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      modelId: usageEvents.modelId,
      provider: usageEvents.provider,
      inputTokens: usageEvents.inputTokens,
      cachedInputTokens: usageEvents.cachedInputTokens,
      outputTokens: usageEvents.outputTokens,
      costUsd: usageEvents.costUsd,
    })
    .from(usageEvents)
    .innerJoin(users, sql`${usageEvents.userId} = ${users.id}`)
    .where(sql`${usageEvents.createdAt} >= ${since.toISOString()}`);

  const perModelMap = new Map<string, AdminUsagePerModelRow>();
  const topUsersMap = new Map<string, AdminUsageTopUserRow>();
  const activeUserIds = new Set<string>();

  let totalEvents = 0;
  let totalInputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCostUsd = 0;
  let hasUnpricedUsage = false;

  for (const row of rows) {
    activeUserIds.add(row.userId);
    totalEvents += 1;
    totalInputTokens += row.inputTokens;
    totalCachedInputTokens += row.cachedInputTokens;
    totalOutputTokens += row.outputTokens;

    // This is the cost snapshot captured when the event was processed.
    // Never look up live route pricing here: model routes and prices are
    // mutable, historical usage is not.
    const estimatedCost = row.costUsd ?? undefined;
    const rowIsUnpriced = estimatedCost === undefined;
    if (rowIsUnpriced) {
      hasUnpricedUsage = true;
    } else {
      totalEstimatedCostUsd += estimatedCost;
    }

    const modelKey = row.modelId ?? "unknown";
    const existingModel = perModelMap.get(modelKey);
    if (existingModel) {
      existingModel.eventCount += 1;
      existingModel.totalInputTokens += row.inputTokens;
      existingModel.totalCachedInputTokens += row.cachedInputTokens;
      existingModel.totalOutputTokens += row.outputTokens;
      existingModel.estimatedCostUsd =
        existingModel.estimatedCostUsd === undefined &&
        estimatedCost === undefined
          ? undefined
          : (existingModel.estimatedCostUsd ?? 0) + (estimatedCost ?? 0);
    } else {
      perModelMap.set(modelKey, {
        modelId: modelKey,
        provider: row.provider,
        eventCount: 1,
        totalInputTokens: row.inputTokens,
        totalCachedInputTokens: row.cachedInputTokens,
        totalOutputTokens: row.outputTokens,
        estimatedCostUsd: estimatedCost,
      });
    }

    const existingUser = topUsersMap.get(row.userId);
    if (existingUser) {
      existingUser.totalInputTokens += row.inputTokens;
      existingUser.totalOutputTokens += row.outputTokens;
      existingUser.estimatedCostUsd += estimatedCost ?? 0;
      existingUser.hasUnpricedUsage =
        existingUser.hasUnpricedUsage || rowIsUnpriced;
    } else {
      topUsersMap.set(row.userId, {
        userId: row.userId,
        username: row.username,
        name: row.name,
        email: row.email,
        totalInputTokens: row.inputTokens,
        totalOutputTokens: row.outputTokens,
        estimatedCostUsd: estimatedCost ?? 0,
        hasUnpricedUsage: rowIsUnpriced,
      });
    }
  }

  const topUsers = [...topUsersMap.values()]
    .toSorted((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, topUserLimit);

  const perModel = [...perModelMap.values()].toSorted((a, b) => {
    const costA = a.estimatedCostUsd ?? -1;
    const costB = b.estimatedCostUsd ?? -1;
    if (costB !== costA) return costB - costA;
    return (
      b.totalInputTokens +
      b.totalOutputTokens -
      (a.totalInputTokens + a.totalOutputTokens)
    );
  });

  return {
    rangeDays: days,
    totalActiveUsers: activeUserIds.size,
    totalEvents,
    totalInputTokens,
    totalCachedInputTokens,
    totalOutputTokens,
    totalEstimatedCostUsd,
    hasUnpricedUsage,
    perModel,
    topUsers,
  };
}
