import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { addOneCalendarMonth, getPlanDefinition } from "@/lib/billing/plans";
import { resolveSandboxVcpusForPlan } from "@/lib/billing/sandbox-limits";
import { db } from "./client";
import {
  accounts,
  authSessions,
  chatMessages,
  chats,
  compactionEvents,
  creditTransactions,
  githubInstallations,
  sessions,
  usageEvents,
  userPreferences,
  users,
  workflowRuns,
} from "./schema";

export interface AdminUserAuthSessionRow {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceSummary: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface AdminUserConnectedAccountRow {
  id: string;
  providerId: string;
  accountId: string;
  scope: string | null;
  hasRefreshToken: boolean;
  accessTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserGitHubInstallationRow {
  id: string;
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositorySelection: "all" | "selected";
  createdAt: string;
}

export interface AdminUserPreferencesSnapshot {
  defaultModelId: string | null;
  defaultSubagentModelId: string | null;
  defaultSandboxType: string | null;
  defaultPermissionMode: string;
  autoCommitPush: boolean;
  autoCreatePr: boolean;
  guidedFrontendWorkflowEnabled: boolean;
  publicUsageEnabled: boolean;
  alertsEnabled: boolean;
}

export interface AdminUserWorkflowRunRow {
  id: string;
  chatId: string;
  sessionId: string;
  modelId: string | null;
  status: "completed" | "aborted" | "failed";
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  errorMessage: string | null;
}

export interface AdminUserChatTelemetryRow {
  chatId: string;
  chatTitle: string;
  chatStatus: string;
  modelId: string | null;
  reasoningEffort: string | null;
  activeStreamId: string | null;
  createdAt: string;
  updatedAt: string;
  lastAssistantMessageAt: string | null;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: "running" | "completed" | "failed" | "archived";
  lifecycleState: string | null;
  lifecycleError: string | null;
  sandboxProvider: string | null;
  sandboxId: string | null;
  activeSandboxCommand: string | null;
  repoOwner: string | null;
  repoName: string | null;
  branch: string | null;
  prNumber: number | null;
  prStatus: "open" | "merged" | "closed" | null;
  linesAdded: number;
  linesRemoved: number;
  userMessageCount: number;
  assistantMessageCount: number;
  totalMessageCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  cacheHitPercent: number;
  totalCostUsd: number;
  toolCallCount: number;
  toolBreakdown: Record<string, number>;
  subagentCount: number;
  lastUserPromptPreview: string | null;
  lastAssistantPreview: string | null;
  workflowRuns: AdminUserWorkflowRunRow[];
}

export interface AdminUserCreditTransactionRow {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string | null;
  modelId: string | null;
  billingReference: string | null;
  createdAt: string;
}

export interface AdminUserBillingAndUsageTelemetry {
  emailVerified: boolean;
  updatedAt: string;
  planId: string;
  planName: string;
  priceUsdCents: number;
  creditBalanceCents: number;
  planGrantBalanceCents: number;
  billingAccruedMicros: number;
  billingCustomerCode: string | null;
  billingSubscriptionCode: string | null;
  billingCycleAnchor: string | null;
  nextRenewalAt: string | null;
  activeBillingRunId: string | null;
  activeBillingRunClaimedAt: string | null;
  dailyMessages24h: number;
  spend5hCents: number;
  spend7dCents: number;
  spend30dCents: number;
  totalInputTokens: number;
  totalCachedInputTokens: number;
  totalOutputTokens: number;
  cacheHitRatePercent: number;
  totalToolCalls: number;
  mainAgentTurns: number;
  subagentTurns: number;
  webTurns: number;
  desktopTurns: number;
  compactionCount: number;
  compactionTokensSaved: number;
  sandboxVcpus: number;
  activeSessionsCount: number;
  totalSessionsCount: number;
  totalChatsCount: number;
  totalMessagesCount: number;
  totalUserMessagesCount: number;
  totalAssistantMessagesCount: number;
  totalWorkflowRuns: number;
  completedRuns: number;
  abortedRuns: number;
  failedRuns: number;
}

export interface AdminUserDeepTelemetry {
  billingAndUsage: AdminUserBillingAndUsageTelemetry;
  authSessions: AdminUserAuthSessionRow[];
  connectedAccounts: AdminUserConnectedAccountRow[];
  githubInstallations: AdminUserGitHubInstallationRow[];
  preferences: AdminUserPreferencesSnapshot | null;
  chats: AdminUserChatTelemetryRow[];
  creditLedger: AdminUserCreditTransactionRow[];
}

export interface AdminChatTranscriptMessageRow {
  id: string;
  role: "user" | "assistant";
  createdAt: string;
  textPreview: string;
  reasoningPreview: string | null;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    state: string;
    inputPreview: string;
    outputPreview: string;
  }>;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  modelId: string | null;
}

export function summarizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = ua.includes("Edg/")
    ? "Edge"
    : ua.includes("OPR/") || ua.includes("Opera")
      ? "Opera"
      : ua.includes("Chrome/") && !ua.includes("Chromium")
        ? "Chrome"
        : ua.includes("Firefox/")
          ? "Firefox"
          : ua.includes("Safari/") && !ua.includes("Chrome/")
            ? "Safari"
            : ua.includes("Electron")
              ? "Desktop App"
              : "Browser";

