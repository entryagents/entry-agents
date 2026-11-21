import { useSyncExternalStore } from "react";
import type { WebAgentUIMessage } from "@/app/types";

// Shared 1-second clock for every live timer in the timeline (1:1 Sable util.ts).
const ticking = new Set<() => void>();
let tickTimer: number | null = null;
let tickNow = Date.now();

function subscribeTick(fn: () => void): () => void {
  if (ticking.size === 0 && typeof window !== "undefined") {
    tickNow = Date.now();
    tickTimer = window.setInterval(() => {
      tickNow = Date.now();
      for (const listener of ticking) {
        listener();
      }
    }, 1000);
  }
  ticking.add(fn);
  return () => {
    ticking.delete(fn);
    if (
      ticking.size === 0 &&
      tickTimer !== null &&
      typeof window !== "undefined"
    ) {
      window.clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

const noopSubscribe = () => () => {};
const readTick = () => tickNow;
const readServerTick = () => 0;

/** Current timestamp (ms), refreshed once per second while `active`. */
export function useTick(active = true): number {
  return useSyncExternalStore(
    active ? subscribeTick : noopSubscribe,
    readTick,
    readServerTick,
  );
}

/** "8s", "1m 12s", "2h 5m": compact whole-second durations (1:1 Sable). */
export function shortDuration(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const DATE_LOCALE = "en-GB";
const HOUR12 = (() => {
  try {
    return (
      new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions()
        .hour12 ?? false
    );
  } catch {
    return false;
  }
})();

const TIME_FMT = new Intl.DateTimeFormat(DATE_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: HOUR12,
});
const DAY_FMT = new Intl.DateTimeFormat(DATE_LOCALE, {
  month: "short",
  day: "numeric",
});
const DAY_YEAR_FMT = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Time-only for today; date + time for earlier days (1:1 Sable `stampParts`). */
export function stampParts(
  ts: number,
  now = Date.now(),
): { day: string; time: string } {
  const d = new Date(ts);
  const n = new Date(now);
  const time = TIME_FMT.format(d);
  if (d.toDateString() === n.toDateString()) {
    return { day: "", time };
  }
  const day = (
    d.getFullYear() === n.getFullYear() ? DAY_FMT : DAY_YEAR_FMT
  ).format(d);
  return { day, time };
}

export interface ModelSwitchEntry {
  fromModelId: string;
  toModelId: string;
  isLatest: boolean;
}

/**
 * Finds assistant turns where the model changed compared to the previous
 * assistant turn. Keyed by the assistant message ID where the new model starts.
 */
export function detectModelSwitches(
  messages: readonly Pick<WebAgentUIMessage, "id" | "role" | "metadata">[],
): Map<string, ModelSwitchEntry> {
  const switches = new Map<string, ModelSwitchEntry>();
  let prevModelId: string | null = null;
  let latestSwitchId: string | null = null;

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const modelId =
      msg.metadata?.selectedModelId ?? msg.metadata?.modelId ?? null;
    if (!modelId) continue;
    if (prevModelId && prevModelId !== modelId) {
      switches.set(msg.id, {
        fromModelId: prevModelId,
        toModelId: modelId,
        isLatest: false,
      });
      latestSwitchId = msg.id;
    }
    prevModelId = modelId;
  }

  if (latestSwitchId) {
    const latest = switches.get(latestSwitchId);
    if (latest) {
      latest.isLatest = true;
    }
  }

  return switches;
}

/** Critically damped natural frequency (rad/s) for spring scroll auto-follow (1:1 Sable). */
export const SPRING_FOLLOW_W = 24;

export interface SpringFollowState {
  pos: number;
  v: number;
}

/**
 * Advances a critically damped spring scroll follower by `dtSec` seconds.
 * Never overshoots `target`; settles cleanly once within 0.4px.
 */
export function stepSpringFollow(
  state: SpringFollowState,
  target: number,
  dtSec: number,
): { pos: number; v: number; settled: boolean } {
  const clampedDt = Math.min(0.034, Math.max(0.001, dtSec));
  const x = state.pos - target;
  const v =
    state.v +
    (-SPRING_FOLLOW_W * SPRING_FOLLOW_W * x - 2 * SPRING_FOLLOW_W * state.v) *
      clampedDt;
  const pos = state.pos + v * clampedDt;

  if (Math.abs(target - pos) <= 0.4 && Math.abs(v) < 8) {
    return { pos: target, v: 0, settled: true };
  }
  if (pos >= target - 0.4 && state.pos <= target) {
    return { pos: target, v: 0, settled: true };
  }
  return { pos, v, settled: false };
}
