import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";

mock.module("server-only", () => ({}));

type ChatRow = {
  id: string;
  status: string;
  activeStreamId: string | null;
};

let chatRow: ChatRow = {
  id: "chat-1",
  status: "running",
  activeStreamId: "wrun_seg_1",
};

const callOrder: string[] = [];
const cancelledRunIds: string[] = [];
let startedPayloads: unknown[] = [];
let simulateSegment2WinsRaceBeforeCas = false;
let simulateHijackBeforeCas = false;

const realDbSessions = await import("@/lib/db/sessions");
const realCreditLedger = await import("@/lib/billing/credit-ledger");

mock.module("@/lib/db/sessions", () => ({
  ...realDbSessions,
  getChatById: mock(async () => ({ ...chatRow })),
  getChatMessages: mock(async () => []),
  upsertChatMessageScoped: mock(async () => ({ status: "updated" })),
  updateChatAssistantActivity: mock(async () => undefined),
  touchChatRunHeartbeat: mock(async () => undefined),
  setChatRunStatus: mock(async (_chatId: string, status: string) => {
    chatRow.status = status;
  }),
  claimChatActiveStreamId: mock(async (_chatId: string, runId: string) => {
    if (chatRow.activeStreamId === null || chatRow.activeStreamId === runId) {
      chatRow.activeStreamId = runId;
      return true;
    }
    return false;
  }),
  compareAndSetChatActiveStreamId: mock(
    async (_chatId: string, expected: string | null, next: string | null) => {
      if (chatRow.activeStreamId === expected) {
        chatRow.activeStreamId = next;
        return true;
      }
      return false;
    },
  ),
}));

mock.module("@/lib/billing/credit-ledger", () => ({
  ...realCreditLedger,
  releaseUserBillingTurn: mock(async (_userId: string, runId: string) => {
    callOrder.push(`releaseUserBillingTurn:${runId}`);
  }),
}));

mock.module("workflow/api", () => ({
  start: mock(async (_fn: unknown, args: unknown[]) => {
    callOrder.push("workflow.start");
    startedPayloads.push(args[0]);
    const nextRunId = "wrun_seg_2";
    if (simulateSegment2WinsRaceBeforeCas) {
      // Simulate segment 2's claimActiveStream running before segment 1's CAS
      chatRow.activeStreamId = nextRunId;
    } else if (simulateHijackBeforeCas) {
      chatRow.activeStreamId = "wrun_other_hijack";
    }
    return { runId: nextRunId };
  }),
  getRun: mock((runId: string) => ({
    cancel: mock(async () => {
      cancelledRunIds.push(runId);
    }),
  })),
}));

const { claimActiveStream, continueAgentWorkflowSegmentStep } =
  await import("./chat-post-finish");

function makePendingAssistant(): WebAgentUIMessage {
  return {
    id: "asst-1",
    role: "assistant",
    parts: [{ type: "text", text: "Working on step 50..." }],
  };
}

