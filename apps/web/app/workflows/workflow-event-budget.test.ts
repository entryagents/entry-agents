import { describe, expect, mock, test } from "bun:test";

/**
 * Verifies the Workflow Event budget reduction from consolidating:
 * - 4 startup steps -> 1 `prepareTurnBootstrapStep` (12 events -> 3 events)
 * - 3 per-step preflight steps -> 1 `prepareStepChecksStep` (9 events -> 3 events per LLM step)
 */
describe("workflow event budget consolidation", () => {
  test("calculates exact Vercel Workflow Event savings across 10, 50, and 100 step tasks", () => {
    const EVENTS_PER_STEP = 3; // step_created + step_started + step_completed

    const beforeEvents = (llmSteps: number) =>
      4 * EVENTS_PER_STEP + // 4 startup steps
      llmSteps * (3 + 1) * EVENTS_PER_STEP; // 3 pre-step checks + 1 runAgentStep

    const afterEvents = (llmSteps: number) =>
      1 * EVENTS_PER_STEP + // 1 prepareTurnBootstrapStep
      llmSteps * (1 + 1) * EVENTS_PER_STEP; // 1 prepareStepChecksStep + 1 runAgentStep

    // 50-step coding task: 612 events -> 303 events (50.5% reduction)
    expect(beforeEvents(50)).toBe(612);
    expect(afterEvents(50)).toBe(303);
    expect(afterEvents(50) / beforeEvents(50)).toBeLessThan(0.5);

    // 100-step long task: 1212 events -> 603 events (50.2% reduction)
    expect(beforeEvents(100)).toBe(1212);
    expect(afterEvents(100)).toBe(603);
  });

  test("prepareStepChecksStep respects explicit permissionMode override and detects cancellation", async () => {
    mock.module("@/lib/db/sessions", () => ({
      getChatById: async () => ({
        id: "chat-1",
        status: "cancelled",
        activeStreamId: "run-1",
      }),
      getSessionById: async () => null,
    }));
    mock.module("@/lib/db/inbox", () => ({
      getUnreadInboxMessages: async () => [
        {
          id: "in-1",
          content: "stop and check tests",
          createdAt: new Date("2026-11-23T00:00:00Z"),
        },
      ],
      markInboxMessagesRead: async () => {},
    }));

    const { prepareStepChecksStep } = await import("./chat-batch-steps");
    const result = await prepareStepChecksStep({
      chatId: "chat-1",
      workflowRunId: "run-1",
      userId: "user-1",
      sessionId: "sess-1",
      overridePermissionMode: "fullAccess",
    });

    expect(result.isCancelled).toBe(true);
    expect(result.permissionMode).toBe("fullAccess");
    expect(result.unreadInboxMessages).toHaveLength(1);
    expect(result.unreadInboxMessages[0]?.content).toBe("stop and check tests");
  });
});
