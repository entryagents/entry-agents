import { BUILTIN_PLUGIN_CATALOG } from "@entry-agents/agent";
import { desc, gte, sql } from "drizzle-orm";
import {
  deriveAgentHubRoster,
  deriveTeamFeed,
} from "../agent-hub/derive-roster";
import { db } from "./client";
import {
  accounts,
  authSessions,
  benchmarkResults,
  benchmarkRuns,
  billingUsageEvents,
  billingWebhookEvents,
  chatMessages,
  chatReads,
  chatSteeringInbox,
  chats,
  compactionEvents,
  composioSessions,
  creditTransactions,
  feedback,
  githubInstallations,
  githubRepoIndex,
  mcpServers,
  modelOverrides,
  platformSettings,
  sessions,
  shares,
  usageEvents,
  userPlugins,
  userPreferences,
  userSecrets,
  users,
  vercelProjectLinks,
  verification,
  workflowRuns,
  workflowRunSteps,
} from "./schema";

export type AdminTelemetryWindow = "1h" | "24h" | "7d" | "30d";

const WINDOW_MS: Record<AdminTelemetryWindow, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const WINDOW_BUCKETS: Record<AdminTelemetryWindow, number> = {
  "1h": 12, // 5m buckets
  "24h": 24, // 1h buckets
  "7d": 14, // 12h buckets
  "30d": 15, // 2d buckets
};

export function parseAdminTelemetryWindow(
  value: string | null | undefined,
): AdminTelemetryWindow {
  if (value === "1h" || value === "24h" || value === "7d" || value === "30d") {
    return value;
  }
  return "24h";
}

export interface TelemetryActiveRunItem {
  chatId: string;
  chatTitle: string;
  sessionId: string;
  modelId: string | null;
  reasoningEffort: string | null;
  status: string;
  activeStreamId: string | null;
  queuedCount: number;
  userEmail: string | null;
  username: string | null;
  updatedAt: string;
  ageSeconds: number;
}

export interface TelemetryTimeBucket {
  label: string;
  startsAt: string;
  runs: number;
  failures: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  spendUsd: number;
}

export interface TelemetryModelRow {
  modelId: string;
  provider: string | null;
  isDeepSeek: boolean;
  runs: number;
  completedRuns: number;
  failedRuns: number;
  abortedRuns: number;
  errorRatePct: number;
  avgDurationMs: number;
  usageEvents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  cacheHitPct: number;
  estimatedTps: number | null;
  spendUsd: number;
}

export interface TelemetryFailureItem {
  id: string;
  chatId: string;
  sessionId: string;
  modelId: string | null;
  errorMessage: string | null;
  totalDurationMs: number;
  finishedAt: string;
}

export interface AdminTelemetryPayload {
  generatedAt: string;
  window: AdminTelemetryWindow;
  dbLatencyMs: number;
  live: {
    statusCounts: {
      queued: number;
      running: number;
      sleeping: number;
      resuming: number;
      staleOrActiveStream: number;
      failedInWindow: number;
    };
    totalQueuedPrompts: number;
    unreadInboxMessages: number;
    activeBillingLocks: number;
    activeRuns: TelemetryActiveRunItem[];
  };
  sandboxes: {
    totalSessions: number;
    sessionsRunningStatus: number;
    activeCommands: number;
    migrationsFailing: number;
    byLifecycle: Record<string, number>;
    byProvider: Record<string, number>;
    git: {
      connectedRepos: number;
      prsOpen: number;
      prsMerged: number;
      prsClosed: number;
      linesAddedWindow: number;
      linesRemovedWindow: number;
    };
  };
  usage: {
    totalEvents: number;
    webEvents: number;
    desktopEvents: number;
    mainEvents: number;
    subagentEvents: number;
    activeUsers: number;
    totalInputTokens: number;
    totalCachedInputTokens: number;
    totalOutputTokens: number;
    totalToolCalls: number;
    totalSpendUsd: number;
  };
  cache: {
    overallHitPct: number;
    estimatedSavingsUsd: number;
    deepSeek: {
      events: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      hitPct: number;
      spendUsd: number;
    };
  };
  runs: {
    total: number;
    completed: number;
    aborted: number;
    failed: number;
    errorRatePct: number;
    avgDurationMs: number;
    p50DurationMs: number;
    p95DurationMs: number;
    totalSteps: number;
    avgStepDurationMs: number;
  };
  perModel: TelemetryModelRow[];
  timeSeries: TelemetryTimeBucket[];
  recentFailures: TelemetryFailureItem[];
  compaction: {
    eventsInWindow: number;
    chatsAffected: number;
    avgPreCompactTokens: number;
    avgPostCompactTokens: number;
    avgSavingsPct: number;
    totalTokensReclaimed: number;
    totalToolCallsCompacted: number;
    recent: Array<{
      id: string;
      chatId: string | null;
      modelId: string | null;
      preCompactTokens: number;
      postCompactTokens: number;
      contextWindowTokens: number;
      compactedToolCalls: number;
      createdAt: string;
    }>;
  };
  mcp: {
    totalServers: number;
    enabledServers: number;
    disabledServers: number;
    failingServers: number;
    distinctUsers: number;
    totalDiscoveredTools: number;
    byTransport: {
      http: number;
      sse: number;
      stdio: number;
    };
    recentErrors: Array<{
      id: string;
      name: string;
      transport: string;
      enabled: boolean;
      error: string;
      checkedAt: string | null;
    }>;
  };
  secrets: {
    // STRICTLY AGGREGATE ONLY: never emit secret names, values, hints, or hosts.
    totalSecrets: number;
    distinctUsersWithSecrets: number;
    sandboxInjectedSecrets: number;
    hostRestrictedSecrets: number;
    totalUsagesAllTime: number;
    secretsUsedInWindow: number;
  };
  usersAndBilling: {
    totalUsers: number;
    adminUsers: number;
    newUsersInWindow: number;
    githubConnectedUsers: number;
    usersAtZeroCredit: number;
    totalCreditBalanceCents: number;
    totalPlanGrantBalanceCents: number;
    planDistribution: Array<{ plan: string; count: number }>;
    transactionsInWindow: Array<{
      type: string;
      count: number;
      amountCents: number;
    }>;
  };
  platform: {
    totalChats: number;
    totalShares: number;
    unreadFeedback: number;
    feedbackInWindow: number;
    feedbackBySentiment: Record<string, number>;
    freeTierEnabled: boolean;
    titleModelId: string | null;
    latestBenchmarkRun: {
      status: string;
      suiteVersion: string;
      startedAt: string;
    } | null;
  };
  plugins: {
    builtinCatalogCount: number;
    totalUserPluginRows: number;
    enabledPluginRows: number;
    disabledPluginRows: number;
    customPluginRows: number;
    distinctUsers: number;
    secretConfiguredPlugins: number;
    totalTriggersAllTime: number;
    triggeredInWindow: number;
    totalSlashCommands: number;
    byHook: Record<string, number>;
    byCategory: Record<string, number>;
    topPlugins: Array<{
      slug: string;
      name: string;
      source: string;
      category: string;
      installs: number;
      enabledCount: number;
      triggers: number;
      lastTriggeredAt: string | null;
    }>;
  };
  teamsAndSubagents: {
    subagentEventsInWindow: number;
    subagentInputTokens: number;
    subagentCachedInputTokens: number;
    subagentOutputTokens: number;
    subagentToolCalls: number;
    subagentSpendUsd: number;
    subagentShareOfEventsPct: number;
    subagentShareOfTokensPct: number;
    sampledChatsWithSubagents: number;
    sampledChatsWithTeamBoard: number;
    totalSubagentsSpawned: number;
    byRole: Record<string, number>;
    byStatus: Record<string, number>;
    boardEntriesTotal: number;
    boardEntriesByKind: Record<string, number>;
    boardTasksTotal: number;
    boardTasksByStatus: Record<string, number>;
  };
  integrationsAndAuth: {
    activeAuthSessions: number;
    totalAuthSessions: number;
    activeVerifications: number;
    oauthProviders: Array<{
      provider: string;
      linkedAccounts: number;
      distinctUsers: number;
    }>;
    githubApp: {
      totalInstallations: number;
      orgInstallations: number;
      userInstallations: number;
      allReposInstallations: number;
      selectedReposInstallations: number;
      indexedRepoInstallations: number;
      totalIndexedRepos: number;
    };
    vercelProjects: {
      totalLinks: number;
      distinctUsers: number;
      distinctTeams: number;
    };
    composio: {
      totalSessions: number;
      activeUsersInWindow: number;
    };
  };
  messagesAndPipeline: {
    totalMessagesAllTime: number;
    messagesInWindow: number;
    userMessagesInWindow: number;
    assistantMessagesInWindow: number;
    totalChatReads: number;
    stepsByFinishReason: Array<{ reason: string; count: number }>;
    modelOverrides: {
      totalOverrides: number;
      disabledModels: number;
      enabledOverrides: number;
    };
    preferences: {
      configuredUsers: number;
      autoCommitPushUsers: number;
      autoCreatePrUsers: number;
      guidedFrontendUsers: number;
      byPermissionMode: Record<string, number>;
      bySandboxType: Record<string, number>;
    };
    billingPipeline: {
      usageLedgerEventsInWindow: number;
      usageLedgerUsdInWindow: number;
      webhookEventsAllTime: number;
      webhookEventsInWindow: number;
      webhooksByType: Array<{ eventType: string; count: number }>;
    };
    benchmarks: {
      totalRuns: number;
      totalResultRows: number;
      passedResultRows: number;
      passRatePct: number;
      byBenchmark: Array<{
        benchmark: string;
        total: number;
        passed: number;
      }>;
    };
  };
}

