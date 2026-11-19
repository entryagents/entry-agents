import { describe, expect, test } from "bun:test";
import {
  generateAndApplyInitialTitle,
  startInitialChatOnServer,
} from "./start-initial-chat";

function asFetch(
  fn: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return fn as unknown as typeof fetch;
}

describe("startInitialChatOnServer", () => {
  test("posts initial user message to /api/chat and cancels local SSE body after OK response", async () => {
    let postedBody: Record<string, unknown> | null = null;
    let bodyCancelled = false;
    let keepaliveUsed: boolean | undefined;

    const mockFetch = asFetch(async (input, init) => {
      expect(input).toBe("/api/chat");
      expect(init?.method).toBe("POST");
      keepaliveUsed = init?.keepalive;
      postedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const body = new ReadableStream<Uint8Array>({
        cancel() {
          bodyCancelled = true;
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-workflow-run-id": "run_init_1",
        },
      });
    });

    await startInitialChatOnServer({
      sessionId: "sess_1",
      chatId: "chat_1",
      built: {
        payload: { text: "Fix background workflow" },
        displayText: "Fix background workflow",
      },
      fetchImpl: mockFetch,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(keepaliveUsed).toBe(true);
    expect(postedBody).toMatchObject({
      sessionId: "sess_1",
      chatId: "chat_1",
      messages: [
        {
          role: "user",
          parts: [{ type: "text", text: "Fix background workflow" }],
        },
      ],
    });
    expect(bodyCancelled).toBe(true);
  });

  test("throws server error message when /api/chat returns non-ok status", async () => {
    const mockFetch = asFetch(async () =>
      Response.json({ error: "Access denied" }, { status: 403 }),
    );

    await expect(
      startInitialChatOnServer({
        sessionId: "sess_1",
        chatId: "chat_1",
        built: {
          payload: { text: "Hello" },
          displayText: "Hello",
        },
        fetchImpl: mockFetch,
      }),
    ).rejects.toThrow("Access denied");
  });
});

describe("generateAndApplyInitialTitle", () => {
  test("updates both chat and session titles when /api/generate-title succeeds", async () => {
    const patchCalls: Array<{ url: string; title: string }> = [];
    const resolvedTitles: string[] = [];

    const mockFetch = asFetch(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/generate-title") {
        return Response.json({ title: "Background Workflow Fix" });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { title: string };
        patchCalls.push({ url, title: body.title });
        return Response.json({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await generateAndApplyInitialTitle({
      sessionId: "sess_2",
      chatId: "chat_2",
      displayText: "Fix background workflow execution",
      onTitleResolved: (title) => resolvedTitles.push(title),
      fetchImpl: mockFetch,
    });

    expect(resolvedTitles).toEqual(["Background Workflow Fix"]);
    expect(patchCalls).toEqual([
      {
        url: "/api/sessions/sess_2/chats/chat_2",
        title: "Background Workflow Fix",
      },
      { url: "/api/sessions/sess_2", title: "Background Workflow Fix" },
    ]);
  });
});
