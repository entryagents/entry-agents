import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDbSessions from "@/lib/db/sessions";

type QueuedItem = {
  id: string;
  text: string;
  payload: { text: string };
  createdAt: string;
};

let queuedPrompts: QueuedItem[] | null = null;
let chatRow: {
  id: string;
  status: string;
  activeStreamId: string | null;
} | null = null;
let claimResult = true;
let startShouldThrow: Error | null = null;

const spies = {
  claimChatActiveStreamId: mock((_chatId?: unknown, _runId?: unknown) =>
    Promise.resolve(claimResult),
  ),
  setChatRunStatus: mock(
    (_chatId?: unknown, _status?: unknown, _opts?: unknown) =>
      Promise.resolve(),
  ),
  startWorkflow: mock(async () => {
    if (startShouldThrow) {
      throw startShouldThrow;
    }
    return { runId: "wrun_next_1" };
  }),
  cancelRun: mock(() => Promise.resolve()),
};

mock.module("server-only", () => ({}));

mock.module("@/lib/db/client", () => ({
  db: {
    transaction: async (
      runTx: (tx: {
        select: () => {
          from: () => {
            where: () => {
              limit: () => {
                for: () => Promise<
                  Array<{ queuedPrompts: QueuedItem[] | null }>
                >;
              };
            };
          };
        };
        update: () => {
          set: (patch: { queuedPrompts: QueuedItem[] | null }) => {
            where: () => Promise<void>;
          };
        };
      }) => Promise<unknown>,
    ) =>
      runTx({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: async () => [{ queuedPrompts }],
              }),
            }),
          }),
        }),
        update: () => ({
          set: (patch: { queuedPrompts: QueuedItem[] | null }) => ({
            where: async () => {
              queuedPrompts = patch.queuedPrompts;
            },
          }),
        }),
      }),
  },
}));

mock.module("@/lib/db/sessions", () => ({
  ...realDbSessions,
  getChatById: async () => chatRow,
  getChatMessages: async () => [],
  createChatMessageIfNotExists: async () => ({ id: "q-1" }),
  isFirstChatMessage: async () => false,
  touchChat: async () => {},
  updateChat: async () => {},
  claimChatActiveStreamId: spies.claimChatActiveStreamId,
  setChatRunStatus: spies.setChatRunStatus,
}));

mock.module("@/lib/billing/credit-ledger", () => ({
  releaseUserBillingTurn: mock(() => Promise.resolve()),
}));

mock.module("workflow/api", () => ({
  start: spies.startWorkflow,
  getRun: () => ({ cancel: spies.cancelRun }),
}));

mock.module("./chat", () => ({
  runAgentWorkflow: async () => {},
}));

const { startNextQueuedWorkflowInternal, startNextQueuedWorkflowStep } =
  await import("./chat-post-finish");

function makeQueuedItem(id: string): QueuedItem {
  return {
    id,
    text: `Prompt ${id}`,
    payload: { text: `Prompt ${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const baseParams = {
  chatId: "chat-1",
  sessionId: "session-1",
  userId: "user-1",
  requestUrl: "http://localhost/api/chat",
  authSession: null,
};

beforeEach(() => {
  queuedPrompts = [makeQueuedItem("q-1"), makeQueuedItem("q-2")];
  chatRow = { id: "chat-1", status: "completed", activeStreamId: null };
  claimResult = true;
  startShouldThrow = null;
  for (const spy of Object.values(spies)) {
    spy.mockClear();
  }
});

describe("startNextQueuedWorkflowInternal / startNextQueuedWorkflowStep", () => {
  test("restores dequeued prompt to the front of the queue when claimChatActiveStreamId returns false", async () => {
    claimResult = false;

    const result = await startNextQueuedWorkflowInternal(baseParams);

    expect(result).toEqual({ started: false });
    expect(spies.cancelRun).toHaveBeenCalledTimes(1);
    expect((queuedPrompts ?? []).map((item) => item.id)).toEqual([
      "q-1",
      "q-2",
    ]);
  });

  test("rethrows transient start() errors in startNextQueuedWorkflowStep after restoring prompt without duplicating", async () => {
    startShouldThrow = new Error("Workflow API 503");

    await expect(startNextQueuedWorkflowStep(baseParams)).rejects.toThrow(
      "Workflow API 503",
    );

    expect((queuedPrompts ?? []).map((item) => item.id)).toEqual([
      "q-1",
      "q-2",
    ]);
    expect(spies.setChatRunStatus).toHaveBeenLastCalledWith(
      "chat-1",
      "completed",
      { onlyIfActiveStreamId: null },
    );
  });

  test("does not throw on start() error when called with default best-effort options", async () => {
    startShouldThrow = new Error("Transient failure");

    const result = await startNextQueuedWorkflowInternal(baseParams);

    expect(result).toEqual({ started: false });
    expect((queuedPrompts ?? []).map((item) => item.id)).toEqual([
      "q-1",
      "q-2",
    ]);
  });

  test("skips cancelled chats by default, but allows starting when allowFromCancelled is true", async () => {
    chatRow = { id: "chat-1", status: "cancelled", activeStreamId: null };

    const skipped = await startNextQueuedWorkflowInternal(baseParams);
    expect(skipped).toEqual({ started: false });
    expect(spies.startWorkflow).not.toHaveBeenCalled();

    const started = await startNextQueuedWorkflowInternal({
      ...baseParams,
      allowFromCancelled: true,
    });
    expect(started).toEqual({ started: true, runId: "wrun_next_1" });
    expect(spies.startWorkflow).toHaveBeenCalledTimes(1);
    expect((queuedPrompts ?? []).map((item) => item.id)).toEqual(["q-2"]);
  });

  test("cancels started run and restores prompt if claimChatActiveStreamId throws", async () => {
    spies.claimChatActiveStreamId.mockImplementationOnce(() =>
      Promise.reject(new Error("DB connection reset during claim")),
    );

    await expect(startNextQueuedWorkflowStep(baseParams)).rejects.toThrow(
      "DB connection reset during claim",
    );

    expect(spies.cancelRun).toHaveBeenCalledTimes(1);
    expect((queuedPrompts ?? []).map((item) => item.id)).toEqual([
      "q-1",
      "q-2",
    ]);
  });
});