  const os =
    ua.includes("iPhone") || ua.includes("iPad")
      ? "iOS"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("Mac OS X") || ua.includes("Macintosh")
          ? "macOS"
          : ua.includes("Windows")
            ? "Windows"
            : ua.includes("Linux")
              ? "Linux"
              : "OS";

  return `${browser} · ${os}`;
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractMessagePartsList(
  partsCol: unknown,
): Array<Record<string, unknown>> {
  if (Array.isArray(partsCol)) {
    return partsCol.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    );
  }
  if (partsCol && typeof partsCol === "object") {
    const record = partsCol as Record<string, unknown>;
    if (Array.isArray(record.parts)) {
      return record.parts.filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      );
    }
  }
  return [];
}

function extractMessageMetadata(
  partsCol: unknown,
  metadataCol: unknown,
): Record<string, unknown> | null {
  if (metadataCol && typeof metadataCol === "object") {
    return metadataCol as Record<string, unknown>;
  }
  if (partsCol && typeof partsCol === "object" && !Array.isArray(partsCol)) {
    const nested = (partsCol as Record<string, unknown>).metadata;
    if (nested && typeof nested === "object") {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

function parseMessageStats(
  partsCol: unknown,
  metadataCol: unknown,
): {
  text: string;
  reasoning: string;
  toolNames: string[];
  subagentCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  modelId: string | null;
} {
  const parts = extractMessagePartsList(partsCol);
  const textChunks: string[] = [];
  const reasoningChunks: string[] = [];
  const toolNames: string[] = [];
  let subagentCount = 0;

  for (const part of parts) {
    const type = typeof part.type === "string" ? part.type : "";
    if (type === "text" && typeof part.text === "string" && part.text.trim()) {
      textChunks.push(part.text.trim());
    } else if (
      type === "reasoning" &&
      typeof part.text === "string" &&
      part.text.trim()
    ) {
      reasoningChunks.push(part.text.trim());
    } else if (type.startsWith("tool-") || type === "dynamic-tool") {
      const explicitName =
        typeof part.toolName === "string"
          ? part.toolName
          : type.startsWith("tool-")
            ? type.slice(5)
            : "tool";
      toolNames.push(explicitName);
      if (explicitName === "task") {
        subagentCount += 1;
      }
    }
  }

  const meta = extractMessageMetadata(partsCol, metadataCol);
  const usage =
    (meta?.totalMessageUsage as Record<string, unknown> | undefined) ??
    (meta?.lastStepUsage as Record<string, unknown> | undefined);
  const inputTokens =
    typeof usage?.inputTokens === "number" && Number.isFinite(usage.inputTokens)
      ? usage.inputTokens
      : 0;
  const details = usage?.inputTokenDetails as
    | Record<string, unknown>
    | undefined;
  const cachedInputTokens =
    typeof details?.cacheReadTokens === "number" &&
    Number.isFinite(details.cacheReadTokens)
      ? details.cacheReadTokens
      : typeof usage?.cachedInputTokens === "number" &&
          Number.isFinite(usage.cachedInputTokens)
        ? usage.cachedInputTokens
        : 0;
  const outputTokens =
    typeof usage?.outputTokens === "number" &&
    Number.isFinite(usage.outputTokens)
      ? usage.outputTokens
      : 0;
  const costUsd =
    typeof meta?.totalMessageCost === "number" &&
    Number.isFinite(meta.totalMessageCost)
      ? meta.totalMessageCost
      : 0;
  const modelId = typeof meta?.model === "string" ? meta.model : null;

  return {
    text: textChunks.join("\n\n"),
    reasoning: reasoningChunks.join("\n\n"),
    toolNames,
    subagentCount,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    costUsd,
    modelId,
  };
}

export async function getAdminUserDeepTelemetry(
  userId: string,
): Promise<AdminUserDeepTelemetry | null> {
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRow) return null;

  const now = Date.now();
  const cutoff5hMs = now - 5 * 60 * 60 * 1000;
  const cutoff7dMs = now - 7 * 24 * 60 * 60 * 1000;
  const cutoff24hMs = now - 24 * 60 * 60 * 1000;
  const cutoff30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    authSessionRows,
    accountRows,
    installationRows,
    prefRows,
    userSessions,
    usageRows,
    compactionRows,
    ledgerRows,
    runRows,
  ] = await Promise.all([
    db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, userId))
      .orderBy(desc(authSessions.updatedAt))
      .limit(25)
      .catch(() => []),
    db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(desc(accounts.updatedAt))
      .catch(() => []),
    db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.userId, userId))
      .orderBy(desc(githubInstallations.updatedAt))
      .catch(() => []),
    db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1)
      .catch(() => []),
    db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.updatedAt))
      .limit(100)
      .catch(() => []),
    db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.userId, userId))
      .catch(() => []),
    db
      .select()
      .from(compactionEvents)
      .where(eq(compactionEvents.userId, userId))
      .catch(() => []),
    db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(100)
      .catch(() => []),
    db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.userId, userId))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(150)
      .catch(() => []),
  ]);

  const sessionIds = userSessions.map((s) => s.id);
  const userChatRows =
    sessionIds.length > 0
      ? await db
          .select()
          .from(chats)
          .where(inArray(chats.sessionId, sessionIds))
          .orderBy(desc(chats.updatedAt))
          .limit(80)
          .catch(() => [])
      : [];

  const chatIds = userChatRows.map((c) => c.id);
  const messageRows =
    chatIds.length > 0
      ? await db
          .select({
            id: chatMessages.id,
            chatId: chatMessages.chatId,
            role: chatMessages.role,
            parts: chatMessages.parts,
            metadata: chatMessages.metadata,
            createdAt: chatMessages.createdAt,
          })
          .from(chatMessages)
          .where(inArray(chatMessages.chatId, chatIds))
          .orderBy(chatMessages.createdAt)
          .catch(() => [])
      : [];

  // Compute 5h / 7d / 30d credit debits
  const recentDebits = await db
    .select({
      amountCents: creditTransactions.amountCents,
      createdAt: creditTransactions.createdAt,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, userId),
        eq(creditTransactions.type, "usage_debit"),
        gte(creditTransactions.createdAt, cutoff30d),
      ),
    )
    .catch(() => []);

  let spend5hCents = 0;
  let spend7dCents = 0;
  let spend30dCents = 0;
  for (const debit of recentDebits) {
    const cents = Math.abs(Number(debit.amountCents) || 0);
    const ts = new Date(debit.createdAt).getTime();
    spend30dCents += cents;
    if (ts >= cutoff7dMs) spend7dCents += cents;
    if (ts >= cutoff5hMs) spend5hCents += cents;
  }

  let totalInputTokens = 0;
  let totalCachedInputTokens = 0;
  let totalOutputTokens = 0;
  let totalToolCalls = 0;
  let mainAgentTurns = 0;
  let subagentTurns = 0;
  let webTurns = 0;
  let desktopTurns = 0;

  for (const u of usageRows) {
    totalInputTokens += u.inputTokens;
    totalCachedInputTokens += u.cachedInputTokens;
    totalOutputTokens += u.outputTokens;
    totalToolCalls += u.toolCallCount;
    if (u.agentType === "subagent") subagentTurns += 1;
    else mainAgentTurns += 1;
    if (u.source === "desktop") desktopTurns += 1;
    else webTurns += 1;
  }

  const cacheHitRatePercent =
    totalInputTokens > 0
      ? Math.min(
          100,
          Math.round((totalCachedInputTokens / totalInputTokens) * 1000) / 10,
        )
      : 0;

  let compactionTokensSaved = 0;
  for (const c of compactionRows) {
    compactionTokensSaved += Math.max(
      0,
      c.preCompactTokens - c.postCompactTokens,
    );
  }

  // Group messages and runs by chatId
  const messagesByChat = new Map<string, typeof messageRows>();
  let dailyMessages24h = 0;
  let totalUserMessagesCount = 0;
  let totalAssistantMessagesCount = 0;

  for (const m of messageRows) {
    const list = messagesByChat.get(m.chatId) ?? [];
    list.push(m);
    messagesByChat.set(m.chatId, list);
    if (m.role === "user") {
      totalUserMessagesCount += 1;
      if (new Date(m.createdAt).getTime() >= cutoff24hMs) {
        dailyMessages24h += 1;
      }
    } else {
      totalAssistantMessagesCount += 1;
    }
  }

  const runsByChat = new Map<string, AdminUserWorkflowRunRow[]>();
  let completedRuns = 0;
  let abortedRuns = 0;
  let failedRuns = 0;

  for (const r of runRows) {
    if (r.status === "completed") completedRuns += 1;
    else if (r.status === "aborted") abortedRuns += 1;
    else if (r.status === "failed") failedRuns += 1;

    const list = runsByChat.get(r.chatId) ?? [];
    list.push({
      id: r.id,
      chatId: r.chatId,
      sessionId: r.sessionId,
      modelId: r.modelId,
      status: r.status,
      startedAt: toIsoOrNull(r.startedAt) ?? new Date().toISOString(),
      finishedAt: toIsoOrNull(r.finishedAt) ?? new Date().toISOString(),
      totalDurationMs: r.totalDurationMs,
      errorMessage: r.errorMessage,
    });
    runsByChat.set(r.chatId, list);
  }

  const sessionMap = new Map(userSessions.map((s) => [s.id, s]));

  const chatsTelemetry: AdminUserChatTelemetryRow[] = userChatRows.map((c) => {
    const s = sessionMap.get(c.sessionId);
    const chatMsgs = messagesByChat.get(c.id) ?? [];
    let userMsgCount = 0;
    let assistantMsgCount = 0;
    let chatInputTokens = 0;
    let chatCachedTokens = 0;
    let chatOutputTokens = 0;
    let chatCostUsd = 0;
    let chatToolCalls = 0;
    let chatSubagents = 0;
    const toolBreakdown: Record<string, number> = {};
    let lastUserPromptPreview: string | null = null;
    let lastAssistantPreview: string | null = null;

    for (const msg of chatMsgs) {
      const parsed = parseMessageStats(msg.parts, msg.metadata);
      if (msg.role === "user") {
        userMsgCount += 1;
        if (parsed.text) {
          lastUserPromptPreview = parsed.text.slice(0, 220);
        }
      } else {
        assistantMsgCount += 1;
        if (parsed.text) {
          lastAssistantPreview = parsed.text.slice(0, 220);
        }
        chatInputTokens += parsed.inputTokens;
        chatCachedTokens += parsed.cachedInputTokens;
        chatOutputTokens += parsed.outputTokens;
        chatCostUsd += parsed.costUsd;
        chatToolCalls += parsed.toolNames.length;
        chatSubagents += parsed.subagentCount;
        for (const tn of parsed.toolNames) {
          toolBreakdown[tn] = (toolBreakdown[tn] ?? 0) + 1;
        }
      }
    }

    const chatCacheHitPercent =
      chatInputTokens > 0
        ? Math.min(
            100,
            Math.round((chatCachedTokens / chatInputTokens) * 1000) / 10,
          )
        : 0;

    const sbState = s?.sandboxState as
      | { type?: string; sandboxId?: string }
      | null
      | undefined;

    return {
      chatId: c.id,
      chatTitle: c.title,
      chatStatus: c.status,
      modelId: c.modelId,
      reasoningEffort: c.reasoningEffort,
      activeStreamId: c.activeStreamId,
      createdAt: toIsoOrNull(c.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoOrNull(c.updatedAt) ?? new Date().toISOString(),
      lastAssistantMessageAt: toIsoOrNull(c.lastAssistantMessageAt),
      sessionId: c.sessionId,
      sessionTitle: s?.title ?? "Untitled session",
      sessionStatus: s?.status ?? "completed",
      lifecycleState: s?.lifecycleState ?? null,
      lifecycleError: s?.lifecycleError ?? null,
      sandboxProvider: sbState?.type ?? null,
      sandboxId: sbState?.sandboxId ?? null,
      activeSandboxCommand: s?.activeSandboxCommand?.command ?? null,
      repoOwner: s?.repoOwner ?? null,
      repoName: s?.repoName ?? null,
      branch: s?.branch ?? null,
      prNumber: s?.prNumber ?? null,
      prStatus: s?.prStatus ?? null,
      linesAdded: s?.linesAdded ?? 0,
      linesRemoved: s?.linesRemoved ?? 0,
      userMessageCount: userMsgCount,
      assistantMessageCount: assistantMsgCount,
      totalMessageCount: chatMsgs.length,
      inputTokens: chatInputTokens,
      cachedInputTokens: chatCachedTokens,
      outputTokens: chatOutputTokens,
      cacheHitPercent: chatCacheHitPercent,
      totalCostUsd: chatCostUsd,
      toolCallCount: chatToolCalls,
      toolBreakdown,
      subagentCount: chatSubagents,
      lastUserPromptPreview,
      lastAssistantPreview,
      workflowRuns: runsByChat.get(c.id) ?? [],
    };
  });

  const planDef = getPlanDefinition(userRow.plan);
  const anchorIso = toIsoOrNull(userRow.billingCycleAnchor);
  const nextRenewalAt = anchorIso
    ? toIsoOrNull(addOneCalendarMonth(anchorIso))
    : null;
  const sandboxVcpus = resolveSandboxVcpusForPlan({
    planId: planDef.id,
    isAdmin: userRow.isAdmin,
    providerType: "boxd",
  });
  const activeSessionsCount = userSessions.filter(
    (s) => s.status === "running",
  ).length;

  const pref = prefRows[0] ?? null;

  return {
    billingAndUsage: {
      emailVerified: userRow.emailVerified,
      updatedAt: toIsoOrNull(userRow.updatedAt) ?? new Date().toISOString(),
      planId: planDef.id,
      planName: planDef.name,
      priceUsdCents: planDef.priceUsdCents,
      creditBalanceCents: userRow.creditBalanceCents,
      planGrantBalanceCents: userRow.planGrantBalanceCents,
      billingAccruedMicros: userRow.billingAccruedMicros,
      billingCustomerCode: userRow.billingCustomerCode ?? null,
      billingSubscriptionCode: userRow.billingSubscriptionCode ?? null,
      billingCycleAnchor: anchorIso,
      nextRenewalAt,
      activeBillingRunId: userRow.activeBillingRunId ?? null,
      activeBillingRunClaimedAt: toIsoOrNull(userRow.activeBillingRunClaimedAt),
      dailyMessages24h,
      spend5hCents,
      spend7dCents,
      spend30dCents,
      totalInputTokens,
      totalCachedInputTokens,
      totalOutputTokens,
      cacheHitRatePercent,
      totalToolCalls,
      mainAgentTurns,
      subagentTurns,
      webTurns,
      desktopTurns,
      compactionCount: compactionRows.length,
      compactionTokensSaved,
      sandboxVcpus,
      activeSessionsCount,
      totalSessionsCount: userSessions.length,
      totalChatsCount: userChatRows.length,
      totalMessagesCount: messageRows.length,
      totalUserMessagesCount,
      totalAssistantMessagesCount,
      totalWorkflowRuns: runRows.length,
      completedRuns,
      abortedRuns,
      failedRuns,
    },
    authSessions: authSessionRows.map((s) => {
      const expiresIso = toIsoOrNull(s.expiresAt) ?? new Date(0).toISOString();
      return {
        id: s.id,
        ipAddress: s.ipAddress ?? null,
        userAgent: s.userAgent ?? null,
        deviceSummary: summarizeUserAgent(s.userAgent),
        createdAt: toIsoOrNull(s.createdAt) ?? new Date().toISOString(),
        updatedAt: toIsoOrNull(s.updatedAt) ?? new Date().toISOString(),
        expiresAt: expiresIso,
        isActive: new Date(expiresIso).getTime() > now,
      };
    }),
    connectedAccounts: accountRows.map((a) => ({
      id: a.id,
      providerId: a.providerId,
      accountId: a.accountId,
      scope: a.scope ?? null,
      hasRefreshToken: Boolean(a.refreshToken),
      accessTokenExpiresAt: toIsoOrNull(a.accessTokenExpiresAt),
      createdAt: toIsoOrNull(a.createdAt) ?? new Date().toISOString(),
      updatedAt: toIsoOrNull(a.updatedAt) ?? new Date().toISOString(),
    })),
    githubInstallations: installationRows.map((inst) => ({
      id: inst.id,
      installationId: inst.installationId,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType,
      repositorySelection: inst.repositorySelection,
      createdAt: toIsoOrNull(inst.createdAt) ?? new Date().toISOString(),
    })),
    preferences: pref
      ? {
          defaultModelId: pref.defaultModelId ?? null,
          defaultSubagentModelId: pref.defaultSubagentModelId ?? null,
          defaultSandboxType: pref.defaultSandboxType ?? "boxd",
          defaultPermissionMode: pref.defaultPermissionMode,
          autoCommitPush: pref.autoCommitPush,
          autoCreatePr: pref.autoCreatePr,
          guidedFrontendWorkflowEnabled: pref.guidedFrontendWorkflowEnabled,
          publicUsageEnabled: pref.publicUsageEnabled,
          alertsEnabled: pref.alertsEnabled,
        }
      : null,
    chats: chatsTelemetry,
    creditLedger: ledgerRows.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountCents: tx.amountCents,
      balanceAfterCents: tx.balanceAfterCents,
      description: tx.description ?? null,
      modelId: tx.modelId ?? null,
      billingReference: tx.billingReference ?? null,
      createdAt: toIsoOrNull(tx.createdAt) ?? new Date().toISOString(),
    })),
  };
}

