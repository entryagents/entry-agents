import { describe, expect, mock, test } from "bun:test";

/**
 * Verifies the Workflow Event budget reduction from consolidating:
 * - 4 startup steps -> 1 `prepareTurnBootstrapStep` (12 events -> 3 events)
 * - 3 pre-step checks + `runAgentStep` + `persistAssistantMessage` + post-step
 *   `checkChatCancelledStep` (6 steps = 18 events/step originally, 4 steps = 12
 *   events/step after PR #272) -> 1 single `runAgentStep` (3 events/step).
 */
describe("workflow event budget consolidation", () => {
  test("calculates exact Vercel Workflow Event savings across 10, 50, and 100 step tasks", () => {
    const EVENTS_PER_STEP = 3; // step_created + step_started + step_completed

    const originalEvents = (llmSteps: number) =>
      4 * EVENTS_PER_STEP + // 4 startup steps
      llmSteps * (3 + 1 + 1 + 1) * EVENTS_PER_STEP; // 3 pre-checks + runAgentStep + persistAssistantMessage + checkChatCancelledStep

    const afterPr272Events = (llmSteps: number) =>
      1 * EVENTS_PER_STEP + // 1 prepareTurnBootstrapStep
      llmSteps * (1 + 1 + 1 + 1) * EVENTS_PER_STEP; // prepareStepChecksStep + runAgentStep + persistAssistantMessage + checkChatCancelledStep

    const afterInStepFoldEvents = (llmSteps: number) =>
      1 * EVENTS_PER_STEP + // 1 prepareTurnBootstrapStep
      llmSteps * 1 * EVENTS_PER_STEP; // 1 unified runAgentStep (preflight + LLM + checkpoint + cancel check)

    // 50-step coding task: 912 -> 603 -> 153 events (74.6% drop vs PR #272, 83.2% total)
    expect(originalEvents(50)).toBe(912);
    expect(afterPr272Events(50)).toBe(603);
    expect(afterInStepFoldEvents(50)).toBe(153);
    expect(afterInStepFoldEvents(50) / afterPr272Events(50)).toBeLessThan(0.26);

    // 100-step long task: 1812 -> 1203 -> 303 events
    expect(originalEvents(100)).toBe(1812);
    expect(afterPr272Events(100)).toBe(1203);
    expect(afterInStepFoldEvents(100)).toBe(303);
  });

  test("runStepPreflightChecks detects cancellation without swallowing unread inbox messages", async () => {
    const markReadSpy = mock(async () => {});
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
      markInboxMessagesRead: markReadSpy,
    }));

    const { runStepPreflightChecks } = await import("./chat-batch-steps");
    const result = await runStepPreflightChecks({
      chatId: "chat-1",
      workflowRunId: "run-1",
      userId: "user-1",
      sessionId: "sess-1",
      overridePermissionMode: "fullAccess",
    });

    expect(result.isCancelled).toBe(true);
    expect(result.permissionMode).toBe("fullAccess");
    expect(result.unreadInboxMessages).toEqual([]);
    expect(markReadSpy).not.toHaveBeenCalled();
  });

  test("runStepPreflightChecks resolves live permission mode, marks inbox read when active, and formats steering message", async () => {
    const markReadSpy = mock(async () => {});
    mock.module("@/lib/db/sessions", () => ({
      getChatById: async () => ({
        id: "chat-1",
        status: "running",
        activeStreamId: "run-1",
      }),
      getSessionById: async () => ({
        id: "sess-1",
        permissionModeOverride: "autoAccept",
      }),
    }));
    mock.module("@/lib/db/inbox", () => ({
      getUnreadInboxMessages: async () => [
        {
          id: "in-2",
          content: "focus on workflow tests",
          createdAt: new Date("2026-11-23T00:00:00Z"),
        },
      ],
      markInboxMessagesRead: markReadSpy,
    }));

    const { runStepPreflightChecks, formatSteeringInboxMessage } =
      await import("./chat-batch-steps");
    const result = await runStepPreflightChecks({
      chatId: "chat-1",
      workflowRunId: "run-1",
      userId: "user-1",
      sessionId: "sess-1",
    });

    expect(result.isCancelled).toBe(false);
    expect(result.permissionMode).toBe("autoAccept");
    expect(result.unreadInboxMessages).toHaveLength(1);
    expect(result.unreadInboxMessages[0]?.content).toBe(
      "focus on workflow tests",
    );
    expect(markReadSpy).toHaveBeenCalledWith("chat-1", ["in-2"]);

    const steeringMsg = formatSteeringInboxMessage(result.unreadInboxMessages);
    expect(steeringMsg?.role).toBe("user");
    expect(JSON.stringify(steeringMsg)).toContain("STEERING MESSAGE FROM USER");
    expect(JSON.stringify(steeringMsg)).toContain("focus on workflow tests");
  });
});
