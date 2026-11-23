import { desc, gte } from "drizzle-orm";
import { db } from "./client";
import {
  workflowRunTelemetry,
  type NewWorkflowRunTelemetryRow,
} from "./schema";

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
  topRuns: Array<{
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
    createdAt: string;
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
  since: Date,
): Promise<WorkflowTelemetrySummary> {
  const rows = await db
    .select()
    .from(workflowRunTelemetry)
    .where(gte(workflowRunTelemetry.createdAt, since))
    .orderBy(desc(workflowRunTelemetry.estimatedEvents))
    .limit(500);

  let totalStepCalls = 0;
  let totalLlmSteps = 0;
  let totalEstimatedEvents = 0;
  let totalRetryRecoveries = 0;
  let totalSerializedBytes = 0;
  const stepTotals = new Map<string, number>();

  for (const row of rows) {
    totalStepCalls += row.totalStepCalls;
    totalLlmSteps += row.llmSteps;
    totalEstimatedEvents += row.estimatedEvents;
    totalRetryRecoveries += row.retryRecoveries;
    totalSerializedBytes += row.totalSerializedBytes;

    const counts = row.stepCountsJson ?? {};
    for (const [stepName, count] of Object.entries(counts)) {
      stepTotals.set(stepName, (stepTotals.get(stepName) ?? 0) + count);
    }
  }

  const stepBreakdown = Array.from(stepTotals.entries())
    .map(([stepName, calls]) => ({
      stepName,
      calls,
      estimatedEvents: calls * 3,
    }))
    .sort((a, b) => b.calls - a.calls);

  const topRuns = rows.slice(0, 20).map((r) => ({
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
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    totalRuns: rows.length,
    totalStepCalls,
    totalLlmSteps,
    totalEstimatedEvents,
    totalRetryRecoveries,
    totalSerializedBytes,
    avgEventsPerRun:
      rows.length > 0 ? Math.round(totalEstimatedEvents / rows.length) : 0,
    stepBreakdown,
    topRuns,
  };
}
