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
    onReconnectNeeded?: () => void;
  };

/**
 * Keep trying to reconnect for up to 30 minutes (1,800,000 ms) when network
 * drops mid-send or mid-stream so a temporary disconnect or subway/elevator
 * dead zone never kills the live turn.
 */
export const STREAM_RECONNECT_MAX_DURATION_MS = 30 * 60 * 1000;
const STREAM_RECONNECT_RETRY_DELAY_MS = 1_500;
const OFFLINE_HEARTBEAT_DELAY_MS = 12_000;
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);

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

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function parseIdentifiersFromBody(
  body: BodyInit | null | undefined,
): { sessionId: string; chatId: string; lastUserMessageId?: string } | null {
  if (typeof body !== "string" || body.length === 0) return null;
  try {
    const parsed = JSON.parse(body) as {
      sessionId?: unknown;
      chatId?: unknown;
      messages?: Array<{ id?: unknown; role?: unknown }>;
    };
    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.chatId !== "string"
    ) {
      return null;
    }
    let lastUserMessageId: string | undefined;
    if (Array.isArray(parsed.messages)) {
      for (let i = parsed.messages.length - 1; i >= 0; i -= 1) {
        const msg = parsed.messages[i];
        if (msg?.role === "user" && typeof msg.id === "string") {
          lastUserMessageId = msg.id;
          break;
        }
      }
    }
    return {
      sessionId: parsed.sessionId,
      chatId: parsed.chatId,
      lastUserMessageId,
    };
  } catch {
    return null;
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

    const effectiveDelay = isBrowserOffline()
      ? Math.max(delayMs, OFFLINE_HEARTBEAT_DELAY_MS)
      : delayMs;

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
        document.visibilityState === "visible" &&
        !isBrowserOffline()
      ) {
        onWake();
      }
    };

    const timer = setTimeout(onWake, effectiveDelay);
    signal.addEventListener("abort", onAbort, { once: true });
    if (typeof window !== "undefined") {
      window.addEventListener("online", onWake, { once: true });
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
  });
}

function createSyntheticFinishSseResponse(workflowRunId?: string): Response {
  const body = 'data: {"type":"finish"}\n\n';
  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "x-entry-synthetic-finish": "1",
  };
  if (workflowRunId) {
    headers["x-workflow-run-id"] = workflowRunId;
  }
  return new Response(body, {
    status: 200,
    headers,
  });
}

/**
 * A chat transport that allows aborting ALL active fetch connections,
 * including `reconnectToStream` requests, while providing a 30-minute
 * network resilience window across initial send POSTs and stream reconnection.
 */
export class AbortableChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends WorkflowChatTransport<UI_MESSAGE> {
  private _state: {
    controller: AbortController;
    lastChunkAt: number;
    activeSendMessagesCount: number;
  };

