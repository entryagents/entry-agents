import { describe, expect, mock, test } from "bun:test";

const requireAuthenticatedUser = mock(async () => ({
  ok: true as const,
  userId: "user-1",
}));

const requireOwnedSessionChat = mock(async () => ({
  ok: true as const,
  sessionRecord: { id: "sess-1" },
  chat: {
    id: "chat-1",
    modelId: "anthropic/claude-sonnet-4.5",
    reasoningEffort: null,
    activeStreamId: null as string | null,
    status: "idle" as string,
  },
}));

const getChatMessages = mock(async () => [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Fix the auth bug" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [{ type: "text", text: "Done!" }],
  },
]);

const runManualCompaction = mock(async () => ({
  compacted: true as const,
  preTokens: 80_000,
  postTokens: 16_000,
  summaryText: "## Goal\nFix the auth bug",
  noticeMessage: {
    id: "compact_1",
    role: "assistant" as const,
    parts: [
      {
        type: "text" as const,
        text: "Conversation compacted (80K → 16K tokens)",
      },
    ],
    metadata: { isCompactionNotice: true },
  },
}));

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser,
  requireOwnedSessionChat,
}));

mock.module("@/lib/db/sessions", () => ({
  ACTIVE_CHAT_RUN_STATUSES: ["queued", "running", "sleeping", "resuming"],
  compareAndSetChatActiveStreamId: mock(async () => false),
  getChatMessages,
  setChatRunStatus: mock(async () => {}),
}));

mock.module("@/lib/workflow-run-recovery", () => ({
  verifyRunStateWithStatus: mock(async () => ({ outcome: "active" })),
}));

mock.module("@/lib/compact/server", () => ({
  runManualCompaction,
}));

const { POST } = await import("./route");

describe("POST /api/sessions/[sessionId]/chats/[chatId]/compact", () => {
  test("returns 409 when the chat has an active stream", async () => {
    requireOwnedSessionChat.mockResolvedValueOnce({
      ok: true as const,
      sessionRecord: { id: "sess-1" },
      chat: {
        id: "chat-1",
        modelId: "anthropic/claude-sonnet-4.5",
        reasoningEffort: null,
        activeStreamId: "stream-live",
        status: "running",
      },
    });

    const req = new Request(
      "http://localhost/api/sessions/sess-1/chats/chat-1/compact",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ sessionId: "sess-1", chatId: "chat-1" }),
    });
    expect(res.status).toBe(409);
  });

  test("forwards focus instructions to runManualCompaction and returns compacted notice", async () => {
    const req = new Request(
      "http://localhost/api/sessions/sess-1/chats/chat-1/compact",
      {
        method: "POST",
        body: JSON.stringify({ focus: "keep database schema" }),
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ sessionId: "sess-1", chatId: "chat-1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      compacted: boolean;
      postTokens: number;
    };
    expect(json.compacted).toBe(true);
    expect(json.postTokens).toBe(16_000);
    expect(runManualCompaction).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        sessionId: "sess-1",
        focusInstructions: "keep database schema",
      }),
    );
  });
});
