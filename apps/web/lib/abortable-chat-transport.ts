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
    onCompletedSnapshotNeeded?: () => void;
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

export type TransportAbortOptions = {
  /**
   * When true (used on route unmount), abort stream reading and GET
   * `/api/chat/:id/stream` reconnect polling while letting any in-flight initial
   * `POST /api/chat` handshake finish reaching the server so background execution
   * starts reliably.
   */
  preserveInFlightSend?: boolean;
};

function createAbortError(reason?: unknown): DOMException {
  if (reason instanceof Error && reason.name === "AbortError") {
    return reason as DOMException;
  }
  return new DOMException("Aborted", "AbortError");
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
 * A chat transport that allows aborting active fetch connections,
 * including `reconnectToStream` requests, while providing a 30-minute
 * network resilience window across initial send POSTs and stream reconnection.
 */
export class AbortableChatTransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> extends WorkflowChatTransport<UI_MESSAGE> {
  private _state: {
    sendController: AbortController;
    readController: AbortController;
    lastChunkAt: number;
    lastUiChunkAt: number;
    activeWorkflowRunId: string | null;
    activeSendMessagesCount: number;
    activeReconnectCount: number;
    streamGeneration: number;
  };

  constructor(options: AbortableWorkflowChatTransportOptions<UI_MESSAGE>) {
    const state = {
      sendController: new AbortController(),
      readController: new AbortController(),
      lastChunkAt: 0,
      lastUiChunkAt: 0,
      activeWorkflowRunId: null as string | null,
      activeSendMessagesCount: 0,
      activeReconnectCount: 0,
      streamGeneration: 0,
    };
    const outerFetch: FetchFunction = options?.fetch ?? globalThis.fetch;

    const tapSseResponse = (
      response: Response,
      readSignal?: AbortSignal,
    ): Response => {
      const contentType = response.headers.get("Content-Type") ?? "";
      if (!response.body || !contentType.includes("text/event-stream")) {
        return response;
      }
      if (readSignal?.aborted) {
        void response.body.cancel().catch(() => {});
        const abortedStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(createAbortError(readSignal.reason));
          },
        });
        return new Response(abortedStream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      const responseRunId = response.headers.get("x-workflow-run-id");
      if (responseRunId && responseRunId !== "completed") {
        state.activeWorkflowRunId = responseRunId;
      }
      state.lastChunkAt = Date.now();
      const sourceReader = response.body.getReader();
      let settled = false;
      let onReadAbort: (() => void) | undefined;
      const cleanupReadSignal = () => {
        if (onReadAbort && readSignal) {
          readSignal.removeEventListener("abort", onReadAbort);
          onReadAbort = undefined;
        }
      };

      const tappedBody = new ReadableStream<Uint8Array>({
        start(controller) {
          if (readSignal) {
            onReadAbort = () => {
              if (settled) return;
              settled = true;
              cleanupReadSignal();
              controller.error(createAbortError(readSignal.reason));
              void sourceReader.cancel().catch(() => {});
            };
            readSignal.addEventListener("abort", onReadAbort, { once: true });
          }
        },
        async pull(controller) {
          if (settled || readSignal?.aborted) {
            if (!settled) {
              settled = true;
              cleanupReadSignal();
              controller.error(createAbortError(readSignal?.reason));
            }
            return;
          }
          try {
            const next = await sourceReader.read();
            if (settled || readSignal?.aborted) {
              if (!settled) {
                settled = true;
                cleanupReadSignal();
                controller.error(createAbortError(readSignal?.reason));
              }
              return;
            }
            if (next.done) {
              settled = true;
              cleanupReadSignal();
              controller.close();
            } else {
              state.lastChunkAt = Date.now();
              controller.enqueue(next.value);
            }
          } catch (error) {
            if (!settled) {
              settled = true;
              cleanupReadSignal();
              controller.error(
                readSignal?.aborted
                  ? createAbortError(readSignal.reason)
                  : error,
              );
            }
          }
        },
        async cancel(reason) {
          settled = true;
          cleanupReadSignal();
          await sourceReader.cancel(reason).catch(() => {});
        },
      });
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
      const activeRunStatuses = new Set([
        "queued",
        "running",
        "sleeping",
        "resuming",
      ]);
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
        const isActiveOnServer =
          Boolean(snapshot.isStreaming) ||
          Boolean(snapshot.chat?.activeStreamId) ||
          (typeof snapshot.status === "string" &&
            activeRunStatuses.has(snapshot.status));

        if (isActiveOnServer) {
          // Try attaching directly to the live stream endpoint. If it returns
          // 503 ("Stream initializing"), wait briefly and retry so we attach
          // without firing a duplicate POST /api/chat.
          for (let attempt = 0; attempt < 10; attempt++) {
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
              return tapSseResponse(streamRes, signal);
            }
            if (!TRANSIENT_HTTP_STATUSES.has(streamRes.status)) {
              break;
            }
            await waitForRetryOrOnline(STREAM_RECONNECT_RETRY_DELAY_MS, signal);
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
          options.onCompletedSnapshotNeeded?.();
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
        const sendSignal = init?.signal
          ? AbortSignal.any([state.sendController.signal, init.signal])
          : state.sendController.signal;
        const readSignal = init?.signal
          ? AbortSignal.any([state.readController.signal, init.signal])
          : state.readController.signal;
        const combinedSignal = AbortSignal.any([sendSignal, readSignal]);

        const url = getRequestUrl(input);
        const isStream = isStreamReconnectUrl(url);
        const startIndex = isStream ? getStartIndexParam(url) : 0;
        const deadline = Date.now() + STREAM_RECONNECT_MAX_DURATION_MS;

        if (!isStream) {
          const isPost = (init?.method ?? "GET").toUpperCase() === "POST";
          const postFetchSignal = isPost ? sendSignal : combinedSignal;
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
            if (attemptedSend && identifiers && !combinedSignal.aborted) {
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
                signal: postFetchSignal,
              });

              if (
                response.status === 409 &&
                identifiers &&
                !readSignal.aborted
              ) {
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

              return tapSseResponse(response, readSignal);
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
            const isMidTurnContext =
              state.activeSendMessagesCount > 0 ||
              state.activeReconnectCount > 0 ||
              startIndex > 0;
            if (isMidTurnContext) {
              headers.set("x-entry-mid-turn", "1");
            }
            if (startIndex > 0 && state.activeWorkflowRunId) {
              headers.set("x-entry-expected-run-id", state.activeWorkflowRunId);
            }
            const response = await outerFetch(input, {
              ...init,
              headers,
              cache: "no-store",
              signal: combinedSignal,
            });

            if (response.status === 204 && isMidTurnContext) {
              const resolved = resolveBody(options?.body);
              const sessionId =
                typeof resolved?.sessionId === "string"
                  ? resolved.sessionId
                  : undefined;
              const chatId =
                typeof resolved?.chatId === "string"
                  ? resolved.chatId
                  : undefined;
              if (sessionId && chatId) {
                try {
                  const snapshotRes = await outerFetch(
                    `/api/sessions/${sessionId}/chats/${chatId}`,
                    { cache: "no-store", signal: combinedSignal },
                  );
                  if (snapshotRes.ok) {
                    const snapshot = (await snapshotRes.json()) as {
                      status?: string;
                      isStreaming?: boolean;
                    };
                    const isTerminal =
                      !snapshot.isStreaming &&
                      (snapshot.status === "completed" ||
                        snapshot.status === "failed" ||
                        snapshot.status === "cancelled" ||
                        snapshot.status === "idle");
                    if (isTerminal) {
                      state.lastChunkAt = Date.now();
                      options.onCompletedSnapshotNeeded?.();
                      return createSyntheticFinishSseResponse();
                    }
                    if (Date.now() < deadline && !combinedSignal.aborted) {
                      await waitForRetryOrOnline(
                        STREAM_RECONNECT_RETRY_DELAY_MS,
                        combinedSignal,
                      );
                      continue;
                    }
                  }
                } catch {
                  if (Date.now() < deadline && !combinedSignal.aborted) {
                    await waitForRetryOrOnline(
                      STREAM_RECONNECT_RETRY_DELAY_MS,
                      combinedSignal,
                    );
                    continue;
                  }
                }
              }
              return response;
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

            return tapSseResponse(response, readSignal);
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

  getLastUiChunkReceivedAt(): number {
    return this._state.lastUiChunkAt;
  }

  getActiveWorkflowRunId(): string | null {
    return this._state.activeWorkflowRunId;
  }

  hasActiveSendMessages(): boolean {
    return this._state.activeSendMessagesCount > 0;
  }

  override async sendMessages(
    options: Parameters<WorkflowChatTransport<UI_MESSAGE>["sendMessages"]>[0],
  ) {
    const state = this._state;
    const myGeneration = ++state.streamGeneration;
    // New turn supersedes any previous workflow run ID and chunk timestamps so
    // an idle timestamp from a prior turn can never trigger a false dead-socket
    // reconnect while the new POST /api/chat handshake is in flight.
    state.activeWorkflowRunId = null;
    state.lastChunkAt = 0;
    state.lastUiChunkAt = 0;
    // Supersede any prior SSE reader so two streams can never ping-pong messages.
    state.readController.abort();
    state.readController = new AbortController();

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
          if (myGeneration !== state.streamGeneration) {
            decrementOnce();
            await reader.cancel().catch(() => {});
            controller.error(createAbortError());
            return;
          }
          try {
            const next = await reader.read();
            if (myGeneration !== state.streamGeneration) {
              decrementOnce();
              await reader.cancel().catch(() => {});
              controller.error(createAbortError());
              return;
            }
            if (next.done) {
              decrementOnce();
              controller.close();
            } else {
              const now = Date.now();
              state.lastChunkAt = now;
              state.lastUiChunkAt = now;
              controller.enqueue(next.value);
            }
          } catch (err) {
            decrementOnce();
            if (myGeneration !== state.streamGeneration) {
              controller.error(createAbortError());
              return;
            }
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
    const state = this._state;
    const myGeneration = ++state.streamGeneration;
    state.lastChunkAt = 0;
    // Supersede any prior SSE reader so two streams can never ping-pong messages.
    state.readController.abort();
    state.readController = new AbortController();

    state.activeReconnectCount += 1;
    let decremented = false;
    const decrementOnce = () => {
      if (decremented) return;
      decremented = true;
      state.activeReconnectCount = Math.max(0, state.activeReconnectCount - 1);
    };

    try {
      const stream = await super.reconnectToStream(options);
      if (!stream) {
        decrementOnce();
        return null;
      }

      const reader = stream.getReader();

      return new ReadableStream({
        async pull(controller) {
          if (myGeneration !== state.streamGeneration) {
            decrementOnce();
            await reader.cancel().catch(() => {});
            try {
              reader.releaseLock();
            } catch {
              // Lock already released
            }
            controller.error(createAbortError());
            return;
          }
          try {
            const next = await reader.read();
            if (myGeneration !== state.streamGeneration) {
              decrementOnce();
              await reader.cancel().catch(() => {});
              try {
                reader.releaseLock();
              } catch {
                // Lock already released
              }
              controller.error(createAbortError());
              return;
            }
            if (next.done) {
              decrementOnce();
              try {
                reader.releaseLock();
              } catch {
                // Lock already released
              }
              controller.close();
            } else {
              const now = Date.now();
              state.lastChunkAt = now;
              state.lastUiChunkAt = now;
              controller.enqueue(next.value);
            }
          } catch (err) {
            decrementOnce();
            try {
              reader.releaseLock();
            } catch {
              // Lock already released
            }
            if (myGeneration !== state.streamGeneration) {
              controller.error(createAbortError());
              return;
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
          decrementOnce();
          await reader.cancel(reason).catch(() => {});
          try {
            reader.releaseLock();
          } catch {
            // Lock already released
          }
        },
      });
    } catch (error) {
      decrementOnce();
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
   * Abort active fetches made through this transport, then reset controllers so
   * new requests go through normally. When `preserveInFlightSend` is set, only
   * SSE reading and GET `/stream` reconnects are aborted while any in-flight
   * `POST /api/chat` finishes reaching the server.
   */
  abort(options?: TransportAbortOptions): void {
    if (!options?.preserveInFlightSend) {
      this._state.sendController.abort();
      this._state.sendController = new AbortController();
    }
    this._state.readController.abort();
    this._state.readController = new AbortController();
  }
}
