import type { SelectedLineRange } from "@pierre/diffs";

export type LineSign = " " | "+" | "-";

export interface ReviewLine {
  t: LineSign;
  text: string;
  old?: number;
  neu?: number;
}

export interface ReviewComment {
  id: string;
  /** File path relative to repo root. */
  path: string;
  /** Side in @pierre/diffs ("additions" or "deletions"). */
  side: "additions" | "deletions";
  /** Anchor line number on `side` for @pierre/diffs `lineAnnotations`. */
  lineNumber: number;
  /** The commented lines, first to last. */
  lines: ReviewLine[];
  text: string;
  /** Creation timestamp (ms). */
  at: number;
}

export function newCommentId(): string {
  return `rv${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const firstNumber = (c: ReviewComment): number => {
  for (const l of c.lines) {
    if (l.neu != null || l.old != null) return l.neu ?? l.old ?? 0;
  }
  return c.lineNumber;
};

/**
 * The order a review reads in: files in the order they were first commented on,
 * lines top to bottom.
 */
export function orderComments(list: readonly ReviewComment[]): ReviewComment[] {
  const fileRank = new Map<string, number>();
  for (const c of [...list].sort((a, b) => a.at - b.at)) {
    if (!fileRank.has(c.path)) fileRank.set(c.path, fileRank.size);
  }
  return [...list].sort(
    (a, b) =>
      (fileRank.get(a.path) ?? 0) - (fileRank.get(b.path) ?? 0) ||
      firstNumber(a) - firstNumber(b) ||
      a.at - b.at,
  );
}

/**
 * "line 12", "lines 12–14", "removed lines 3–4"; nothing when the diff had no real numbers.
 */
export function rangeLabel(lines: readonly ReviewLine[]): string | undefined {
  const span = (ns: number[]) => {
    const a = Math.min(...ns);
    const b = Math.max(...ns);
    return a === b ? `line ${a}` : `lines ${a}–${b}`;
  };
  const neu = lines.flatMap((l) => (l.neu != null ? [l.neu] : []));
  if (neu.length) return span(neu);
  const old = lines.flatMap((l) => (l.old != null ? [l.old] : []));
  if (old.length) return `removed ${span(old)}`;
  return undefined;
}

export const REVIEW_HEAD = "Review of your changes:";

const QUOTE_MAX = 6;
const QUOTE_HEAD = 3;
const QUOTE_TAIL = 2;
const QUOTE_WIDTH = 200;

const cut = (s: string) =>
  s.length > QUOTE_WIDTH ? `${s.slice(0, QUOTE_WIDTH - 1)}…` : s;

/** A comment's lines in unified-diff form (`+`, `-`, space), shortened when long. */
export function quoteLines(lines: readonly ReviewLine[]): string[] {
  const fmt = (l: ReviewLine) => `${l.t}${cut(l.text)}`;
  if (lines.length <= QUOTE_MAX) return lines.map(fmt);
  const skipped = lines.length - QUOTE_HEAD - QUOTE_TAIL;
  return [
    ...lines.slice(0, QUOTE_HEAD).map(fmt),
    `… ${skipped} more lines`,
    ...lines.slice(-QUOTE_TAIL).map(fmt),
  ];
}

function fenceFor(quote: readonly string[]): string {
  let longest = 0;
  for (const q of quote) {
    for (const m of q.matchAll(/`+/g)) {
      longest = Math.max(longest, m[0].length);
    }
  }
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The review as one message: what the person typed first, then "Review of your changes:"
 * and per comment its file and lines, the quoted lines and the comment.
 */
export function reviewMessage(
  comments: readonly ReviewComment[],
  lead = "",
): string {
  const blocks = orderComments(comments).map((c, i) => {
    const range = rangeLabel(c.lines);
    const quote = quoteLines(c.lines);
    const fence = fenceFor(quote);
    return [
      `${i + 1}. ${c.path}${range ? `, ${range}` : ""}`,
      `${fence}diff`,
      ...quote,
      fence,
      c.text.trim(),
    ].join("\n");
  });
  const review = [REVIEW_HEAD, ...blocks].join("\n\n");
  return lead.trim() ? `${lead.trim()}\n\n${review}` : review;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Extracts `ReviewLine[]` from a unified diff patch for a `@pierre/diffs` `SelectedLineRange`.
 */
export function extractPatchLines(
  patch: string,
  range: SelectedLineRange,
): {
  lines: ReviewLine[];
  side: "additions" | "deletions";
  lineNumber: number;
} {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const side: "additions" | "deletions" =
    range.endSide ?? range.side ?? "additions";

  const parsed: ReviewLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const rawLine of patch.split("\n")) {
    const hunkMatch = HUNK_RE.exec(rawLine);
    if (hunkMatch) {
      oldLine = Number(hunkMatch[1]);
      newLine = Number(hunkMatch[2]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (rawLine.startsWith("\\ No newline")) continue;

    if (rawLine.startsWith("+")) {
      parsed.push({ t: "+", text: rawLine.slice(1), neu: newLine });
      newLine += 1;
    } else if (rawLine.startsWith("-")) {
      parsed.push({ t: "-", text: rawLine.slice(1), old: oldLine });
      oldLine += 1;
    } else if (rawLine.startsWith(" ")) {
      parsed.push({
        t: " ",
        text: rawLine.slice(1),
        old: oldLine,
        neu: newLine,
      });
      oldLine += 1;
      newLine += 1;
    }
  }

  const matched = parsed.filter((l) => {
    const n = side === "deletions" ? l.old : l.neu;
    return n !== undefined && n >= start && n <= end;
  });

  if (matched.length > 0) {
    return { lines: matched, side, lineNumber: end };
  }

  // Fallback if line wasn't found in parsed hunks
  return {
    lines: [
      side === "deletions"
        ? { t: "-", text: "", old: end }
        : { t: "+", text: "", neu: end },
    ],
    side,
    lineNumber: end,
  };
}
