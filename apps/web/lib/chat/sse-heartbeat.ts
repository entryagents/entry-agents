const KEEPALIVE_BYTES = new TextEncoder().encode(": keepalive\n\n");

export const DEFAULT_SSE_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Wraps a `text/event-stream` `Response` so that an SSE comment
 * (`: keepalive\n\n`) is emitted whenever `intervalMs` elapses without an
 * upstream chunk.
 *
 * Why this is required:
 * 1. Mobile carriers, NAT gateways, and reverse proxies silently half-close
 *    idle SSE connections during long reasoning phases (30-60s) or long tool
 *    commands (e.g. `bash`). Periodic keepalive frames keep the TCP stream
 *    alive across every proxy hop.
 * 2. The browser transport (`AbortableChatTransport`) updates `lastChunkAt` on
 *    every received byte. With a guaranteed 10s server heartbeat, the client
 *    can distinguish with 100% certainty between a healthy thinking/tool-call
 *    stream (bytes arrive every <=10s) and a genuinely dead/half-open socket
 *    (0 bytes for >25s).
 * 3. SSE comments (`: ...\n\n`) are ignored by the WHATWG EventSource /
 *    `eventsource-parser` / AI SDK `parseJsonEventStream`, so they never alter
 *    chunk indices or message payloads.
 */
export function withSseHeartbeat(
  response: Response,
  intervalMs = DEFAULT_SSE_HEARTBEAT_INTERVAL_MS,
): Response {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!response.body || !contentType.includes("text/event-stream")) {
    return response;
  }

  const reader = response.body.getReader();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let lastActivityAt = Date.now();
  let closed = false;

  const stopTimer = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      heartbeatTimer = setInterval(
        () => {
          if (closed) {
            stopTimer();
            return;
          }
          if (Date.now() - lastActivityAt >= intervalMs) {
            try {
              controller.enqueue(KEEPALIVE_BYTES);
              lastActivityAt = Date.now();
            } catch {
              closed = true;
              stopTimer();
            }
          }
        },
        Math.max(100, Math.floor(intervalMs / 2)),
      );
      if (
        typeof heartbeatTimer === "object" &&
        heartbeatTimer !== null &&
        "unref" in heartbeatTimer &&
        typeof heartbeatTimer.unref === "function"
      ) {
        heartbeatTimer.unref();
      }
    },
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          closed = true;
          stopTimer();
          try {
            reader.releaseLock();
          } catch {
            // Lock already released
          }
          controller.close();
          return;
        }
        lastActivityAt = Date.now();
        controller.enqueue(next.value);
      } catch (error) {
        closed = true;
        stopTimer();
        try {
          reader.releaseLock();
        } catch {
          // Lock already released
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      closed = true;
      stopTimer();
      await reader.cancel(reason).catch(() => {});
      try {
        reader.releaseLock();
      } catch {
        // Lock already released
      }
    },
  });

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
