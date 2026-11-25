export type StreamDivergenceReason =
  | "run-id-changed"
  | "server-ahead-of-stream"
  | "dead-socket";

export type StreamDivergenceAction =
  | { kind: "none" }
  | { kind: "reconnect"; reason: StreamDivergenceReason };

export type StreamDivergenceCheckInput = {
  now: number;
  serverUpdatedAt: string | null | undefined;
  serverActiveStreamId: string | null | undefined;
  clientActiveWorkflowRunId: string | null | undefined;
  clientLastUiChunkAt: number;
  clientLastTransportByteAt: number;
  inFlightStartedAt: number | null;
  isVisibilityRecovery: boolean;
};

const RUN_ID_MISMATCH_COOLDOWN_MS = 3_000;
const SERVER_AHEAD_RECONNECT_COOLDOWN_MS = 8_000;
const SERVER_AHEAD_MAX_STALE_MS = 6_000;
const SERVER_AHEAD_ADVANCE_THRESHOLD = 2;
const DEAD_SOCKET_FOREGROUND_MS = 25_000;
const DEAD_SOCKET_VISIBILITY_MS = 5_000;
const DEAD_SOCKET_COOLDOWN_MS = 5_000;

/**
 * Clock-skew-immune detector for silent live-stream stalls.
 *
 * Distinguishes three states with zero false positives:
 * 1. Healthy long reasoning / long `bash` command:
 *    - Server keeps emitting 10s SSE keepalives (`clientLastTransportByteAt` stays fresh).
 *    - Server is NOT writing new DB checkpoints (`serverUpdatedAt` stays constant).
 *    -> Returns `{ kind: "none" }`. Never interrupts healthy silent work.
 * 2. Live stream desynced from active server work (upstream `getReadable()` stall,
 *    dropped framing, stale `startIndex`, or segment handoff):
 *    - Either `serverActiveStreamId !== clientActiveWorkflowRunId` (run handoff), OR
 *    - `serverUpdatedAt` advances in Postgres while `clientLastUiChunkAt` (real parsed
 *      `UIMessageChunk`s, NOT `: keepalive\n\n` bytes) remains frozen.
 *    -> Immediately returns `{ kind: "reconnect" }` so the client reconciles the
 *       DB snapshot and re-attaches without requiring a page reload.
 * 3. Half-open / dead TCP socket:
 *    - Even 10s server SSE keepalives stop arriving (`clientLastTransportByteAt`
 *      quiet > 25s foreground or > 5s after returning to the tab).
 *    -> Returns `{ kind: "reconnect", reason: "dead-socket" }`.
 */
export class StreamDivergenceTracker {
  private lastSeenServerUpdatedAt: string | null = null;
  private lastSeenClientUiChunkAt = 0;
  private unseenServerAdvanceCount = 0;
  private firstUnseenAdvanceLocalAt: number | null = null;
  private lastReconnectAt = 0;

  reset(): void {
    this.lastSeenServerUpdatedAt = null;
    this.lastSeenClientUiChunkAt = 0;
    this.unseenServerAdvanceCount = 0;
    this.firstUnseenAdvanceLocalAt = null;
    this.lastReconnectAt = 0;
  }

  evaluate(input: StreamDivergenceCheckInput): StreamDivergenceAction {
    const {
      now,
      serverUpdatedAt,
      serverActiveStreamId,
      clientActiveWorkflowRunId,
      clientLastUiChunkAt,
      clientLastTransportByteAt,
      inFlightStartedAt,
      isVisibilityRecovery,
    } = input;

    // 1. Authoritative run handoff mismatch: server moved to a new workflow run
    //    (e.g. segment continuation) while the browser is still reading an older run.
    if (
      typeof serverActiveStreamId === "string" &&
      serverActiveStreamId.length > 0 &&
      typeof clientActiveWorkflowRunId === "string" &&
      clientActiveWorkflowRunId.length > 0 &&
      serverActiveStreamId !== clientActiveWorkflowRunId
    ) {
      if (now - this.lastReconnectAt >= RUN_ID_MISMATCH_COOLDOWN_MS) {
        this.lastReconnectAt = now;
        this.unseenServerAdvanceCount = 0;
        this.firstUnseenAdvanceLocalAt = null;
        return { kind: "reconnect", reason: "run-id-changed" };
      }
      return { kind: "none" };
    }

    // 2. Server-ahead-of-stream check (strictly immune to client/server clock skew).
    //    Whenever real UI chunks arrive, clear any accumulated divergence signal.
    const normalizedServerUpdatedAt =
      typeof serverUpdatedAt === "string" && serverUpdatedAt.length > 0
        ? serverUpdatedAt
        : null;

    if (clientLastUiChunkAt > this.lastSeenClientUiChunkAt) {
      this.lastSeenClientUiChunkAt = clientLastUiChunkAt;
      this.unseenServerAdvanceCount = 0;
      this.firstUnseenAdvanceLocalAt = null;
      if (normalizedServerUpdatedAt !== null) {
        this.lastSeenServerUpdatedAt = normalizedServerUpdatedAt;
      }
    } else if (
      normalizedServerUpdatedAt !== null &&
      normalizedServerUpdatedAt !== this.lastSeenServerUpdatedAt
    ) {
      if (this.lastSeenServerUpdatedAt !== null) {
        this.unseenServerAdvanceCount += 1;
        if (this.firstUnseenAdvanceLocalAt === null) {
          this.firstUnseenAdvanceLocalAt = now;
        }
      }
      this.lastSeenServerUpdatedAt = normalizedServerUpdatedAt;
    }

    const serverAheadTriggered =
      this.unseenServerAdvanceCount >= SERVER_AHEAD_ADVANCE_THRESHOLD ||
      (this.firstUnseenAdvanceLocalAt !== null &&
        now - this.firstUnseenAdvanceLocalAt >= SERVER_AHEAD_MAX_STALE_MS);

    if (
      serverAheadTriggered &&
      now - this.lastReconnectAt >= SERVER_AHEAD_RECONNECT_COOLDOWN_MS
    ) {
      this.lastReconnectAt = now;
      this.unseenServerAdvanceCount = 0;
      this.firstUnseenAdvanceLocalAt = null;
      return { kind: "reconnect", reason: "server-ahead-of-stream" };
    }

    // 3. Transport-level dead-socket watchdog (heartbeat-backed).
    const staleThresholdMs = isVisibilityRecovery
      ? DEAD_SOCKET_VISIBILITY_MS
      : DEAD_SOCKET_FOREGROUND_MS;
    const referenceByteAt =
      clientLastTransportByteAt > 0
        ? clientLastTransportByteAt
        : (inFlightStartedAt ?? 0);
    const quietMs = referenceByteAt > 0 ? now - referenceByteAt : 0;

    if (
      referenceByteAt > 0 &&
      quietMs > staleThresholdMs &&
      now - this.lastReconnectAt >= DEAD_SOCKET_COOLDOWN_MS
    ) {
      this.lastReconnectAt = now;
      return { kind: "reconnect", reason: "dead-socket" };
    }

    return { kind: "none" };
  }
}
