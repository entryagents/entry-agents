import { describe, expect, test } from "bun:test";
import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import { withSseHeartbeat } from "./sse-heartbeat";

describe("withSseHeartbeat", () => {
  test("emits SSE keepalive comments during idle periods and remains 100% compatible with AI SDK parseJsonEventStream", async () => {
    const encoder = new TextEncoder();

    const rawSse = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"start","messageId":"m-1"}\n\n'),
        );
        // Simulate a silent model thinking / long bash command gap
        await new Promise((resolve) => setTimeout(resolve, 160));
        controller.enqueue(
          encoder.encode('data: {"type":"text-start","id":"t-1"}\n\n'),
        );
        controller.enqueue(
          encoder.encode(
            'data: {"type":"text-delta","id":"t-1","delta":"hello"}\n\n',
          ),
        );
        controller.enqueue(
          encoder.encode('data: {"type":"text-end","id":"t-1"}\n\n'),
        );
        controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
        controller.close();
      },
    });

    const baseResponse = new Response(rawSse, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    const wrapped = withSseHeartbeat(baseResponse, 50);
    expect(wrapped.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(wrapped.headers.get("X-Accel-Buffering")).toBe("no");

    const [rawBranch, aiBranch] = wrapped.body!.tee();

    // 1. Verify raw bytes actually contain `: keepalive\n\n` frames
    const rawText = await new Response(rawBranch).text();
    expect(rawText).toContain(": keepalive\n\n");

    // 2. Verify AI SDK's real parseJsonEventStream ignores keepalives and parses all chunks cleanly
    const parsedStream = parseJsonEventStream({
      stream: aiBranch,
      schema: uiMessageChunkSchema,
    });
    const reader = parsedStream.getReader();
    const types: string[] = [];
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      expect(next.value.success).toBe(true);
      if (next.value.success) {
        types.push(next.value.value.type);
      }
    }

    expect(types).toEqual([
      "start",
      "text-start",
      "text-delta",
      "text-end",
      "finish",
    ]);
  });

  test("passes non-SSE responses through untouched", async () => {
    const jsonRes = Response.json({ ok: true });
    const wrapped = withSseHeartbeat(jsonRes, 50);
    expect(wrapped).toBe(jsonRes);
    expect(await wrapped.json()).toEqual({ ok: true });
  });
});
