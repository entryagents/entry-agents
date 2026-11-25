import { describe, expect, test } from "bun:test";
import { StreamDivergenceTracker } from "./stream-divergence-tracker";

describe("StreamDivergenceTracker", () => {
  test("never reconnects during a 60s healthy silent thinking or bash tool call while 10s keepalives arrive", () => {
    const tracker = new StreamDivergenceTracker();
    let now = 100_000;
    const serverUpdatedAt = "2026-11-25T10:00:00.000Z";
    const lastUiChunkAt = 99_500;

    // Poll every 2.5s for 60 seconds with 10s keepalive refreshes and steady DB timestamp
    for (let i = 0; i < 24; i += 1) {
      now += 2_500;
      const lastTransportByteAt = now - (i % 4) * 2_500;
      const action = tracker.evaluate({
        now,
        serverUpdatedAt,
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: lastUiChunkAt,
        clientLastTransportByteAt: lastTransportByteAt,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      });
      expect(action).toEqual({ kind: "none" });
    }
  });

  test("detects server-ahead-of-stream even when 10s SSE keepalives keep transport bytes fresh", () => {
    const tracker = new StreamDivergenceTracker();
    const frozenUiChunkAt = 100_000;

    // Baseline poll establishes serverUpdatedAt T0
    expect(
      tracker.evaluate({
        now: 102_500,
        serverUpdatedAt: "2026-11-25T10:00:00.000Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: frozenUiChunkAt,
        clientLastTransportByteAt: 102_000,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      }),
    ).toEqual({ kind: "none" });

    // Server writes DB checkpoint #1 (new reasoning/tool call) while UI stream stays frozen
    expect(
      tracker.evaluate({
        now: 105_000,
        serverUpdatedAt: "2026-11-25T10:00:02.000Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: frozenUiChunkAt,
        clientLastTransportByteAt: 104_800, // keepalive fresh!
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      }),
    ).toEqual({ kind: "none" });

    // Server writes DB checkpoint #2 while UI stream is STILL frozen -> auto-heal immediately!
    expect(
      tracker.evaluate({
        now: 107_500,
        serverUpdatedAt: "2026-11-25T10:00:04.500Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: frozenUiChunkAt,
        clientLastTransportByteAt: 107_400, // keepalive still fresh!
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      }),
    ).toEqual({ kind: "reconnect", reason: "server-ahead-of-stream" });
  });

  test("triggers server-ahead-of-stream after 6s when server advanced once and UI remains frozen", () => {
    const tracker = new StreamDivergenceTracker();
    const frozenUiChunkAt = 100_000;

    // Baseline
    tracker.evaluate({
      now: 102_500,
      serverUpdatedAt: "2026-11-25T10:00:00.000Z",
      serverActiveStreamId: "wrun_1",
      clientActiveWorkflowRunId: "wrun_1",
      clientLastUiChunkAt: frozenUiChunkAt,
      clientLastTransportByteAt: 102_000,
      inFlightStartedAt: 95_000,
      isVisibilityRecovery: false,
    });

    // Advance once at 105_000
    expect(
      tracker.evaluate({
        now: 105_000,
        serverUpdatedAt: "2026-11-25T10:00:02.000Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: frozenUiChunkAt,
        clientLastTransportByteAt: 104_500,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      }),
    ).toEqual({ kind: "none" });

    // 6 seconds later with no UI chunks -> triggers even without a second DB write
    expect(
      tracker.evaluate({
        now: 111_000,
        serverUpdatedAt: "2026-11-25T10:00:02.000Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: frozenUiChunkAt,
        clientLastTransportByteAt: 110_500,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      }),
    ).toEqual({ kind: "reconnect", reason: "server-ahead-of-stream" });
  });

  test("never false-triggers when real UI chunks are advancing alongside server DB checkpoints", () => {
    const tracker = new StreamDivergenceTracker();
    let now = 100_000;

    for (let i = 0; i < 100; i += 1) {
      now += 2_500;
      const action = tracker.evaluate({
        now,
        // Even with wildly skewed server clock (e.g. year 2099), stays 100% accurate
        serverUpdatedAt: new Date(4_000_000_000_000 + i * 2_500).toISOString(),
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: now - 100,
        clientLastTransportByteAt: now - 100,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      });
      expect(action).toEqual({ kind: "none" });
    }
  });

  test("immediately triggers run-id-changed when server hands off to a continuation segment", () => {
    const tracker = new StreamDivergenceTracker();

    const action = tracker.evaluate({
      now: 105_000,
      serverUpdatedAt: "2026-11-25T10:00:05.000Z",
      serverActiveStreamId: "wrun_seg_2",
      clientActiveWorkflowRunId: "wrun_seg_1",
      clientLastUiChunkAt: 104_900,
      clientLastTransportByteAt: 104_900,
      inFlightStartedAt: 95_000,
      isVisibilityRecovery: false,
    });

    expect(action).toEqual({ kind: "reconnect", reason: "run-id-changed" });
  });

  test("triggers dead-socket when transport bytes stop arriving past 25s foreground or 5s visibility return", () => {
    const tracker = new StreamDivergenceTracker();

    expect(
      tracker.evaluate({
        now: 126_000,
        serverUpdatedAt: "2026-11-25T10:00:00.000Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: 100_000,
        clientLastTransportByteAt: 100_000,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: false,
      }),
    ).toEqual({ kind: "reconnect", reason: "dead-socket" });

    tracker.reset();

    expect(
      tracker.evaluate({
        now: 106_000,
        serverUpdatedAt: "2026-11-25T10:00:00.000Z",
        serverActiveStreamId: "wrun_1",
        clientActiveWorkflowRunId: "wrun_1",
        clientLastUiChunkAt: 100_000,
        clientLastTransportByteAt: 100_000,
        inFlightStartedAt: 95_000,
        isVisibilityRecovery: true,
      }),
    ).toEqual({ kind: "reconnect", reason: "dead-socket" });
  });
});
