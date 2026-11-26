import { and, asc, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "./client";
import {
  chatMessages,
  compactionEvents,
  workflowRuns,
  workflowRunSteps,
  workflowRunTelemetry,
  type NewWorkflowRunTelemetryRow,
} from "./schema";

export interface WorkflowRunListItem {
  workflowRunId: string;
  chatId: string;
  sessionId: string;
  userId: string;
  modelId: string | null;
  llmSteps: number;
  totalStepCalls: number;
  estimatedEvents: number;
  retryRecoveries: number;
  totalSerializedBytes: number;
  durationMs: number;
  finishReason: string;
  stepCounts: Record<string, number>;
  createdAt: string;
}

export interface WorkflowTelemetrySummary {
  totalRuns: number;
  totalStepCalls: number;
  totalLlmSteps: number;
  totalEstimatedEvents: number;
  totalRetryRecoveries: number;
  totalSerializedBytes: number;
  avgEventsPerRun: number;
  stepBreakdown: Array<{
    stepName: string;
    calls: number;
    estimatedEvents: number;
  }>;
  topRuns: WorkflowRunListItem[];
  pagination?: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface WorkflowRunLifecycleDetail {
  workflowRunId: string;
  telemetry: WorkflowRunListItem | null;
  run: {
    id: string;
    chatId: string;
    sessionId: string;
    userId: string;
    modelId: string | null;
    status: string;
    startedAt: string;
    finishedAt: string;
    totalDurationMs: number;
    errorMessage: string | null;
    createdAt: string;
  } | null;
  steps: Array<{
    id: string;
    stepNumber: number;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    finishReason: string | null;
    rawFinishReason: string | null;
  }>;
  compactions: Array<{
    id: string;
    tokensBefore: number | null;
    tokensAfter: number | null;
    createdAt: string;
  }>;
  latestMessageBreakdown: Array<{
    stepNumber: number;
    modelId?: string;
    finishReason?: string;
    cost?: number;
    tps?: number;
    toolCallNames?: string[];
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
  }>;
}

export async function recordWorkflowRunTelemetry(
  entry: Omit<NewWorkflowRunTelemetryRow, "id" | "createdAt">,
): Promise<void> {
  await db.insert(workflowRunTelemetry).values({
    id: crypto.randomUUID(),
    ...entry,
  });
}

export async function getWorkflowTelemetrySummary(
  since: Date | null,
  options?: {
    page?: number;
    pageSize?: number;
    search?: string;
    finishReason?: string;
  },
): Promise<WorkflowTelemetrySummary> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options?.pageSize ?? 25));
  const search = options?.search?.trim() || "";
  const finishReason = options?.finishReason?.trim() || "";

  const conditions = [];
  if (since) {
    conditions.push(gte(workflowRunTelemetry.createdAt, since));
  }
  if (finishReason && finishReason !== "all") {
    conditions.push(eq(workflowRunTelemetry.finishReason, finishReason));
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(workflowRunTelemetry.workflowRunId, pattern),
        ilike(workflowRunTelemetry.chatId, pattern),
        ilike(workflowRunTelemetry.modelId, pattern),
        ilike(workflowRunTelemetry.finishReason, pattern),
      ),
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [aggRows, pagedRows] = await Promise.all([
    db
      .select({
        totalRuns: count(),
        totalStepCalls: sql<number>`coalesce(sum(${workflowRunTelemetry.totalStepCalls}), 0)::int`,
        totalLlmSteps: sql<number>`coalesce(sum(${workflowRunTelemetry.llmSteps}), 0)::int`,
        totalEstimatedEvents: sql<number>`coalesce(sum(${workflowRunTelemetry.estimatedEvents}), 0)::int`,
        totalRetryRecoveries: sql<number>`coalesce(sum(${workflowRunTelemetry.retryRecoveries}), 0)::int`,
        totalSerializedBytes: sql<number>`coalesce(sum(${workflowRunTelemetry.totalSerializedBytes}), 0)::bigint`,
      })
      .from(workflowRunTelemetry)
      .where(whereClause),
    db
      .select()
      .from(workflowRunTelemetry)
      .where(whereClause)
      .orderBy(desc(workflowRunTelemetry.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const agg = aggRows[0];
  const totalCount = Number(agg?.totalRuns ?? 0);
  const totalStepCalls = Number(agg?.totalStepCalls ?? 0);
  const totalLlmSteps = Number(agg?.totalLlmSteps ?? 0);
  const totalEstimatedEvents = Number(agg?.totalEstimatedEvents ?? 0);
  const totalRetryRecoveries = Number(agg?.totalRetryRecoveries ?? 0);
  const totalSerializedBytes = Number(agg?.totalSerializedBytes ?? 0);

  const stepTotals = new Map<string, number>();
  for (const row of pagedRows) {
    const counts = row.stepCountsJson ?? {};
    for (const [stepName, c] of Object.entries(counts)) {
      stepTotals.set(stepName, (stepTotals.get(stepName) ?? 0) + c);
    }
  }

  const stepBreakdown = Array.from(stepTotals.entries())
    .map(([stepName, calls]) => ({
      stepName,
      calls,
      estimatedEvents: calls * 3,
    }))
    .sort((a, b) => b.calls - a.calls);

  const topRuns: WorkflowRunListItem[] = pagedRows.map((r) => ({
    workflowRunId: r.workflowRunId,
    chatId: r.chatId,
    sessionId: r.sessionId,
    userId: r.userId,
    modelId: r.modelId,
    llmSteps: r.llmSteps,
    totalStepCalls: r.totalStepCalls,
    estimatedEvents: r.estimatedEvents,
    retryRecoveries: r.retryRecoveries,
    totalSerializedBytes: r.totalSerializedBytes,
    durationMs: r.durationMs,
    finishReason: r.finishReason,
    stepCounts: r.stepCountsJson ?? {},
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    totalRuns: totalCount,
    totalStepCalls,
    totalLlmSteps,
    totalEstimatedEvents,
    totalRetryRecoveries,
    totalSerializedBytes,
    avgEventsPerRun:
      totalCount > 0 ? Math.round(totalEstimatedEvents / totalCount) : 0,
    stepBreakdown,
    topRuns,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  };
}

export async function getWorkflowRunLifecycle(
  workflowRunId: string,
): Promise<WorkflowRunLifecycleDetail | null> {
  const [telemetryRows, runRows, stepRows] = await Promise.all([
    db
      .select()
      .from(workflowRunTelemetry)
      .where(eq(workflowRunTelemetry.workflowRunId, workflowRunId))
      .orderBy(desc(workflowRunTelemetry.createdAt))
      .limit(1),
    db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, workflowRunId))
      .limit(1),
    db
      .select()
      .from(workflowRunSteps)
      .where(eq(workflowRunSteps.workflowRunId, workflowRunId))
      .orderBy(asc(workflowRunSteps.stepNumber)),
  ]);

  const t = telemetryRows[0] ?? null;
  const r = runRows[0] ?? null;
  if (!t && !r) {
    return null;
  }

  const chatId = t?.chatId ?? r?.chatId ?? null;

  const [compactionRows, recentMessages] = chatId
    ? await Promise.all([
        db
          .select({
            id: compactionEvents.id,
            tokensBefore: compactionEvents.preCompactTokens,
            tokensAfter: compactionEvents.postCompactTokens,
            createdAt: compactionEvents.createdAt,
          })
          .from(compactionEvents)
          .where(eq(compactionEvents.chatId, chatId))
          .orderBy(desc(compactionEvents.createdAt))
          .limit(20),
        db
          .select({
            metadata: chatMessages.metadata,
          })
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.chatId, chatId),
              eq(chatMessages.role, "assistant"),
            ),
          )
          .orderBy(desc(chatMessages.createdAt))
          .limit(5),
      ])
    : [[], []];

  const latestWithBreakdown = recentMessages.find((m) => {
    const meta = m.metadata as { stepBreakdown?: unknown[] } | null;
    return Array.isArray(meta?.stepBreakdown) && meta.stepBreakdown.length > 0;
  });
  const rawBreakdown =
    (
      latestWithBreakdown?.metadata as {
        stepBreakdown?: Array<{
          stepNumber: number;
          modelId?: string;
          finishReason?: string;
          cost?: number;
          tps?: number;
          toolCallNames?: string[];
          usage?: {
            inputTokens?: number;
            outputTokens?: number;
            cachedInputTokens?: number;
            inputTokenDetails?: { cacheReadTokens?: number };
          };
        }>;
      } | null
    )?.stepBreakdown ?? [];

  return {
    workflowRunId,
    telemetry: t
      ? {
          workflowRunId: t.workflowRunId,
          chatId: t.chatId,
          sessionId: t.sessionId,
          userId: t.userId,
          modelId: t.modelId,
          llmSteps: t.llmSteps,
          totalStepCalls: t.totalStepCalls,
          estimatedEvents: t.estimatedEvents,
          retryRecoveries: t.retryRecoveries,
          totalSerializedBytes: t.totalSerializedBytes,
          durationMs: t.durationMs,
          finishReason: t.finishReason,
          stepCounts: t.stepCountsJson ?? {},
          createdAt: t.createdAt.toISOString(),
        }
      : null,
    run: r
      ? {
          id: r.id,
          chatId: r.chatId,
          sessionId: r.sessionId,
          userId: r.userId,
          modelId: r.modelId,
          status: r.status,
          startedAt: r.startedAt.toISOString(),
          finishedAt: r.finishedAt.toISOString(),
          totalDurationMs: r.totalDurationMs,
          errorMessage: r.errorMessage,
          createdAt: r.createdAt.toISOString(),
        }
      : null,
    steps: stepRows.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      startedAt: s.startedAt.toISOString(),
      finishedAt: s.finishedAt.toISOString(),
      durationMs: s.durationMs,
      finishReason: s.finishReason,
      rawFinishReason: s.rawFinishReason,
    })),
    compactions: compactionRows.map((c) => ({
      id: c.id,
      tokensBefore: c.tokensBefore,
      tokensAfter: c.tokensAfter,
      createdAt: c.createdAt.toISOString(),
    })),
    latestMessageBreakdown: rawBreakdown.map((b) => ({
      stepNumber: b.stepNumber,
      modelId: b.modelId,
      finishReason: b.finishReason,
      cost: b.cost,
      tps: b.tps,
      toolCallNames: b.toolCallNames,
      inputTokens: b.usage?.inputTokens,
      cachedInputTokens:
        b.usage?.inputTokenDetails?.cacheReadTokens ??
        b.usage?.cachedInputTokens,
      outputTokens: b.usage?.outputTokens,
    })),
  };
}
