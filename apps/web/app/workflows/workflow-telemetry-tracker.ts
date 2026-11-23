/**
 * Pure in-memory tracker for a single Vercel Workflow run.
 * Zero extra `"use step"` calls — records step invocations by name, LLM step
 * count, retry recoveries, and estimated serialized payload bytes, then
 * produces a compact summary snapshot to persist at turn completion.
 */

const EVENTS_PER_STEP = 3; // step_created + step_started + step_completed
const RUN_LIFECYCLE_EVENTS = 3; // run_created + run_started + run_completed

export type WorkflowStopCause =
  | "stop"
  | "completed"
  | "segment_handoff"
  | "approval_waiting"
  | "loop_guard"
  | "zero_progress"
  | "identical_tool_loop"
  | "credit_exhausted"
  | "window_exhausted"
  | "spend_capped"
  | "max_steps"
  | "aborted"
  | "timed_out"
  | "error";

export function resolveWorkflowStopCause(params: {
  explicitCause?: WorkflowStopCause | null;
  wasAborted?: boolean;
  wasTimedOut?: boolean;
  creditExhausted?: boolean;
  windowExhausted?: boolean;
  turnSpendCapped?: boolean;
  exhaustedMaxSteps?: boolean;
  hasPendingApproval?: boolean;
  finalFinishReason?: string | null;
}): WorkflowStopCause {
  if (params.explicitCause) return params.explicitCause;
  if (params.wasAborted) return "aborted";
  if (params.wasTimedOut) return "timed_out";
  if (params.creditExhausted) return "credit_exhausted";
  if (params.windowExhausted) return "window_exhausted";
  if (params.turnSpendCapped) return "spend_capped";
  if (params.hasPendingApproval) return "approval_waiting";
  if (params.exhaustedMaxSteps) return "max_steps";
  if (params.finalFinishReason === "stop") return "stop";
  return "completed";
}

export interface WorkflowTelemetrySnapshot {
  workflowRunId: string;
  chatId: string;
  sessionId: string;
  userId: string;
  modelId: string | null;
  segmentIndex: number;
  llmSteps: number;
  totalStepCalls: number;
  estimatedEvents: number;
  retryRecoveries: number;
  totalSerializedBytes: number;
  maxStepInputBytes: number;
  durationMs: number;
  finishReason: WorkflowStopCause | string;
  stepCountsJson: Record<string, number>;
}

export class WorkflowTelemetryTracker {
  private readonly stepCounts: Record<string, number> = {};
  private llmSteps = 0;
  private totalStepCalls = 0;
  private retryRecoveries = 0;
  private totalSerializedBytes = 0;
  private maxStepInputBytes = 0;

  constructor(
    private readonly meta: {
      workflowRunId: string;
      chatId: string;
      sessionId: string;
      userId: string;
      segmentIndex: number;
      startedAtMs: number;
    },
  ) {}

  recordStep(
    stepName: string,
    opts?: {
      isLlmStep?: boolean;
      inputBytes?: number;
      outputBytes?: number;
    },
  ): void {
    this.stepCounts[stepName] = (this.stepCounts[stepName] ?? 0) + 1;
    this.totalStepCalls += 1;
    if (opts?.isLlmStep) {
      this.llmSteps += 1;
    }
    const inBytes = opts?.inputBytes ?? 0;
    const outBytes = opts?.outputBytes ?? 0;
    this.totalSerializedBytes += inBytes + outBytes;
    if (inBytes > this.maxStepInputBytes) {
      this.maxStepInputBytes = inBytes;
    }
  }

  recordRetryRecovery(): void {
    this.retryRecoveries += 1;
  }

  snapshot(params: {
    modelId?: string | null;
    finishReason: string;
    nowMs?: number;
  }): WorkflowTelemetrySnapshot {
    const now = params.nowMs ?? Date.now();
    return {
      workflowRunId: this.meta.workflowRunId,
      chatId: this.meta.chatId,
      sessionId: this.meta.sessionId,
      userId: this.meta.userId,
      modelId: params.modelId ?? null,
      segmentIndex: this.meta.segmentIndex,
      llmSteps: this.llmSteps,
      totalStepCalls: this.totalStepCalls,
      estimatedEvents:
        RUN_LIFECYCLE_EVENTS + this.totalStepCalls * EVENTS_PER_STEP,
      retryRecoveries: this.retryRecoveries,
      totalSerializedBytes: this.totalSerializedBytes,
      maxStepInputBytes: this.maxStepInputBytes,
      durationMs: Math.max(0, now - this.meta.startedAtMs),
      finishReason: params.finishReason,
      stepCountsJson: { ...this.stepCounts },
    };
  }
}
