import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { WebAgentUIMessage } from "@/app/types";
import { mergePreservingLocalWork } from "@/lib/chat/merge-preserving-local-work";

function makeUsage(inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: {
      noCacheTokens: inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    outputTokenDetails: {
      textTokens: outputTokens,
      reasoningTokens: 0,
    },
  };
}

describe("stream flicker, replay, and stuck-reconnecting regressions", () => {
  test("retryChatStream does not depend on unstable chat/transport and useStreamRecovery effect does not depend on retryChatStream", () => {
    const runtimeSrc = readFileSync(
      path.join(import.meta.dir, "use-session-chat-runtime.ts"),
      "utf8",
    );
    const recoverySrc = readFileSync(
      path.join(import.meta.dir, "use-stream-recovery.ts"),
      "utf8",
    );

    // Regression for Video 1 & Video 3: `chat` (from useChat) changes reference
    // on every stream chunk, which recreated `retryChatStream`, re-ran
    // `useStreamRecovery`'s effect, fired `maybeRecoverStreamOnVisibility()`
    // (5s threshold), and tore down + replayed the live stream from chunk 0.
    expect(runtimeSrc).toContain(
      "[chatId, chatInstance, markReconnecting, sessionId]",
    );
    expect(runtimeSrc).not.toContain(
      "[chat, chatId, chatInstance, sessionId, transport]",
    );

    // `useStreamRecovery`'s visibility/online/polling effect must use refs for
    // `retryChatStream` and `isChatInFlight` so it never tears down on stream
    // chunks or fires a spurious 5s visibility check right when sending.
    expect(recoverySrc).toContain("retryChatStreamRef.current(");
    const effectDepsMatch = recoverySrc.match(
      /window\.clearInterval\(recoveryPoll\);\s*\};\s*\},\s*\[([^\]]+)\]/,
    );
    expect(effectDepsMatch).not.toBeNull();
    expect(effectDepsMatch?.[1]).not.toContain("retryChatStream");
    expect(effectDepsMatch?.[1]).not.toContain("isChatInFlight");

    // Regression for orphaned transport bug (`clientRunId: null` across 100% of
    // stream-divergence reconnect storms): when `getOrCreateChatInstance`
    // reuses an existing Chat instance, transport getters must read from the
    // managed `activeTransport`, not a discarded local transport.
    expect(runtimeSrc).toContain("transport: managedTransport");
    expect(runtimeSrc).toContain("activeTransport.getActiveWorkflowRunId()");
    expect(runtimeSrc).toContain("activeTransport.getLastChunkReceivedAt()");
    expect(runtimeSrc).toContain("activeTransport.getLastUiChunkReceivedAt()");
  });

  test("isReconnecting clears when live chunks arrive on reconnected stream (Video 2)", () => {
    let isReconnecting = false;
    let reconnectingStartedAt = 0;

    const markReconnecting = (next: boolean, now: number) => {
      if (next) reconnectingStartedAt = now;
      isReconnecting = next;
    };

    const syncReconnectingEffect = (
      status: "ready" | "submitted" | "streaming" | "error",
      lastChunkReceivedAt: number,
    ) => {
      if (!isReconnecting) return;
      if (status === "ready" || status === "error") {
        markReconnecting(false, lastChunkReceivedAt);
        return;
      }
      if (
        status === "streaming" &&
        lastChunkReceivedAt >= reconnectingStartedAt
      ) {
        markReconnecting(false, lastChunkReceivedAt);
      }
    };

    markReconnecting(true, 1000);
    expect(isReconnecting).toBe(true);

    // Before first post-reconnect chunk arrives
    syncReconnectingEffect("streaming", 900);
    expect(isReconnecting).toBe(true);

    // First live chunk (e.g., message-metadata updating cost $0.0441 -> $0.0449)
    syncReconnectingEffect("streaming", 1050);
    expect(isReconnecting).toBe(false);
  });

  test("mergePreservingLocalWork never regresses cost, tokens, or parts when server snapshot lags behind live stream", () => {
    const serverSnapshot: WebAgentUIMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [{ type: "text", text: "The worktree is in a confused state." }],
        metadata: {
          totalMessageCost: 0.0441,
          totalMessageUsage: makeUsage(224_900, 65),
        },
      },
    ];

    const liveLocal: WebAgentUIMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        parts: [
          { type: "text", text: "The worktree is in a confused state." },
          {
            type: "text",
            text: "Now the root Makefile — add Windows targets.",
          },
        ],
        metadata: {
          totalMessageCost: 0.0459,
          totalMessageUsage: makeUsage(225_100, 120),
        },
      },
    ];

    const merged = mergePreservingLocalWork(serverSnapshot, liveLocal);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.metadata?.totalMessageCost).toBe(0.0459);
    expect(merged[0]?.metadata?.totalMessageUsage?.inputTokens).toBe(225_100);
    expect(
      merged[0]?.parts.some(
        (p) => p.type === "text" && p.text.includes("Now the root Makefile"),
      ),
    ).toBe(true);
  });
});