describe("Vercel Workflow background segment chaining", () => {
  beforeEach(() => {
    chatRow = {
      id: "chat-1",
      status: "running",
      activeStreamId: "wrun_seg_1",
    };
    callOrder.length = 0;
    cancelledRunIds.length = 0;
    startedPayloads = [];
    simulateSegment2WinsRaceBeforeCas = false;
    simulateHijackBeforeCas = false;
  });

  test("claimActiveStream atomically promotes activeStreamId when segment 2 starts before segment 1 CAS", async () => {
    const result = await claimActiveStream(
      "chat-1",
      "wrun_seg_2",
      undefined,
      "asst-1",
      "wrun_seg_1",
    );

    expect(result).toBe("claimed");
    expect(chatRow.activeStreamId).toBe("wrun_seg_2");
    expect(chatRow.status).toBe("running");
  });

  test("claimActiveStream returns conflict when chat was cancelled before segment 2 claimed", async () => {
    chatRow.status = "cancelled";

    const result = await claimActiveStream(
      "chat-1",
      "wrun_seg_2",
      undefined,
      "asst-1",
      "wrun_seg_1",
    );

    expect(result).toBe("conflict");
    expect(chatRow.activeStreamId).toBe("wrun_seg_1");
  });

  test("claimActiveStream returns conflict when an unrelated run owns activeStreamId", async () => {
    chatRow.activeStreamId = "wrun_unrelated";

    const result = await claimActiveStream(
      "chat-1",
      "wrun_seg_2",
      undefined,
      "asst-1",
      "wrun_seg_1",
    );

    expect(result).toBe("conflict");
    expect(chatRow.activeStreamId).toBe("wrun_unrelated");
  });

  test("continueAgentWorkflowSegmentStep releases billing lease BEFORE starting segment 2 and hands off cleanly", async () => {
    const res = await continueAgentWorkflowSegmentStep({
      chatId: "chat-1",
      sessionId: "sess-1",
      userId: "user-1",
      requestUrl: "https://entry.app/api/chat",
      authSession: null,
      currentWorkflowRunId: "wrun_seg_1",
      assistantId: "asst-1",
      pendingAssistantResponse: makePendingAssistant(),
      turnStartedAt: 1_700_000_000_000,
      nextStepOffset: 50,
      maxSteps: 2000,
    });

    expect(res).toEqual({ continued: true, nextRunId: "wrun_seg_2" });
    expect(chatRow.activeStreamId).toBe("wrun_seg_2");
    expect(cancelledRunIds).toEqual([]);
    // Critical race-prevention invariant: billing lease MUST be released before start()
    expect(callOrder).toEqual([
      "releaseUserBillingTurn:wrun_seg_1",
      "workflow.start",
    ]);
    expect(startedPayloads[0]).toEqual(
      expect.objectContaining({
        messages: [],
        isContinuationSegment: true,
        previousWorkflowRunId: "wrun_seg_1",
        assistantId: "asst-1",
        turnStartedAt: 1_700_000_000_000,
        stepOffset: 50,
        maxSteps: 2000,
      }),
    );
  });

  test("continueAgentWorkflowSegmentStep succeeds without cancelling when segment 2 already promoted activeStreamId", async () => {
    simulateSegment2WinsRaceBeforeCas = true;

    const res = await continueAgentWorkflowSegmentStep({
      chatId: "chat-1",
      sessionId: "sess-1",
      userId: "user-1",
      requestUrl: "https://entry.app/api/chat",
      authSession: null,
      currentWorkflowRunId: "wrun_seg_1",
      assistantId: "asst-1",
      pendingAssistantResponse: makePendingAssistant(),
      turnStartedAt: 1_700_000_000_000,
      nextStepOffset: 50,
    });

    expect(res).toEqual({ continued: true, nextRunId: "wrun_seg_2" });
    expect(cancelledRunIds).toEqual([]);
    expect(chatRow.activeStreamId).toBe("wrun_seg_2");
  });

  test("continueAgentWorkflowSegmentStep aborts handoff when user stopped the chat", async () => {
    chatRow.status = "cancelled";

    const res = await continueAgentWorkflowSegmentStep({
      chatId: "chat-1",
      sessionId: "sess-1",
      userId: "user-1",
      requestUrl: "https://entry.app/api/chat",
      authSession: null,
      currentWorkflowRunId: "wrun_seg_1",
      assistantId: "asst-1",
      pendingAssistantResponse: makePendingAssistant(),
      turnStartedAt: 1_700_000_000_000,
      nextStepOffset: 50,
    });

    expect(res).toEqual({ continued: false });
    expect(startedPayloads).toHaveLength(0);
  });

  test("continueAgentWorkflowSegmentStep cancels segment 2 if an unrelated run took over during handoff", async () => {
    simulateHijackBeforeCas = true;

    const res = await continueAgentWorkflowSegmentStep({
      chatId: "chat-1",
      sessionId: "sess-1",
      userId: "user-1",
      requestUrl: "https://entry.app/api/chat",
      authSession: null,
      currentWorkflowRunId: "wrun_seg_1",
      assistantId: "asst-1",
      pendingAssistantResponse: makePendingAssistant(),
      turnStartedAt: 1_700_000_000_000,
      nextStepOffset: 50,
    });

    expect(res).toEqual({ continued: false });
    expect(cancelledRunIds).toEqual(["wrun_seg_2"]);
    expect(chatRow.activeStreamId).toBe("wrun_other_hijack");
  });
});