export async function getAdminChatTranscriptMessages(
  chatId: string,
): Promise<AdminChatTranscriptMessageRow[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatId, chatId))
    .orderBy(chatMessages.createdAt)
    .catch(() => []);

  return rows.map((row) => {
    const stats = parseMessageStats(row.parts, row.metadata);
    const parts = extractMessagePartsList(row.parts);
    const toolCalls: AdminChatTranscriptMessageRow["toolCalls"] = [];

    for (const part of parts) {
      const type = typeof part.type === "string" ? part.type : "";
      if (type.startsWith("tool-") || type === "dynamic-tool") {
        const toolName =
          typeof part.toolName === "string"
            ? part.toolName
            : type.startsWith("tool-")
              ? type.slice(5)
              : "tool";
        const toolCallId =
          typeof part.toolCallId === "string" ? part.toolCallId : row.id;
        const state =
          typeof part.state === "string" ? part.state : "output-available";
        const rawInput = part.input ?? part.args;
        const rawOutput = part.output ?? part.result;
        const inputPreview =
          rawInput !== undefined
            ? typeof rawInput === "string"
              ? rawInput.slice(0, 300)
              : JSON.stringify(rawInput).slice(0, 300)
            : "";
        const outputPreview =
          rawOutput !== undefined
            ? typeof rawOutput === "string"
              ? rawOutput.slice(0, 300)
              : JSON.stringify(rawOutput).slice(0, 300)
            : "";

        toolCalls.push({
          toolCallId,
          toolName,
          state,
          inputPreview,
          outputPreview,
        });
      }
    }

    return {
      id: row.id,
      role: row.role,
      createdAt: toIsoOrNull(row.createdAt) ?? new Date().toISOString(),
      textPreview: stats.text,
      reasoningPreview: stats.reasoning || null,
      toolCalls,
      inputTokens: stats.inputTokens,
      cachedInputTokens: stats.cachedInputTokens,
      outputTokens: stats.outputTokens,
      costUsd: stats.costUsd > 0 ? stats.costUsd : null,
      modelId: stats.modelId,
    };
  });
}