  constructor(options: AbortableWorkflowChatTransportOptions<UI_MESSAGE>) {
    const state = {
      controller: new AbortController(),
      lastChunkAt: 0,
      activeSendMessagesCount: 0,
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

    const probeExistingRunAfterPostFailure = async (
      identifiers: {
        sessionId: string;
        chatId: string;
        lastUserMessageId?: string;
      },
      signal: AbortSignal,
    ): Promise<Response | null> => {
      try {
        const snapshotRes = await outerFetch(
          `/api/sessions/${identifiers.sessionId}/chats/${identifiers.chatId}`,
          { cache: "no-store", signal },
        );
        if (!snapshotRes.ok) return null;
        const snapshot = (await snapshotRes.json()) as {
          status?: string;
          isStreaming?: boolean;
          chat?: { activeStreamId?: string | null };
          messages?: Array<{ id?: string; role?: string }>;
        };
        if (snapshot.isStreaming || snapshot.chat?.activeStreamId) {
          const streamRes = await outerFetch(
            `/api/chat/${identifiers.chatId}/stream?startIndex=0`,
            {
              headers: { "x-entry-mid-turn": "1" },
              cache: "no-store",
              signal,
            },
          );
          if (streamRes.ok && streamRes.body) {
            options.onReconnectNeeded?.();
            return tapSseResponse(streamRes);
          }
        }
        // If server already persisted and completed this turn while the POST
        // response dropped mid-flight, finish gracefully so UI reconciles DB.
        const msgs = Array.isArray(snapshot.messages) ? snapshot.messages : [];
        const lastMsg = msgs[msgs.length - 1];
        const hasCompletedReplyForUserMsg =
          identifiers.lastUserMessageId &&
          msgs.some((m) => m.id === identifiers.lastUserMessageId) &&
          lastMsg?.role === "assistant" &&
          snapshot.status === "completed";
        if (hasCompletedReplyForUserMsg) {
          options.onReconnectNeeded?.();
          return createSyntheticFinishSseResponse(
            snapshot.chat?.activeStreamId ?? "completed",
          );
        }
      } catch {
        // Probe failed; caller decides whether to retry POST
      }
      return null;
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
        const deadline = Date.now() + STREAM_RECONNECT_MAX_DURATION_MS;

        if (!isStream) {
          const isPost = (init?.method ?? "GET").toUpperCase() === "POST";
          const identifiers = isPost
            ? parseIdentifiersFromBody(init?.body)
            : null;
          let attemptedSend = false;

          while (true) {
            if (isBrowserOffline() && !combinedSignal.aborted) {
              if (Date.now() >= deadline) {
                throw new Error("Network offline timeout exceeded");
              }
              await waitForRetryOrOnline(
                STREAM_RECONNECT_RETRY_DELAY_MS,
                combinedSignal,
              );
              continue;
            }

            // Before re-POSTing after a dropped connection, verify the server
            // didn't already accept the request and start the workflow.
            if (attemptedSend && identifiers) {
              const recovered = await probeExistingRunAfterPostFailure(
                identifiers,
                combinedSignal,
              );
              if (recovered) {
                return recovered;
              }
            }

            attemptedSend = true;
            try {
              const response = await outerFetch(input, {
                ...init,
                signal: combinedSignal,
              });

              if (response.status === 409 && identifiers) {
                const reconciled = await probeExistingRunAfterPostFailure(
                  identifiers,
                  combinedSignal,
                );
                if (reconciled) {
                  return reconciled;
                }
              }

              if (
                TRANSIENT_HTTP_STATUSES.has(response.status) &&
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
        }

        while (true) {
          if (isBrowserOffline() && !combinedSignal.aborted) {
            if (Date.now() >= deadline) {
              throw new Error("Network offline timeout exceeded");
            }
            await waitForRetryOrOnline(
              STREAM_RECONNECT_RETRY_DELAY_MS,
              combinedSignal,
            );
            continue;
          }

          try {
            const headers = new Headers(init?.headers);
            if (state.activeSendMessagesCount > 0) {
              headers.set("x-entry-mid-turn", "1");
            }
            const response = await outerFetch(input, {
              ...init,
              headers,
              cache: "no-store",
              signal: combinedSignal,
            });

            if (
              response.status === 204 &&
              (startIndex > 0 || state.activeSendMessagesCount > 0)
            ) {
              state.lastChunkAt = Date.now();
              options.onReconnectNeeded?.();
              return createSyntheticFinishSseResponse();
            }

            if (
              TRANSIENT_HTTP_STATUSES.has(response.status) &&
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
      maxConsecutiveErrors: 600,
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

  override async sendMessages(
    options: Parameters<WorkflowChatTransport<UI_MESSAGE>["sendMessages"]>[0],
  ) {
    const state = this._state;
    state.activeSendMessagesCount += 1;
    let decremented = false;
    const decrementOnce = () => {
      if (decremented) return;
      decremented = true;
      state.activeSendMessagesCount = Math.max(
        0,
        state.activeSendMessagesCount - 1,
      );
    };

    try {
      const stream = await super.sendMessages(options);
      const reader = stream.getReader();
      return new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              decrementOnce();
              controller.close();
            } else {
              state.lastChunkAt = Date.now();
              controller.enqueue(next.value);
            }
          } catch (err) {
            decrementOnce();
            if (
              err instanceof Error &&
              err.message.startsWith("Failed to fetch chat: 204")
            ) {
              controller.close();
              return;
            }
            throw err;
          }
        },
        async cancel(reason) {
          decrementOnce();
          await reader.cancel(reason);
        },
      });
    } catch (error) {
      decrementOnce();
      throw error;
    }
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
      const state = this._state;

      return new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              try {
                reader.releaseLock();
              } catch {
                // Lock already released
              }
              controller.close();
            } else {
              state.lastChunkAt = Date.now();
              controller.enqueue(next.value);
            }
          } catch (err) {
            try {
              reader.releaseLock();
            } catch {
              // Lock already released
            }
            if (
              err instanceof Error &&
              err.message.startsWith("Failed to fetch chat: 204")
            ) {
              controller.close();
              return;
            }
            controller.error(err);
          }
        },
        async cancel(reason) {
          await reader.cancel(reason).catch(() => {});
          try {
            reader.releaseLock();
          } catch {
            // Lock already released
          }
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
