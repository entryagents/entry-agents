import type { UIMessage } from "ai";
import {
  WorkflowChatTransport,
  type WorkflowChatTransportOptions,
} from "@workflow/ai";

type RequestBody = Record<string, unknown>;
type RequestBodyFactory = () => RequestBody;

type FetchFunction = typeof globalThis.fetch;
type AbortableWorkflowChatTransportOptions<UI_MESSAGE extends UIMessage> =
  WorkflowChatTransportOptions<UI_MESSAGE> & {
    body?: RequestBody | RequestBodyFactory;
  };

/**
 * Keep trying to reconnect for up to 6 minutes (360,000 ms) when network
 * drops mid-turn so a temporary disconnect never kills the live stream or
 * forces the user to stop and type "continue".
 */
export const STREAM_RECONNECT_MAX_DURATION_MS = 6 * 60 * 1000;
const STREAM_RECONNECT_RETRY_DELAY_MS = 1_500;

function resolveBody(body: RequestBody | RequestBodyFactory | undefined) {
  return typeof body === "function" ? body() : body;
}

function mergeHeaders(...headerInits: Array<HeadersInit | undefined>) {
  const headers = new Headers();
  for (const headerInit of headerInits) {
    if (!headerInit) continue;

    new Headers(headerInit).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function getRequestUrl(input: Parameters<FetchFunction>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isStreamReconnectUrl(url: string): boolean {
  return /\/stream(?:\?|$)/.test(url);
}

function getStartIndexParam(url: string): number {
  try {
    const parsed = new URL(url, "http://localhost");
    const raw = parsed.searchParams.get("startIndex");
    if (raw === null) return 0;
    const n = Number.parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
}

function waitForRetryOrOnline(
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onWake);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };

    const onWake = () => {
      cleanup();
      resolve();
    };

    const onVisibility = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        onWake();
      }
    };

    const timer = setTimeout(onWake, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (typeof window !== "undefined") {
      window.addEventListener("online", onWake, { once: true });
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
  });
}

function createSyntheticFinishSseResponse(): Response {
  const body = 'data: {"type":"finish"}\n\n';
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

/**
 * A chat transport that allows aborting ALL active fetch connections,
 * including `reconnectToStream` requests, while providing a 6-minute
 * network resilience window for stream reconnection.
 */
export class AbortableChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends WorkflowChatTransport<UI_MESSAGE> {
  private _state: {
    controller: AbortController;
    lastChunkAt: number;
  };

  constructor(options: AbortableWorkflowChatTransportOptions<UI_MESSAGE>) {
    const state = {
      controller: new AbortController(),
      lastChunkAt: 0,
    };
    const outerFetch: FetchFunction = options?.fetch ?? globalThis.fetch;

    const tapSseResponse = (response: Response): Response => {
      const contentType = response.headers.get("Content-Type") ?? "";
      if (
        !response.body ||
        !contentType.includes("text/event-stream") ||
        typeof TransformStream === "undefined"
      ) {
        return response;
      }
      state.lastChunkAt = Date.now();
      const tappedBody = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            state.lastChunkAt = Date.now();
            controller.enqueue(chunk);
          },
        }),
      );
      return new Response(tappedBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };

    const fetchWithAbort: FetchFunction = Object.assign(
      async (
        input: Parameters<FetchFunction>[0],
        init?: Parameters<FetchFunction>[1],
      ): Promise<Response> => {
        const combinedSignal = init?.signal
          ? AbortSignal.any([state.controller.signal, init.signal])
          : state.controller.signal;

        const url = getRequestUrl(input);
        const isStream = isStreamReconnectUrl(url);
        const startIndex = isStream ? getStartIndexParam(url) : 0;

        if (!isStream) {
          const response = await outerFetch(input, {
            ...init,
            signal: combinedSignal,
          });
          return tapSseResponse(response);
        }

        const deadline = Date.now() + STREAM_RECONNECT_MAX_DURATION_MS;

        while (true) {
          try {
            const response = await outerFetch(input, {
              ...init,
              cache: "no-store",
              signal: combinedSignal,
            });

            if (response.status === 204 && startIndex > 0) {
              state.lastChunkAt = Date.now();
              return createSyntheticFinishSseResponse();
            }

            if (
              (response.status === 502 ||
                response.status === 503 ||
                response.status === 504 ||
                response.status === 429) &&
              Date.now() < deadline &&
              !combinedSignal.aborted
            ) {
              await waitForRetryOrOnline(
                STREAM_RECONNECT_RETRY_DELAY_MS,
                combinedSignal,
              );
              continue;
            }

            return tapSseResponse(response);
          } catch (error) {
            if (combinedSignal.aborted || Date.now() >= deadline) {
              throw error;
            }
            await waitForRetryOrOnline(
              STREAM_RECONNECT_RETRY_DELAY_MS,
              combinedSignal,
            );
          }
        }
      },
      {
        preconnect: outerFetch.preconnect,
      },
    );

    super({
      maxConsecutiveErrors: 240,
      ...options,
      fetch: fetchWithAbort,
      prepareSendMessagesRequest: async (request) => {
        const prepared = await options.prepareSendMessagesRequest?.(request);
        const configuredBody = resolveBody(options.body);
        return {
          ...prepared,
          headers: mergeHeaders(request.headers, prepared?.headers),
          body: {
            ...configuredBody,
            ...request.body,
            messages: request.messages,
            ...prepared?.body,
          },
        };
      },
    });

    this._state = state;
  }

  getLastChunkReceivedAt(): number {
    return this._state.lastChunkAt;
  }

  override async reconnectToStream(
    options: Parameters<
      WorkflowChatTransport<UI_MESSAGE>["reconnectToStream"]
    >[0],
  ) {
    try {
      const stream = await super.reconnectToStream(options);
      if (!stream) {
        return null;
      }

      const reader = stream.getReader();
      let first: Awaited<ReturnType<typeof reader.read>>;
      try {
        first = await reader.read();
      } catch (readError) {
        try {
          reader.releaseLock();
        } catch {
          // Lock already released
        }
        if (
          readError instanceof Error &&
          readError.message.startsWith("Failed to fetch chat: 204")
        ) {
          return null;
        }
        throw readError;
      }

      if (first.done) {
        try {
          reader.releaseLock();
        } catch {
          // Lock already released
        }
        return null;
      }

      const state = this._state;
      state.lastChunkAt = Date.now();

      return new ReadableStream({
        start(controller) {
          controller.enqueue(first.value);
        },
        async pull(controller) {
          const next = await reader.read();
          if (next.done) {
            controller.close();
          } else {
            state.lastChunkAt = Date.now();
            controller.enqueue(next.value);
          }
        },
        async cancel(reason) {
          await reader.cancel(reason);
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Failed to fetch chat: 204")
      ) {
        return null;
      }

      throw error;
    }
  }

  /**
   * Abort every in-flight fetch made through this transport, then reset
   * so new requests go through normally.
   */
  abort(): void {
    this._state.controller.abort();
    this._state.controller = new AbortController();
  }
}
