import { isToolUIPart } from "ai";
import type { WebAgentUIMessage } from "@/app/types";

export interface NavMark {
  id: string;
  turn: number;
  preview: string;
  files: number;
  waiting: boolean;
}

export type TickKind = "msg" | "files" | "wait";

export interface Tick {
  /** Px on the track. */
  y: number;
  kind: TickKind;
}

const RANK: Record<TickKind, number> = { msg: 0, files: 1, wait: 2 };

const FILE_MUTATION_TOOLS = new Set([
  "write",
  "edit",
  "multiedit",
  "apply_patch",
  "delete_file",
]);

function extractMessageText(msg: WebAgentUIMessage): string {
  const parts: string[] = [];
  for (const part of msg.parts) {
    if (part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

function countChangedFiles(msg: WebAgentUIMessage): number {
  const paths = new Set<string>();
  for (const part of msg.parts) {
    if (!isToolUIPart(part)) continue;
    const toolName = part.type.replace(/^tool-/, "");
    if (!FILE_MUTATION_TOOLS.has(toolName)) continue;
    const input =
      typeof part.input === "object" && part.input !== null
        ? (part.input as Record<string, unknown>)
        : null;
    const filePath =
      (typeof input?.filePath === "string" && input.filePath) ||
      (typeof input?.path === "string" && input.path) ||
      (typeof input?.file === "string" && input.file);
    if (filePath) paths.add(filePath);
  }
  return paths.size;
}

function hasWaitingApproval(msg: WebAgentUIMessage): boolean {
  for (const part of msg.parts) {
    if (!isToolUIPart(part)) continue;
    if (part.state === "approval-requested") {
      return true;
    }
  }
  return false;
}

/**
 * Extracts user-message navigation marks from a conversation, counting files
 * modified and pending approvals in the assistant response that follows each turn.
 */
export function extractUserNavMarks(messages: WebAgentUIMessage[]): NavMark[] {
  const marks: NavMark[] = [];
  let turn = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || msg.role !== "user") continue;
    turn += 1;

    let files = 0;
    let waiting = false;
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (!next || next.role === "user") break;
      if (next.role === "assistant") {
        files += countChangedFiles(next);
        if (hasWaitingApproval(next)) waiting = true;
      }
    }

    marks.push({
      id: msg.id,
      turn,
      preview: firstLine(extractMessageText(msg)) || "Message",
      files,
      waiting,
    });
  }

  return marks;
}

/**
 * Ticks to draw: marks closer than `gap` px on the track share one tick,
 * which carries the strongest kind among them (waiting, then files changed).
 */
export function ticksOf(
  ys: ArrayLike<number>,
  kindOf: (i: number) => TickKind,
  k: number,
  gap = 3,
): Tick[] {
  const out: Tick[] = [];
  for (let i = 0; i < ys.length; i++) {
    const y = (ys[i] ?? 0) * k;
    const kind = kindOf(i);
    const last = out[out.length - 1];
    if (last && y - last.y < gap) {
      if (RANK[kind] > RANK[last.kind]) last.kind = kind;
      continue;
    }
    out.push({ y, kind });
  }
  return out;
}

/** The mark nearest to `y` (same units as `ys`, which are in order) within `radius`, or -1. */
export function nearest(
  ys: ArrayLike<number>,
  y: number,
  radius: number,
): number {
  let lo = 0;
  let hi = ys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((ys[mid] ?? 0) < y) lo = mid + 1;
    else hi = mid;
  }
  let best = -1;
  let d = radius;
  for (const i of [lo - 1, lo]) {
    if (i < 0 || i >= ys.length) continue;
    const e = Math.abs((ys[i] ?? 0) - y);
    if (e <= d) {
      d = e;
      best = i;
    }
  }
  return best;
}

/**
 * The message to go to from the view (Alt+Up, Alt+Down): `line` is the reading line
 * in content offsets, `top` the view's top. Returns a mark index, or `marks.length`
 * for the end of the conversation (down from the last message), or -1 for nothing.
 */
export function stepTarget(
  ys: ArrayLike<number>,
  line: number,
  top: number,
  dir: 1 | -1,
): number {
  const n = ys.length;
  if (!n) return dir === 1 ? 0 : -1;
  let at = -1;
  for (let i = n - 1; i >= 0; i--) {
    if ((ys[i] ?? 0) < line) {
      at = i;
      break;
    }
  }
  if (dir === -1) {
    if (at >= 0 && (ys[at] ?? 0) < top - 8) return at;
    return Math.max(0, at - 1);
  }
  return at + 1 >= n ? n : at + 1;
}

/** The first non-empty line of a message, for its hover preview. */
export function firstLine(text: string, max = 140): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  const t = line.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