function redactPotentialErrorSecrets(message: string | null): string | null {
  if (!message) return null;
  return message
    .replace(
      /\b(sk-[a-zA-Z0-9_-]{12,}|ghp_[a-zA-Z0-9]{16,}|gho_[a-zA-Z0-9]{16,}|Bearer\s+[A-Za-z0-9._-]{16,})\b/g,
      "[REDACTED]",
    )
    .slice(0, 280);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[idx] ?? 0;
}

function formatBucketLabel(
  startMs: number,
  window: AdminTelemetryWindow,
): string {
  const date = new Date(startMs);
  if (window === "1h" || window === "24h") {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function isDeepSeekModel(
  modelId: string | null,
  provider: string | null,
): boolean {
  const m = (modelId ?? "").toLowerCase();
  const p = (provider ?? "").toLowerCase();
  return m.includes("deepseek") || p.includes("deepseek");
}

export async function getAdminTelemetry(
  window: AdminTelemetryWindow = "24h",
): Promise<AdminTelemetryPayload> {
  const now = Date.now();
  const windowMs = WINDOW_MS[window];
  const since = new Date(now - windowMs);
  const sinceIso = since.toISOString();
  const oneHourAgoIso = new Date(now - 60 * 60 * 1000).toISOString();

  const dbPingStart = performance.now();
  await db.execute(sql`select 1`);
  const dbLatencyMs = Math.round(performance.now() - dbPingStart);

  const [
    chatStatusRows,
    activeChatRows,
    queuedChatsRows,
    inboxRows,
    activeBillingLockRows,
    sessionStatsRows,
    sessionLifecycleRows,
    sessionProviderRows,
    gitPrRows,
    gitDiffWindowRows,
    usageAggRows,
    usageWindowRows,
    runsWindowRows,
    stepWindowRows,
    recentFailureRows,
    compactionAggRows,
    compactionRecentRows,
    mcpAggRows,
    mcpTransportRows,
    mcpErrorRows,
    secretsAggRows,
    userAggRows,
    planDistRows,
    githubUsersRows,
    creditTxRows,
    shareCountRows,
    feedbackAggRows,
    feedbackSentimentRows,
    settingsRows,
    benchmarkRows,
  ] = await Promise.all([
    db
      .select({
        status: chats.status,
        hasActiveStream: sql<boolean>`${chats.activeStreamId} IS NOT NULL`,
        count: sql<number>`count(*)::int`,
      })
      .from(chats)
      .groupBy(chats.status, sql`${chats.activeStreamId} IS NOT NULL`),

    db
      .select({
        chatId: chats.id,
        chatTitle: chats.title,
        sessionId: chats.sessionId,
        modelId: chats.modelId,
        reasoningEffort: chats.reasoningEffort,
        status: chats.status,
        activeStreamId: chats.activeStreamId,
        queuedPrompts: chats.queuedPrompts,
        updatedAt: chats.updatedAt,
        runStatusUpdatedAt: chats.runStatusUpdatedAt,
        userEmail: users.email,
        username: users.username,
      })
      .from(chats)
      .innerJoin(sessions, sql`${sessions.id} = ${chats.sessionId}`)
      .leftJoin(users, sql`${users.id} = ${sessions.userId}`)
      .where(
        sql`${chats.status} IN ('queued', 'running', 'sleeping', 'resuming') OR ${chats.activeStreamId} IS NOT NULL`,
      )
      .orderBy(desc(chats.updatedAt))
      .limit(30),

    db
      .select({
        queuedCount: sql<number>`coalesce(sum(jsonb_array_length(${chats.queuedPrompts})), 0)::int`,
      })
      .from(chats)
      .where(
        sql`${chats.queuedPrompts} IS NOT NULL AND jsonb_typeof(${chats.queuedPrompts}) = 'array'`,
      ),

    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(chatSteeringInbox)
      .where(sql`${chatSteeringInbox.status} = 'unread'`),

    db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(sql`${users.activeBillingRunId} IS NOT NULL`),

    db
      .select({
        totalSessions: sql<number>`count(*)::int`,
        sessionsRunningStatus: sql<number>`coalesce(sum(case when ${sessions.status} = 'running' then 1 else 0 end), 0)::int`,
        activeCommands: sql<number>`coalesce(sum(case when ${sessions.activeSandboxCommand} is not null then 1 else 0 end), 0)::int`,
        migrationsFailing: sql<number>`coalesce(sum(case when ${sessions.migrationFailureCount} > 0 then 1 else 0 end), 0)::int`,
        connectedRepos: sql<number>`coalesce(sum(case when ${sessions.cloneUrl} is not null then 1 else 0 end), 0)::int`,
      })
      .from(sessions),

    db
      .select({
        lifecycleState: sessions.lifecycleState,
        count: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .groupBy(sessions.lifecycleState),

    db
      .select({
        provider: sql<string>`coalesce(${sessions.sandboxState}->>'type', 'none')`,
        count: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .groupBy(sql`coalesce(${sessions.sandboxState}->>'type', 'none')`),

    db
      .select({
        prStatus: sessions.prStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(sessions)
      .where(sql`${sessions.prStatus} IS NOT NULL`)
      .groupBy(sessions.prStatus),

    db
      .select({
        linesAdded: sql<number>`coalesce(sum(${sessions.linesAdded}), 0)::int`,
        linesRemoved: sql<number>`coalesce(sum(${sessions.linesRemoved}), 0)::int`,
      })
      .from(sessions)
      .where(gte(sessions.updatedAt, since)),

    db
      .select({
        totalEvents: sql<number>`count(*)::int`,
        webEvents: sql<number>`coalesce(sum(case when ${usageEvents.source} = 'web' then 1 else 0 end), 0)::int`,
        desktopEvents: sql<number>`coalesce(sum(case when ${usageEvents.source} = 'desktop' then 1 else 0 end), 0)::int`,
        mainEvents: sql<number>`coalesce(sum(case when ${usageEvents.agentType} = 'main' then 1 else 0 end), 0)::int`,
        subagentEvents: sql<number>`coalesce(sum(case when ${usageEvents.agentType} = 'subagent' then 1 else 0 end), 0)::int`,
        activeUsers: sql<number>`count(distinct ${usageEvents.userId})::int`,
        totalInputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::bigint`,
        totalCachedInputTokens: sql<number>`coalesce(sum(${usageEvents.cachedInputTokens}), 0)::bigint`,
        totalOutputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::bigint`,
        totalToolCalls: sql<number>`coalesce(sum(${usageEvents.toolCallCount}), 0)::int`,
        totalSpendUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)::double precision`,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${sinceIso}`),

    db
      .select({
        modelId: usageEvents.modelId,
        provider: usageEvents.provider,
        inputTokens: usageEvents.inputTokens,
        cachedInputTokens: usageEvents.cachedInputTokens,
        outputTokens: usageEvents.outputTokens,
        costUsd: usageEvents.costUsd,
        createdAt: usageEvents.createdAt,
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${sinceIso}`),

    db
      .select({
        id: workflowRuns.id,
        modelId: workflowRuns.modelId,
        status: workflowRuns.status,
        totalDurationMs: workflowRuns.totalDurationMs,
        finishedAt: workflowRuns.finishedAt,
      })
      .from(workflowRuns)
      .where(sql`${workflowRuns.finishedAt} >= ${sinceIso}`),

    db
      .select({
        totalSteps: sql<number>`count(*)::int`,
        avgStepDurationMs: sql<number>`coalesce(avg(${workflowRunSteps.durationMs}), 0)::double precision`,
      })
      .from(workflowRunSteps)
      .where(sql`${workflowRunSteps.finishedAt} >= ${sinceIso}`),

    db
      .select({
        id: workflowRuns.id,
        chatId: workflowRuns.chatId,
        sessionId: workflowRuns.sessionId,
        modelId: workflowRuns.modelId,
        errorMessage: workflowRuns.errorMessage,
        totalDurationMs: workflowRuns.totalDurationMs,
        finishedAt: workflowRuns.finishedAt,
      })
      .from(workflowRuns)
      .where(
        sql`${workflowRuns.status} = 'failed' AND ${workflowRuns.finishedAt} >= ${sinceIso}`,
      )
      .orderBy(desc(workflowRuns.finishedAt))
      .limit(15),

    db
      .select({
        eventsInWindow: sql<number>`count(*)::int`,
        chatsAffected: sql<number>`count(distinct ${compactionEvents.chatId})::int`,
        avgPreCompactTokens: sql<number>`coalesce(avg(${compactionEvents.preCompactTokens}), 0)::double precision`,
        avgPostCompactTokens: sql<number>`coalesce(avg(${compactionEvents.postCompactTokens}), 0)::double precision`,
        totalTokensReclaimed: sql<number>`coalesce(sum(greatest(${compactionEvents.preCompactTokens} - ${compactionEvents.postCompactTokens}, 0)), 0)::bigint`,
        totalToolCallsCompacted: sql<number>`coalesce(sum(${compactionEvents.compactedToolCalls} + ${compactionEvents.compactedAnonymousToolResults}), 0)::int`,
      })
      .from(compactionEvents)
      .where(sql`${compactionEvents.createdAt} >= ${sinceIso}`),

    db
      .select({
        id: compactionEvents.id,
        chatId: compactionEvents.chatId,
        modelId: compactionEvents.modelId,
        preCompactTokens: compactionEvents.preCompactTokens,
        postCompactTokens: compactionEvents.postCompactTokens,
        contextWindowTokens: compactionEvents.contextWindowTokens,
        compactedToolCalls: compactionEvents.compactedToolCalls,
        createdAt: compactionEvents.createdAt,
      })
      .from(compactionEvents)
      .where(sql`${compactionEvents.createdAt} >= ${sinceIso}`)
      .orderBy(desc(compactionEvents.createdAt))
      .limit(10),

    db
      .select({
        totalServers: sql<number>`count(*)::int`,
        enabledServers: sql<number>`coalesce(sum(case when ${mcpServers.enabled} then 1 else 0 end), 0)::int`,
        disabledServers: sql<number>`coalesce(sum(case when not ${mcpServers.enabled} then 1 else 0 end), 0)::int`,
        failingServers: sql<number>`coalesce(sum(case when ${mcpServers.lastConnectionError} is not null and ${mcpServers.lastConnectionError} <> '' then 1 else 0 end), 0)::int`,
        distinctUsers: sql<number>`count(distinct ${mcpServers.userId})::int`,
        totalDiscoveredTools: sql<number>`coalesce(sum(coalesce(${mcpServers.lastToolCount}, 0)), 0)::int`,
      })
      .from(mcpServers),

    db
      .select({
        transport: mcpServers.transport,
        count: sql<number>`count(*)::int`,
      })
      .from(mcpServers)
      .groupBy(mcpServers.transport),

    db
      .select({
        id: mcpServers.id,
        name: mcpServers.name,
        transport: mcpServers.transport,
        enabled: mcpServers.enabled,
        error: mcpServers.lastConnectionError,
        checkedAt: mcpServers.lastConnectionCheckedAt,
      })
      .from(mcpServers)
      .where(
        sql`${mcpServers.lastConnectionError} is not null and ${mcpServers.lastConnectionError} <> ''`,
      )
      .orderBy(desc(mcpServers.lastConnectionCheckedAt))
      .limit(10),

    // STRICTLY AGGREGATE: never read name, description, encryptedValue, maskedHint, or allowedHosts!
    db
      .select({
        totalSecrets: sql<number>`count(*)::int`,
        distinctUsersWithSecrets: sql<number>`count(distinct ${userSecrets.userId})::int`,
        sandboxInjectedSecrets: sql<number>`coalesce(sum(case when ${userSecrets.injectInSandbox} then 1 else 0 end), 0)::int`,
        hostRestrictedSecrets: sql<number>`coalesce(sum(case when ${userSecrets.allowedHosts} is not null and jsonb_array_length(${userSecrets.allowedHosts}) > 0 then 1 else 0 end), 0)::int`,
        totalUsagesAllTime: sql<number>`coalesce(sum(${userSecrets.usageCount}), 0)::int`,
        secretsUsedInWindow: sql<number>`coalesce(sum(case when ${userSecrets.lastUsedAt} >= ${sinceIso} then 1 else 0 end), 0)::int`,
      })
      .from(userSecrets),

    db
      .select({
        totalUsers: sql<number>`count(*)::int`,
        adminUsers: sql<number>`coalesce(sum(case when ${users.isAdmin} then 1 else 0 end), 0)::int`,
        newUsersInWindow: sql<number>`coalesce(sum(case when ${users.createdAt} >= ${sinceIso} then 1 else 0 end), 0)::int`,
        usersAtZeroCredit: sql<number>`coalesce(sum(case when ${users.creditBalanceCents} <= 0 then 1 else 0 end), 0)::int`,
        totalCreditBalanceCents: sql<number>`coalesce(sum(${users.creditBalanceCents}), 0)::bigint`,
        totalPlanGrantBalanceCents: sql<number>`coalesce(sum(${users.planGrantBalanceCents}), 0)::bigint`,
      })
      .from(users),

    db
      .select({
        plan: users.plan,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .groupBy(users.plan),

    db
      .select({
        count: sql<number>`count(distinct user_id)::int`,
      })
      .from(sql`accounts`)
      .where(sql`provider_id = 'github'`),

    db
      .select({
        type: creditTransactions.type,
        count: sql<number>`count(*)::int`,
        amountCents: sql<number>`coalesce(sum(${creditTransactions.amountCents}), 0)::bigint`,
      })
      .from(creditTransactions)
      .where(sql`${creditTransactions.createdAt} >= ${sinceIso}`)
      .groupBy(creditTransactions.type),

    db
      .select({
        totalChats: sql<number>`(select count(*)::int from chats)`,
        totalShares: sql<number>`count(*)::int`,
      })
      .from(shares),

    db
      .select({
        unreadFeedback: sql<number>`coalesce(sum(case when ${feedback.status} = 'new' then 1 else 0 end), 0)::int`,
        feedbackInWindow: sql<number>`coalesce(sum(case when ${feedback.createdAt} >= ${sinceIso} then 1 else 0 end), 0)::int`,
      })
      .from(feedback),

    db
      .select({
        sentiment: sql<string>`coalesce(${feedback.sentiment}, 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(feedback)
      .where(sql`${feedback.createdAt} >= ${sinceIso}`)
      .groupBy(sql`coalesce(${feedback.sentiment}, 'unknown')`),

    db
      .select({
        freeTierEnabled: platformSettings.freeTierEnabled,
        titleModelId: platformSettings.titleModelId,
      })
      .from(platformSettings)
      .limit(1),

    db
      .select({
        status: benchmarkRuns.status,
        suiteVersion: benchmarkRuns.suiteVersion,
        startedAt: benchmarkRuns.startedAt,
      })
      .from(benchmarkRuns)
      .orderBy(desc(benchmarkRuns.startedAt))
      .limit(1),
  ]);

  // --- Live status counts ---
  const statusCounts = {
    queued: 0,
    running: 0,
    sleeping: 0,
    resuming: 0,
    staleOrActiveStream: 0,
    failedInWindow: recentFailureRows.length,
  };
  for (const row of chatStatusRows) {
    if (row.status === "queued") statusCounts.queued += row.count;
    else if (row.status === "running") statusCounts.running += row.count;
    else if (row.status === "sleeping") statusCounts.sleeping += row.count;
    else if (row.status === "resuming") statusCounts.resuming += row.count;
    else if (row.hasActiveStream) statusCounts.staleOrActiveStream += row.count;
  }

  // Also check 1h failures explicitly if window is wider
  const failedRecentCheck = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workflowRuns)
    .where(
      sql`${workflowRuns.status} = 'failed' AND ${workflowRuns.finishedAt} >= ${oneHourAgoIso}`,
    );
  statusCounts.failedInWindow =
    failedRecentCheck[0]?.count ?? recentFailureRows.length;

  const activeRuns: TelemetryActiveRunItem[] = activeChatRows.map((row) => {
    const refTime = row.runStatusUpdatedAt ?? row.updatedAt;
    return {
      chatId: row.chatId,
      chatTitle: row.chatTitle,
      sessionId: row.sessionId,
      modelId: row.modelId,
      reasoningEffort: row.reasoningEffort,
      status: row.status,
      activeStreamId: row.activeStreamId,
      queuedCount: Array.isArray(row.queuedPrompts)
        ? row.queuedPrompts.length
        : 0,
      userEmail: row.userEmail,
      username: row.username,
      updatedAt: refTime.toISOString(),
      ageSeconds: Math.max(0, Math.round((now - refTime.getTime()) / 1000)),
    };
  });

  // --- Sandboxes & Git ---
  const byLifecycle: Record<string, number> = {};
  for (const r of sessionLifecycleRows) {
    byLifecycle[r.lifecycleState ?? "none"] = r.count;
  }
  const byProvider: Record<string, number> = {};
  for (const r of sessionProviderRows) {
    byProvider[r.provider ?? "none"] = r.count;
  }
  let prsOpen = 0;
  let prsMerged = 0;
  let prsClosed = 0;
  for (const r of gitPrRows) {
    if (r.prStatus === "open") prsOpen += r.count;
    else if (r.prStatus === "merged") prsMerged += r.count;
    else if (r.prStatus === "closed") prsClosed += r.count;
  }

  // --- Usage & Cache & Per-model stats & TimeSeries ---
  const bucketCount = WINDOW_BUCKETS[window];
  const bucketMs = windowMs / bucketCount;
  const startMs = now - windowMs;
  const timeSeries: TelemetryTimeBucket[] = Array.from(
    { length: bucketCount },
    (_, i) => {
      const bStart = startMs + i * bucketMs;
      return {
        label: formatBucketLabel(bStart, window),
        startsAt: new Date(bStart).toISOString(),
        runs: 0,
        failures: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        spendUsd: 0,
      };
    },
  );

  const modelStatsMap = new Map<
    string,
    {
      modelId: string;
      provider: string | null;
      runs: number;
      completedRuns: number;
      failedRuns: number;
      abortedRuns: number;
      totalDurationMs: number;
      completedDurationMs: number;
      usageEvents: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      spendUsd: number;
    }
  >();

  const ensureModel = (modelId: string | null, provider: string | null) => {
    const key = modelId ?? "unknown";
    let entry = modelStatsMap.get(key);
    if (!entry) {
      entry = {
        modelId: key,
        provider,
        runs: 0,
        completedRuns: 0,
        failedRuns: 0,
        abortedRuns: 0,
        totalDurationMs: 0,
        completedDurationMs: 0,
        usageEvents: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        spendUsd: 0,
      };
      modelStatsMap.set(key, entry);
    } else if (!entry.provider && provider) {
      entry.provider = provider;
    }
    return entry;
  };

  let deepSeekEvents = 0;
  let deepSeekInputTokens = 0;
  let deepSeekCachedInputTokens = 0;
  let deepSeekOutputTokens = 0;
  let deepSeekSpendUsd = 0;
  let estimatedCacheSavingsUsd = 0;

  for (const row of usageWindowRows) {
    const m = ensureModel(row.modelId, row.provider);
    m.usageEvents += 1;
    m.inputTokens += row.inputTokens;
    m.cachedInputTokens += row.cachedInputTokens;
    m.outputTokens += row.outputTokens;
    m.spendUsd += row.costUsd ?? 0;

    if (isDeepSeekModel(row.modelId, row.provider)) {
      deepSeekEvents += 1;
      deepSeekInputTokens += row.inputTokens;
      deepSeekCachedInputTokens += row.cachedInputTokens;
      deepSeekOutputTokens += row.outputTokens;
      deepSeekSpendUsd += row.costUsd ?? 0;
    }

    // Approximate prompt cache savings from effective discount on cached tokens
    if (
      row.cachedInputTokens > 0 &&
      row.inputTokens > 0 &&
      row.costUsd &&
      row.costUsd > 0
    ) {
      const cachedRatio = Math.min(1, row.cachedInputTokens / row.inputTokens);
      // Conservative average cached-read discount (75-90% cheaper input tokens):
      // assume ~50% of billed event spend came from input tokens when output exists.
      const estInputShare =
        row.costUsd *
        (row.inputTokens / (row.inputTokens + row.outputTokens * 3));
      const multiplier = isDeepSeekModel(row.modelId, row.provider) ? 9 : 4;
      estimatedCacheSavingsUsd +=
        estInputShare * cachedRatio * (multiplier - 1) * 0.25;
    }

    const idx = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((row.createdAt.getTime() - startMs) / bucketMs)),
    );
    const bucket = timeSeries[idx];
    if (bucket) {
      bucket.inputTokens += row.inputTokens;
      bucket.cachedInputTokens += row.cachedInputTokens;
      bucket.outputTokens += row.outputTokens;
      bucket.spendUsd += row.costUsd ?? 0;
    }
  }

  let completedRuns = 0;
  let failedRuns = 0;
  let abortedRuns = 0;
  let totalRunDurationMs = 0;
  const durations: number[] = [];

  for (const run of runsWindowRows) {
    const m = ensureModel(run.modelId, null);
    m.runs += 1;
    m.totalDurationMs += run.totalDurationMs;
    totalRunDurationMs += run.totalDurationMs;
    durations.push(run.totalDurationMs);

    if (run.status === "completed") {
      completedRuns += 1;
      m.completedRuns += 1;
      m.completedDurationMs += run.totalDurationMs;
    } else if (run.status === "failed") {
      failedRuns += 1;
      m.failedRuns += 1;
    } else {
      abortedRuns += 1;
      m.abortedRuns += 1;
    }

    const idx = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((run.finishedAt.getTime() - startMs) / bucketMs)),
    );
    const bucket = timeSeries[idx];
    if (bucket) {
      bucket.runs += 1;
      if (run.status === "failed") {
        bucket.failures += 1;
      }
    }
  }

  durations.sort((a, b) => a - b);

  const perModel: TelemetryModelRow[] = [...modelStatsMap.values()]
    .map((m) => {
      const finishedDenominator = m.runs;
      const errorRatePct =
        finishedDenominator > 0
          ? (m.failedRuns / finishedDenominator) * 100
          : 0;
      const cacheHitPct =
        m.inputTokens > 0
          ? Math.min(100, (m.cachedInputTokens / m.inputTokens) * 100)
          : 0;
      const activeDurationSec =
        (m.completedDurationMs > 0
          ? m.completedDurationMs
          : m.totalDurationMs) / 1000;
      const estimatedTps =
        activeDurationSec > 0 && m.outputTokens > 0
          ? Number((m.outputTokens / activeDurationSec).toFixed(1))
          : null;

      return {
        modelId: m.modelId,
        provider: m.provider,
        isDeepSeek: isDeepSeekModel(m.modelId, m.provider),
        runs: m.runs,
        completedRuns: m.completedRuns,
        failedRuns: m.failedRuns,
        abortedRuns: m.abortedRuns,
        errorRatePct,
        avgDurationMs: m.runs > 0 ? Math.round(m.totalDurationMs / m.runs) : 0,
        usageEvents: m.usageEvents,
        inputTokens: m.inputTokens,
        cachedInputTokens: m.cachedInputTokens,
        outputTokens: m.outputTokens,
        cacheHitPct,
        estimatedTps,
        spendUsd: m.spendUsd,
      };
    })
    .toSorted((a, b) => {
      if (b.spendUsd !== a.spendUsd) return b.spendUsd - a.spendUsd;
      if (b.runs !== a.runs) return b.runs - a.runs;
      return b.inputTokens - a.inputTokens;
    });

  const usageAgg = usageAggRows[0];
  const totalInputTokens = Number(usageAgg?.totalInputTokens ?? 0);
  const totalCachedInputTokens = Number(usageAgg?.totalCachedInputTokens ?? 0);
  const totalOutputTokens = Number(usageAgg?.totalOutputTokens ?? 0);
  const overallHitPct =
    totalInputTokens > 0
      ? Math.min(100, (totalCachedInputTokens / totalInputTokens) * 100)
      : 0;

  const compAgg = compactionAggRows[0];
  const avgPre = Math.round(compAgg?.avgPreCompactTokens ?? 0);
  const avgPost = Math.round(compAgg?.avgPostCompactTokens ?? 0);
  const avgSavingsPct =
    avgPre > 0
      ? Math.max(0, Math.round(((avgPre - avgPost) / avgPre) * 100))
      : 0;

  const byTransport = { http: 0, sse: 0, stdio: 0 };
  for (const r of mcpTransportRows) {
    if (r.transport === "http") byTransport.http = r.count;
    else if (r.transport === "sse") byTransport.sse = r.count;
    else if (r.transport === "stdio") byTransport.stdio = r.count;
  }

  const feedbackBySentiment: Record<string, number> = {};
  for (const r of feedbackSentimentRows) {
    feedbackBySentiment[r.sentiment ?? "unknown"] = r.count;
  }

  const totalRuns = runsWindowRows.length;
  const sessionStats = sessionStatsRows[0];
  const mcpAgg = mcpAggRows[0];
  const secAgg = secretsAggRows[0];
  const userAgg = userAggRows[0];
  const stepAgg = stepWindowRows[0];
  const settings = settingsRows[0];
  const latestBench = benchmarkRows[0];
  const nowIso = new Date(now).toISOString();

  // --- Extended telemetry across remaining schema tables ---
  const [
    pluginRows,
    subagentUsageRows,
    recentAssistantMsgRows,
    authSessionAggRows,
    verificationAggRows,
    oauthProviderRows,
    githubInstAggRows,
    githubRepoIdxAggRows,
    vercelLinksAggRows,
    composioAggRows,
    messagesAggRows,
    chatReadsAggRows,
    stepReasonRows,
    modelOverridesAggRows,
    prefsAggRows,
    prefsPermRows,
    prefsSandboxRows,
    billingUsageAggRows,
    billingWebhookAggRows,
    billingWebhookTypeRows,
    benchCountsRows,
    benchBySuiteRows,
  ] = await Promise.all([
    db
      .select({
        slug: userPlugins.slug,
        name: userPlugins.name,
        source: userPlugins.source,
        category: userPlugins.category,
        enabled: userPlugins.enabled,
        userId: userPlugins.userId,
        manifest: userPlugins.manifest,
        hasSecretConfig: sql<boolean>`${userPlugins.encryptedConfig} IS NOT NULL AND ${userPlugins.encryptedConfig} <> ''`,
        triggerCount: userPlugins.triggerCount,
        lastTriggeredAt: userPlugins.lastTriggeredAt,
      })
      .from(userPlugins)
      .catch(() => []),

    db
      .select({
        events: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::bigint`,
        cachedInputTokens: sql<number>`coalesce(sum(${usageEvents.cachedInputTokens}), 0)::bigint`,
        outputTokens: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::bigint`,
        toolCalls: sql<number>`coalesce(sum(${usageEvents.toolCallCount}), 0)::int`,
        spendUsd: sql<number>`coalesce(sum(${usageEvents.costUsd}), 0)::double precision`,
      })
      .from(usageEvents)
      .where(
        sql`${usageEvents.createdAt} >= ${sinceIso} AND ${usageEvents.agentType} = 'subagent'`,
      )
      .catch(() => []),

    db
      .select({
        chatId: chatMessages.chatId,
        parts: chatMessages.parts,
      })
      .from(chatMessages)
      .where(
        sql`${chatMessages.role} = 'assistant' AND ${chatMessages.createdAt} >= ${sinceIso}`,
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(200)
      .catch(() => []),

    db
      .select({
        totalAuthSessions: sql<number>`count(*)::int`,
        activeAuthSessions: sql<number>`coalesce(sum(case when ${authSessions.expiresAt} > ${nowIso} then 1 else 0 end), 0)::int`,
      })
      .from(authSessions)
      .catch(() => []),

    db
      .select({
        activeVerifications: sql<number>`coalesce(sum(case when ${verification.expiresAt} > ${nowIso} then 1 else 0 end), 0)::int`,
      })
      .from(verification)
      .catch(() => []),

    db
      .select({
        provider: accounts.providerId,
        linkedAccounts: sql<number>`count(*)::int`,
        distinctUsers: sql<number>`count(distinct ${accounts.userId})::int`,
      })
      .from(accounts)
      .groupBy(accounts.providerId)
      .catch(() => []),

    db
      .select({
        totalInstallations: sql<number>`count(*)::int`,
        orgInstallations: sql<number>`coalesce(sum(case when ${githubInstallations.accountType} = 'Organization' then 1 else 0 end), 0)::int`,
        userInstallations: sql<number>`coalesce(sum(case when ${githubInstallations.accountType} = 'User' then 1 else 0 end), 0)::int`,
        allReposInstallations: sql<number>`coalesce(sum(case when ${githubInstallations.repositorySelection} = 'all' then 1 else 0 end), 0)::int`,
        selectedReposInstallations: sql<number>`coalesce(sum(case when ${githubInstallations.repositorySelection} = 'selected' then 1 else 0 end), 0)::int`,
      })
      .from(githubInstallations)
      .catch(() => []),

    db
      .select({
        indexedInstallations: sql<number>`count(*)::int`,
        totalIndexedRepos: sql<number>`coalesce(sum(case when jsonb_typeof(${githubRepoIndex.repos}) = 'array' then jsonb_array_length(${githubRepoIndex.repos}) else 0 end), 0)::int`,
      })
      .from(githubRepoIndex)
      .catch(() => []),

    db
      .select({
        totalLinks: sql<number>`count(*)::int`,
        distinctUsers: sql<number>`count(distinct ${vercelProjectLinks.userId})::int`,
        distinctTeams: sql<number>`count(distinct ${vercelProjectLinks.teamId})::int`,
      })
      .from(vercelProjectLinks)
      .catch(() => []),

    db
      .select({
        totalSessions: sql<number>`count(*)::int`,
        activeUsersInWindow: sql<number>`coalesce(sum(case when ${composioSessions.updatedAt} >= ${sinceIso} then 1 else 0 end), 0)::int`,
      })
      .from(composioSessions)
      .catch(() => []),

    db
      .select({
        totalMessagesAllTime: sql<number>`count(*)::int`,
        messagesInWindow: sql<number>`coalesce(sum(case when ${chatMessages.createdAt} >= ${sinceIso} then 1 else 0 end), 0)::int`,
        userMessagesInWindow: sql<number>`coalesce(sum(case when ${chatMessages.createdAt} >= ${sinceIso} and ${chatMessages.role} = 'user' then 1 else 0 end), 0)::int`,
        assistantMessagesInWindow: sql<number>`coalesce(sum(case when ${chatMessages.createdAt} >= ${sinceIso} and ${chatMessages.role} = 'assistant' then 1 else 0 end), 0)::int`,
      })
      .from(chatMessages)
      .catch(() => []),

    db
      .select({
        totalChatReads: sql<number>`count(*)::int`,
      })
      .from(chatReads)
      .catch(() => []),

    db
      .select({
        reason: sql<string>`coalesce(${workflowRunSteps.finishReason}, 'unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowRunSteps)
      .where(sql`${workflowRunSteps.finishedAt} >= ${sinceIso}`)
      .groupBy(sql`coalesce(${workflowRunSteps.finishReason}, 'unknown')`)
      .catch(() => []),

    db
      .select({
        totalOverrides: sql<number>`count(*)::int`,
        disabledModels: sql<number>`coalesce(sum(case when ${modelOverrides.disabled} then 1 else 0 end), 0)::int`,
        enabledOverrides: sql<number>`coalesce(sum(case when not ${modelOverrides.disabled} then 1 else 0 end), 0)::int`,
      })
      .from(modelOverrides)
      .catch(() => []),

    db
      .select({
        configuredUsers: sql<number>`count(*)::int`,
        autoCommitPushUsers: sql<number>`coalesce(sum(case when ${userPreferences.autoCommitPush} then 1 else 0 end), 0)::int`,
        autoCreatePrUsers: sql<number>`coalesce(sum(case when ${userPreferences.autoCreatePr} then 1 else 0 end), 0)::int`,
        guidedFrontendUsers: sql<number>`coalesce(sum(case when ${userPreferences.guidedFrontendWorkflowEnabled} then 1 else 0 end), 0)::int`,
      })
      .from(userPreferences)
      .catch(() => []),

    db
      .select({
        mode: userPreferences.defaultPermissionMode,
        count: sql<number>`count(*)::int`,
      })
      .from(userPreferences)
      .groupBy(userPreferences.defaultPermissionMode)
      .catch(() => []),

    db
      .select({
        sandboxType: sql<string>`coalesce(${userPreferences.defaultSandboxType}, 'boxd')`,
        count: sql<number>`count(*)::int`,
      })
      .from(userPreferences)
      .groupBy(sql`coalesce(${userPreferences.defaultSandboxType}, 'boxd')`)
      .catch(() => []),

    db
      .select({
        eventsInWindow: sql<number>`count(*)::int`,
        totalMicrosInWindow: sql<number>`coalesce(sum(${billingUsageEvents.costMicros}), 0)::bigint`,
      })
      .from(billingUsageEvents)
      .where(sql`${billingUsageEvents.createdAt} >= ${sinceIso}`)
      .catch(() => []),

    db
      .select({
        webhookEventsAllTime: sql<number>`count(*)::int`,
        webhookEventsInWindow: sql<number>`coalesce(sum(case when ${billingWebhookEvents.processedAt} >= ${sinceIso} then 1 else 0 end), 0)::int`,
      })
      .from(billingWebhookEvents)
      .catch(() => []),

    db
      .select({
        eventType: billingWebhookEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(billingWebhookEvents)
      .where(sql`${billingWebhookEvents.processedAt} >= ${sinceIso}`)
      .groupBy(billingWebhookEvents.eventType)
      .catch(() => []),

    db
      .select({
        totalRuns: sql<number>`(select count(*)::int from benchmark_runs)`,
        totalResultRows: sql<number>`count(*)::int`,
        passedResultRows: sql<number>`coalesce(sum(case when ${benchmarkResults.passed} then 1 else 0 end), 0)::int`,
      })
      .from(benchmarkResults)
      .catch(() => []),

    db
      .select({
        benchmark: benchmarkResults.benchmark,
        total: sql<number>`count(*)::int`,
        passed: sql<number>`coalesce(sum(case when ${benchmarkResults.passed} then 1 else 0 end), 0)::int`,
      })
      .from(benchmarkResults)
      .groupBy(benchmarkResults.benchmark)
      .catch(() => []),
  ]);

  // --- Aggregate Plugins ---
  const pluginUserSet = new Set<string>();
  let enabledPluginRows = 0;
  let disabledPluginRows = 0;
  let customPluginRows = 0;
  let secretConfiguredPlugins = 0;
  let totalTriggersAllTime = 0;
  let triggeredInWindow = 0;
  let totalSlashCommands = 0;
  const byHook: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const pluginRollupMap = new Map<
    string,
    {
      slug: string;
      name: string;
      source: string;
      category: string;
      installs: number;
      enabledCount: number;
      triggers: number;
      lastTriggeredAt: string | null;
    }
  >();

  // Seed built-in catalog so admins always see built-in plugins even before user overrides
  for (const bp of BUILTIN_PLUGIN_CATALOG) {
    byCategory[bp.category] = (byCategory[bp.category] ?? 0) + 1;
    for (const hookKey of bp.hooks) {
      byHook[hookKey] = (byHook[hookKey] ?? 0) + 1;
    }
    totalSlashCommands += bp.slashCommands.length;
    pluginRollupMap.set(bp.slug, {
      slug: bp.slug,
      name: bp.name,
      source: "builtin",
      category: bp.category,
      installs: 0,
      enabledCount: 1,
      triggers: 0,
      lastTriggeredAt: null,
    });
  }

  for (const row of pluginRows) {
    pluginUserSet.add(row.userId);
    if (row.enabled) enabledPluginRows += 1;
    else disabledPluginRows += 1;
    if (row.source === "custom") customPluginRows += 1;
    if (row.hasSecretConfig) secretConfiguredPlugins += 1;
    totalTriggersAllTime += row.triggerCount ?? 0;
    if (
      row.lastTriggeredAt &&
      row.lastTriggeredAt.getTime() >= since.getTime()
    ) {
      triggeredInWindow += 1;
    }

    if (row.source === "custom") {
      byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
      const manifestObj = row.manifest;
      if (manifestObj && Array.isArray(manifestObj.hooks)) {
        for (const hookKey of manifestObj.hooks) {
          byHook[hookKey] = (byHook[hookKey] ?? 0) + 1;
        }
      }
      if (manifestObj && Array.isArray(manifestObj.slashCommands)) {
        totalSlashCommands += manifestObj.slashCommands.length;
      }
    }

    const existing = pluginRollupMap.get(row.slug);
    const isoLast = row.lastTriggeredAt
      ? row.lastTriggeredAt.toISOString()
      : null;
    if (existing) {
      existing.installs += 1;
      if (row.enabled) existing.enabledCount += 1;
      existing.triggers += row.triggerCount ?? 0;
      if (
        isoLast &&
        (!existing.lastTriggeredAt || isoLast > existing.lastTriggeredAt)
      ) {
        existing.lastTriggeredAt = isoLast;
      }
    } else {
      pluginRollupMap.set(row.slug, {
        slug: row.slug,
        name: row.name,
        source: row.source,
        category: row.category,
        installs: 1,
        enabledCount: row.enabled ? 1 : 0,
        triggers: row.triggerCount ?? 0,
        lastTriggeredAt: isoLast,
      });
    }
  }

  const topPlugins = [...pluginRollupMap.values()]
    .toSorted((a, b) => {
      if (b.triggers !== a.triggers) return b.triggers - a.triggers;
      return b.installs - a.installs;
    })
    .slice(0, 10);

  // --- Aggregate Teams & Subagents ---
  const subAgg = subagentUsageRows[0];
  const subEvents = subAgg?.events ?? 0;
  const subInTokens = Number(subAgg?.inputTokens ?? 0);
  const subCachedTokens = Number(subAgg?.cachedInputTokens ?? 0);
  const subOutTokens = Number(subAgg?.outputTokens ?? 0);
  const subToolCalls = subAgg?.toolCalls ?? 0;
  const subSpendUsd = Number(subAgg?.spendUsd ?? 0);
  const totalWindowEvents = usageAgg?.totalEvents ?? 0;
  const totalWindowTokens = totalInputTokens + totalOutputTokens;
  const subTotalTokens = subInTokens + subOutTokens;

  const byChatMessages = new Map<string, unknown[]>();
  for (const msgRow of recentAssistantMsgRows) {
    const list = byChatMessages.get(msgRow.chatId) ?? [];
    list.push(msgRow.parts);
    byChatMessages.set(msgRow.chatId, list);
  }

  let sampledChatsWithSubagents = 0;
  let sampledChatsWithTeamBoard = 0;
  let totalSubagentsSpawned = 0;
  const byRole: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let boardEntriesTotal = 0;
  const boardEntriesByKind: Record<string, number> = {};
  let boardTasksTotal = 0;
  const boardTasksByStatus: Record<string, number> = {};

  for (const [, msgs] of byChatMessages) {
    const roster = deriveAgentHubRoster(msgs);
    if (roster.length > 0) {
      sampledChatsWithSubagents += 1;
      totalSubagentsSpawned += roster.length;
      for (const item of roster) {
        const roleKey = item.subagentType || "general-purpose";
        byRole[roleKey] = (byRole[roleKey] ?? 0) + 1;
        byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
      }
    }
    const feed = deriveTeamFeed(msgs);
    if (feed.entries.length > 0 || feed.tasks.length > 0) {
      sampledChatsWithTeamBoard += 1;
      boardEntriesTotal += feed.entries.length;
      for (const entry of feed.entries) {
        boardEntriesByKind[entry.kind] =
          (boardEntriesByKind[entry.kind] ?? 0) + 1;
      }
      boardTasksTotal += feed.tasks.length;
      for (const task of feed.tasks) {
        boardTasksByStatus[task.status] =
          (boardTasksByStatus[task.status] ?? 0) + 1;
      }
    }
  }

  // --- Aggregate Preferences & Benchmarks ---
  const byPermissionMode: Record<string, number> = {};
  for (const r of prefsPermRows) {
    byPermissionMode[r.mode ?? "ask"] = r.count;
  }
  const bySandboxType: Record<string, number> = {};
  for (const r of prefsSandboxRows) {
    bySandboxType[r.sandboxType ?? "boxd"] = r.count;
  }

  const authAgg = authSessionAggRows[0];
  const verAgg = verificationAggRows[0];
  const ghInstAgg = githubInstAggRows[0];
  const ghIdxAgg = githubRepoIdxAggRows[0];
  const vercelAgg = vercelLinksAggRows[0];
  const compSessionAgg = composioAggRows[0];
  const msgAgg = messagesAggRows[0];
  const readsAgg = chatReadsAggRows[0];
  const overridesAgg = modelOverridesAggRows[0];
  const prefAgg = prefsAggRows[0];
  const billUsageAgg = billingUsageAggRows[0];
  const billWebhookAgg = billingWebhookAggRows[0];
  const benchAgg = benchCountsRows[0];
  const totalBenchResults = benchAgg?.totalResultRows ?? 0;
  const passedBenchResults = benchAgg?.passedResultRows ?? 0;

  return {
    generatedAt: nowIso,
    window,
    dbLatencyMs,
    live: {
      statusCounts,
      totalQueuedPrompts: queuedChatsRows[0]?.queuedCount ?? 0,
      unreadInboxMessages: inboxRows[0]?.count ?? 0,
      activeBillingLocks: activeBillingLockRows[0]?.count ?? 0,
      activeRuns,
    },
    sandboxes: {
      totalSessions: sessionStats?.totalSessions ?? 0,
      sessionsRunningStatus: sessionStats?.sessionsRunningStatus ?? 0,
      activeCommands: sessionStats?.activeCommands ?? 0,
      migrationsFailing: sessionStats?.migrationsFailing ?? 0,
      byLifecycle,
      byProvider,
      git: {
        connectedRepos: sessionStats?.connectedRepos ?? 0,
        prsOpen,
        prsMerged,
        prsClosed,
        linesAddedWindow: gitDiffWindowRows[0]?.linesAdded ?? 0,
        linesRemovedWindow: gitDiffWindowRows[0]?.linesRemoved ?? 0,
      },
    },
    usage: {
      totalEvents: usageAgg?.totalEvents ?? 0,
      webEvents: usageAgg?.webEvents ?? 0,
      desktopEvents: usageAgg?.desktopEvents ?? 0,
      mainEvents: usageAgg?.mainEvents ?? 0,
      subagentEvents: usageAgg?.subagentEvents ?? 0,
      activeUsers: usageAgg?.activeUsers ?? 0,
      totalInputTokens,
      totalCachedInputTokens,
      totalOutputTokens,
      totalToolCalls: usageAgg?.totalToolCalls ?? 0,
      totalSpendUsd: Number(usageAgg?.totalSpendUsd ?? 0),
    },
    cache: {
      overallHitPct,
      estimatedSavingsUsd: estimatedCacheSavingsUsd,
      deepSeek: {
        events: deepSeekEvents,
        inputTokens: deepSeekInputTokens,
        cachedInputTokens: deepSeekCachedInputTokens,
        outputTokens: deepSeekOutputTokens,
        hitPct:
          deepSeekInputTokens > 0
            ? Math.min(
                100,
                (deepSeekCachedInputTokens / deepSeekInputTokens) * 100,
              )
            : 0,
        spendUsd: deepSeekSpendUsd,
      },
    },
    runs: {
      total: totalRuns,
      completed: completedRuns,
      aborted: abortedRuns,
      failed: failedRuns,
      errorRatePct: totalRuns > 0 ? (failedRuns / totalRuns) * 100 : 0,
      avgDurationMs:
        totalRuns > 0 ? Math.round(totalRunDurationMs / totalRuns) : 0,
      p50DurationMs: percentile(durations, 0.5),
      p95DurationMs: percentile(durations, 0.95),
      totalSteps: stepAgg?.totalSteps ?? 0,
      avgStepDurationMs: Math.round(stepAgg?.avgStepDurationMs ?? 0),
    },
    perModel,
    timeSeries,
    recentFailures: recentFailureRows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      sessionId: r.sessionId,
      modelId: r.modelId,
      errorMessage: redactPotentialErrorSecrets(r.errorMessage),
      totalDurationMs: r.totalDurationMs,
      finishedAt: r.finishedAt.toISOString(),
    })),
    compaction: {
      eventsInWindow: compAgg?.eventsInWindow ?? 0,
      chatsAffected: compAgg?.chatsAffected ?? 0,
      avgPreCompactTokens: avgPre,
      avgPostCompactTokens: avgPost,
      avgSavingsPct,
      totalTokensReclaimed: Number(compAgg?.totalTokensReclaimed ?? 0),
      totalToolCallsCompacted: compAgg?.totalToolCallsCompacted ?? 0,
      recent: compactionRecentRows.map((r) => ({
        id: r.id,
        chatId: r.chatId,
        modelId: r.modelId,
        preCompactTokens: r.preCompactTokens,
        postCompactTokens: r.postCompactTokens,
        contextWindowTokens: r.contextWindowTokens,
        compactedToolCalls: r.compactedToolCalls,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    mcp: {
      totalServers: mcpAgg?.totalServers ?? 0,
      enabledServers: mcpAgg?.enabledServers ?? 0,
      disabledServers: mcpAgg?.disabledServers ?? 0,
      failingServers: mcpAgg?.failingServers ?? 0,
      distinctUsers: mcpAgg?.distinctUsers ?? 0,
      totalDiscoveredTools: mcpAgg?.totalDiscoveredTools ?? 0,
      byTransport,
      recentErrors: mcpErrorRows
        .filter((r) => Boolean(r.error))
        .map((r) => ({
          id: r.id,
          name: r.name,
          transport: r.transport,
          enabled: r.enabled,
          error: redactPotentialErrorSecrets(r.error) ?? "Connection error",
          checkedAt: r.checkedAt ? r.checkedAt.toISOString() : null,
        })),
    },
    secrets: {
      totalSecrets: secAgg?.totalSecrets ?? 0,
      distinctUsersWithSecrets: secAgg?.distinctUsersWithSecrets ?? 0,
      sandboxInjectedSecrets: secAgg?.sandboxInjectedSecrets ?? 0,
      hostRestrictedSecrets: secAgg?.hostRestrictedSecrets ?? 0,
      totalUsagesAllTime: secAgg?.totalUsagesAllTime ?? 0,
      secretsUsedInWindow: secAgg?.secretsUsedInWindow ?? 0,
    },
    usersAndBilling: {
      totalUsers: userAgg?.totalUsers ?? 0,
      adminUsers: userAgg?.adminUsers ?? 0,
      newUsersInWindow: userAgg?.newUsersInWindow ?? 0,
      githubConnectedUsers: githubUsersRows[0]?.count ?? 0,
      usersAtZeroCredit: userAgg?.usersAtZeroCredit ?? 0,
      totalCreditBalanceCents: Number(userAgg?.totalCreditBalanceCents ?? 0),
      totalPlanGrantBalanceCents: Number(
        userAgg?.totalPlanGrantBalanceCents ?? 0,
      ),
      planDistribution: planDistRows.map((r) => ({
        plan: r.plan,
        count: r.count,
      })),
      transactionsInWindow: creditTxRows.map((r) => ({
        type: r.type,
        count: r.count,
        amountCents: Number(r.amountCents ?? 0),
      })),
    },
    platform: {
      totalChats: shareCountRows[0]?.totalChats ?? 0,
      totalShares: shareCountRows[0]?.totalShares ?? 0,
      unreadFeedback: feedbackAggRows[0]?.unreadFeedback ?? 0,
      feedbackInWindow: feedbackAggRows[0]?.feedbackInWindow ?? 0,
      feedbackBySentiment,
      freeTierEnabled: settings?.freeTierEnabled ?? true,
      titleModelId: settings?.titleModelId ?? null,
      latestBenchmarkRun: latestBench
        ? {
            status: latestBench.status,
            suiteVersion: latestBench.suiteVersion,
            startedAt: latestBench.startedAt.toISOString(),
          }
        : null,
    },
    plugins: {
      builtinCatalogCount: BUILTIN_PLUGIN_CATALOG.length,
      totalUserPluginRows: pluginRows.length,
      enabledPluginRows,
      disabledPluginRows,
      customPluginRows,
      distinctUsers: pluginUserSet.size,
      secretConfiguredPlugins,
      totalTriggersAllTime,
      triggeredInWindow,
      totalSlashCommands,
      byHook,
      byCategory,
      topPlugins,
    },
    teamsAndSubagents: {
      subagentEventsInWindow: subEvents,
      subagentInputTokens: subInTokens,
      subagentCachedInputTokens: subCachedTokens,
      subagentOutputTokens: subOutTokens,
      subagentToolCalls: subToolCalls,
      subagentSpendUsd: subSpendUsd,
      subagentShareOfEventsPct:
        totalWindowEvents > 0
          ? Math.min(100, (subEvents / totalWindowEvents) * 100)
          : 0,
      subagentShareOfTokensPct:
        totalWindowTokens > 0
          ? Math.min(100, (subTotalTokens / totalWindowTokens) * 100)
          : 0,
      sampledChatsWithSubagents,
      sampledChatsWithTeamBoard,
      totalSubagentsSpawned,
      byRole,
      byStatus,
      boardEntriesTotal,
      boardEntriesByKind,
      boardTasksTotal,
      boardTasksByStatus,
    },
    integrationsAndAuth: {
      activeAuthSessions: authAgg?.activeAuthSessions ?? 0,
      totalAuthSessions: authAgg?.totalAuthSessions ?? 0,
      activeVerifications: verAgg?.activeVerifications ?? 0,
      oauthProviders: oauthProviderRows.map((r) => ({
        provider: r.provider,
        linkedAccounts: r.linkedAccounts,
        distinctUsers: r.distinctUsers,
      })),
      githubApp: {
        totalInstallations: ghInstAgg?.totalInstallations ?? 0,
        orgInstallations: ghInstAgg?.orgInstallations ?? 0,
        userInstallations: ghInstAgg?.userInstallations ?? 0,
        allReposInstallations: ghInstAgg?.allReposInstallations ?? 0,
        selectedReposInstallations: ghInstAgg?.selectedReposInstallations ?? 0,
        indexedRepoInstallations: ghIdxAgg?.indexedInstallations ?? 0,
        totalIndexedRepos: ghIdxAgg?.totalIndexedRepos ?? 0,
      },
      vercelProjects: {
        totalLinks: vercelAgg?.totalLinks ?? 0,
        distinctUsers: vercelAgg?.distinctUsers ?? 0,
        distinctTeams: vercelAgg?.distinctTeams ?? 0,
      },
      composio: {
        totalSessions: compSessionAgg?.totalSessions ?? 0,
        activeUsersInWindow: compSessionAgg?.activeUsersInWindow ?? 0,
      },
    },
    messagesAndPipeline: {
      totalMessagesAllTime: msgAgg?.totalMessagesAllTime ?? 0,
      messagesInWindow: msgAgg?.messagesInWindow ?? 0,
      userMessagesInWindow: msgAgg?.userMessagesInWindow ?? 0,
      assistantMessagesInWindow: msgAgg?.assistantMessagesInWindow ?? 0,
      totalChatReads: readsAgg?.totalChatReads ?? 0,
      stepsByFinishReason: stepReasonRows
        .map((r) => ({ reason: r.reason, count: r.count }))
        .toSorted((a, b) => b.count - a.count),
      modelOverrides: {
        totalOverrides: overridesAgg?.totalOverrides ?? 0,
        disabledModels: overridesAgg?.disabledModels ?? 0,
        enabledOverrides: overridesAgg?.enabledOverrides ?? 0,
      },
      preferences: {
        configuredUsers: prefAgg?.configuredUsers ?? 0,
        autoCommitPushUsers: prefAgg?.autoCommitPushUsers ?? 0,
        autoCreatePrUsers: prefAgg?.autoCreatePrUsers ?? 0,
        guidedFrontendUsers: prefAgg?.guidedFrontendUsers ?? 0,
        byPermissionMode,
        bySandboxType,
      },
      billingPipeline: {
        usageLedgerEventsInWindow: billUsageAgg?.eventsInWindow ?? 0,
        usageLedgerUsdInWindow:
          Number(billUsageAgg?.totalMicrosInWindow ?? 0) / 1_000_000,
        webhookEventsAllTime: billWebhookAgg?.webhookEventsAllTime ?? 0,
        webhookEventsInWindow: billWebhookAgg?.webhookEventsInWindow ?? 0,
        webhooksByType: billingWebhookTypeRows
          .map((r) => ({ eventType: r.eventType, count: r.count }))
          .toSorted((a, b) => b.count - a.count),
      },
      benchmarks: {
        totalRuns: benchAgg?.totalRuns ?? 0,
        totalResultRows: totalBenchResults,
        passedResultRows: passedBenchResults,
        passRatePct:
          totalBenchResults > 0
            ? (passedBenchResults / totalBenchResults) * 100
            : 0,
        byBenchmark: benchBySuiteRows.map((r) => ({
          benchmark: r.benchmark,
          total: r.total,
          passed: r.passed,
        })),
      },
    },
  };
}
