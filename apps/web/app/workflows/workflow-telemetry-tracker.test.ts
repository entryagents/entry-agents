import { describe, expect, test } from "bun:test";
import { WorkflowTelemetryTracker } from "./workflow-telemetry-tracker";

describe("WorkflowTelemetryTracker", () => {
  test("tracks step counts, estimated Workflow Events, retries, and max payload bytes", () => {
    const tracker = new WorkflowTelemetryTracker({
      workflowRunId: "wrun_test_1",
      chatId: "chat_1",
      sessionId: "sess_1",
      userId: "user_1",
      segmentIndex: 0,
      startedAtMs: 1000,
    });

    tracker.recordStep("prepareTurnBootstrapStep", {
      inputBytes: 120,
      outputBytes: 4200,
    });
    tracker.recordStep("prepareStepChecksStep", {
      inputBytes: 140,
      outputBytes: 90,
    });
    tracker.recordStep("runAgentStep", {
      isLlmStep: true,
      inputBytes: 48_000,
      outputBytes: 12_000,
    });
    tracker.recordRetryRecovery();
    tracker.recordStep("runAgentStep", {
      isLlmStep: true,
      inputBytes: 64_000,
      outputBytes: 14_000,
    });

    const snap = tracker.snapshot({
      modelId: "anthropic/claude-sonnet-4",
      finishReason: "stop",
      nowMs: 15_500,
    });

    expect(snap.totalStepCalls).toBe(4);
    expect(snap.llmSteps).toBe(2);
    expect(snap.estimatedEvents).toBe(3 + 4 * 3); // 15
    expect(snap.retryRecoveries).toBe(1);
    expect(snap.maxStepInputBytes).toBe(64_000);
    expect(snap.totalSerializedBytes).toBe(
      120 + 4200 + 140 + 90 + 60_000 + 78_000,
    );
    expect(snap.durationMs).toBe(14_500);
    expect(snap.stepCountsJson).toEqual({
      prepareTurnBootstrapStep: 1,
      prepareStepChecksStep: 1,
      runAgentStep: 2,
    });
  });

  test("resolveWorkflowStopCause replaces generic tool-calls with exact stop cause", async () => {
    const { resolveWorkflowStopCause } =
      await import("./workflow-telemetry-tracker");

    expect(
      resolveWorkflowStopCause({
        explicitCause: "segment_handoff",
        finalFinishReason: "tool-calls",
      }),
    ).toBe("segment_handoff");
    expect(
      resolveWorkflowStopCause({
        explicitCause: "loop_guard",
        finalFinishReason: "tool-calls",
      }),
    ).toBe("loop_guard");
    expect(
      resolveWorkflowStopCause({
        explicitCause: "zero_progress",
        finalFinishReason: "tool-calls",
      }),
    ).toBe("zero_progress");
    expect(
      resolveWorkflowStopCause({
        hasPendingApproval: true,
        finalFinishReason: "tool-calls",
      }),
    ).toBe("approval_waiting");
    expect(
      resolveWorkflowStopCause({
        wasAborted: true,
        finalFinishReason: "tool-calls",
      }),
    ).toBe("aborted");
    expect(
      resolveWorkflowStopCause({
        wasTimedOut: true,
        finalFinishReason: "tool-calls",
      }),
    ).toBe("timed_out");
    expect(
      resolveWorkflowStopCause({
        finalFinishReason: "stop",
      }),
    ).toBe("stop");
  });
});
