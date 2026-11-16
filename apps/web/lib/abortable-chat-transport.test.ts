import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import {
  AbortableChatTransport,
  STREAM_RECONNECT_MAX_DURATION_MS,
} from "./abortable-chat-transport";

function makeSseResponse(chunks: unknown[], workflowRunId = "run_1"): Response {
  const payload = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "x-workflow-run-id": workflowRunId,
    },
  });
}

async function readAllChunks<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const out: T[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    out.push(next.value);
  }
  return out;
}

function asFetch(
  fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return fn as unknown as typeof fetch;
}

describe("AbortableChatTransport durability", () => {
  test("extends reconnect resilience window to 30 minutes", () => {
    expect(STREAM_RECONNECT_MAX_DURATION_MS).toBe(30 * 60 * 1000);
  });

  test("recovers when initial POST network fails after server already started the run", async () => {
    let calls = 0;
    const mockFetch = asFetch(async (input, init) => {
      calls += 1;
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/chat" && init?.method === "POST") {
        throw new TypeError("Failed to fetch");
      }
      if (url === "/api/sessions/sess_1/chats/chat_1") {
        return Response.json({
          status: "running",
          isStreaming: true,
          chat: { activeStreamId: "run_active_1" },
          messages: [],
        });
      }
      if (url.startsWith("/api/chat/chat_1/stream")) {
        return makeSseResponse(
          [
            { type: "start", messageId: "msg_1" },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Recovered" },
            { type: "text-end", id: "t1" },
            { type: "finish" },
          ],
          "run_active_1",
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    let reconnectNotified = false;
    const transport = new AbortableChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: mockFetch,
      body: { sessionId: "sess_1", chatId: "chat_1" },
      onReconnectNeeded: () => {
        reconnectNotified = true;
      },
    });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat_1",
      messages: [
        {
          id: "u_1",
          role: "user",
          parts: [{ type: "text", text: "hi" }],
        },
      ],
    });

    const chunks = await readAllChunks(stream);
    expect(reconnectNotified).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(chunks.some((c) => c.type === "finish")).toBe(true);
  });

  test("handles 409 completed turn on POST retry without throwing an error", async () => {
    const mockFetch = asFetch(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/chat" && init?.method === "POST") {
        return Response.json({ error: "Already completed" }, { status: 409 });
      }
      if (url === "/api/sessions/sess_1/chats/chat_2") {
        return Response.json({
          status: "completed",
          isStreaming: false,
          chat: { activeStreamId: null },
          messages: [
            { id: "u_2", role: "user", parts: [] },
            { id: "a_2", role: "assistant", parts: [] },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    let reconnectNotified = false;
    let completedSnapshotNotified = false;
    const transport = new AbortableChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: mockFetch,
      body: { sessionId: "sess_1", chatId: "chat_2" },
      onReconnectNeeded: () => {
        reconnectNotified = true;
      },
      onCompletedSnapshotNeeded: () => {
        completedSnapshotNotified = true;
      },
    });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat_2",
      messages: [
        {
          id: "u_2",
          role: "user",
          parts: [{ type: "text", text: "done?" }],
        },
      ],
    });

    const chunks = await readAllChunks(stream);
    expect(reconnectNotified).toBe(false);
    expect(completedSnapshotNotified).toBe(true);
    expect(chunks.some((c) => c.type === "finish")).toBe(true);
  });

  test("retries transient 503 stream responses instead of terminating early", async () => {
    let streamAttempts = 0;
    const mockFetch = asFetch(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/chat/chat_3/stream")) {
        streamAttempts += 1;
        if (streamAttempts === 1) {
          return new Response("Unavailable", { status: 503 });
        }
        return makeSseResponse([
          { type: "start", messageId: "msg_3" },
          { type: "finish" },
        ]);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const transport = new AbortableChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: mockFetch,
    });

    const stream = await transport.reconnectToStream({ chatId: "chat_3" });
    expect(stream).not.toBeNull();
    const chunks = await readAllChunks(stream!);
    expect(streamAttempts).toBe(2);
    expect(chunks.some((c) => c.type === "finish")).toBe(true);
  });

  test("reconnectToStream returns ReadableStream immediately without blocking on slow first chunk", async () => {
    let releaseFirstChunk!: () => void;
    const firstChunkGate = new Promise<void>((resolve) => {
      releaseFirstChunk = resolve;
    });

    const mockFetch = asFetch(async () => {
      const slowBody = new ReadableStream<Uint8Array>({
        async start(controller) {
          await firstChunkGate;
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "start", messageId: "msg_slow" })}\n\ndata: ${JSON.stringify({ type: "finish" })}\n\n`,
            ),
          );
          controller.close();
        },
      });
      return new Response(slowBody, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-workflow-run-id": "run_slow",
        },
      });
    });

    const transport = new AbortableChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: mockFetch,
    });

    // Must resolve before releaseFirstChunk() is called.
    const stream = await transport.reconnectToStream({ chatId: "chat_slow" });
    expect(stream).not.toBeNull();

    releaseFirstChunk();
    const chunks = await readAllChunks(stream!);
    expect(chunks.some((c) => c.type === "finish")).toBe(true);
  });

  test("reconnectToStream closes cleanly when server returns 204", async () => {
    const mockFetch = asFetch(async () => new Response(null, { status: 204 }));
    const transport = new AbortableChatTransport<UIMessage>({
      api: "/api/chat",
      fetch: mockFetch,
    });

    const stream = await transport.reconnectToStream({ chatId: "chat_204" });
    if (stream !== null) {
      const chunks = await readAllChunks(stream);
      expect(chunks).toEqual([]);
    }
  });
});
