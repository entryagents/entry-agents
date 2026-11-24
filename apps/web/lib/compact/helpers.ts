import type { ModelMessage } from "ai";

export const EXACT_CHECKPOINT_MARKER = "<!-- compact:exact -->\n";

export function encodeExactCheckpointSummary(summaryText: string): string {
  return `${EXACT_CHECKPOINT_MARKER}${summaryText}`;
}

export function decodeCheckpointSummary(rawSummaryText: string): {
  summaryText: string;
  exactBoundary: boolean;
} {
  if (rawSummaryText.startsWith(EXACT_CHECKPOINT_MARKER)) {
    return {
      summaryText: rawSummaryText.slice(EXACT_CHECKPOINT_MARKER.length),
      exactBoundary: true,
    };
  }
  return {
    summaryText: rawSummaryText,
    exactBoundary: false,
  };
}

export function summarizeMessagePartForDigest(part: unknown): string {
  if (!part || typeof part !== "object") {
    return "";
  }
  const obj = part as Record<string, unknown>;
  if (obj.type === "text" && typeof obj.text === "string") {
    return obj.text.slice(0, 600);
  }
  if (obj.type === "tool-call") {
    const name = typeof obj.toolName === "string" ? obj.toolName : "tool";
    const input = obj.input ?? obj.args;
    const raw =
      input && typeof input === "object"
        ? JSON.stringify(input).slice(0, 220)
        : "";
    return `[tool-call ${name}${raw ? ` ${raw}` : ""}]`;
  }
  if (obj.type === "tool-result") {
    const name = typeof obj.toolName === "string" ? obj.toolName : "tool";
    const out = obj.output;
    const raw =
      typeof out === "string"
        ? out.slice(0, 260)
        : out !== undefined
          ? JSON.stringify(out).slice(0, 260)
          : "";
    return `[tool-result ${name}${obj.isError ? " ERROR" : ""}: ${raw}]`;
  }
  return "";
}

export function buildOlderMessagesDigest(messages: ModelMessage[]): string {
  const MAX_DIGEST_CHARS = 28_000;
  const formatted: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const body =
      typeof msg.content === "string"
        ? msg.content.slice(0, 800)
        : Array.isArray(msg.content)
          ? msg.content
              .map(summarizeMessagePartForDigest)
              .filter(Boolean)
              .join(" ")
          : "";
    if (!body) continue;
    formatted.push(`[${i + 1} ${msg.role}]: ${body}`);
  }

  const totalChars = formatted.reduce((sum, line) => sum + line.length + 1, 0);
  if (totalChars <= MAX_DIGEST_CHARS) {
    return formatted.join("\n");
  }

  // Keep the head (initial goal & early setup, ~25% of budget) and the tail
  // (most recent work, edits, errors, and decisions right before the protected
  // tail, ~75% of budget), omitting only the middle when over cap.
  const HEAD_BUDGET = Math.floor(MAX_DIGEST_CHARS * 0.25);
  const TAIL_BUDGET = MAX_DIGEST_CHARS - HEAD_BUDGET - 80;

  const headLines: string[] = [];
  let headChars = 0;
  let headEnd = 0;
  for (let i = 0; i < formatted.length; i++) {
    const line = formatted[i]!;
    if (headChars + line.length + 1 > HEAD_BUDGET && headLines.length > 0) {
      break;
    }
    headLines.push(line);
    headChars += line.length + 1;
    headEnd = i + 1;
  }

  const tailLines: string[] = [];
  let tailChars = 0;
  let tailStart = formatted.length;
  for (let i = formatted.length - 1; i >= headEnd; i--) {
    const line = formatted[i]!;
    if (tailChars + line.length + 1 > TAIL_BUDGET && tailLines.length > 0) {
      break;
    }
    tailLines.push(line);
    tailChars += line.length + 1;
    tailStart = i;
  }
  tailLines.reverse();

  const omittedCount = Math.max(0, tailStart - headEnd);
  if (omittedCount === 0) {
    return [...headLines, ...tailLines].join("\n");
  }

  return [
    ...headLines,
    `...(${omittedCount} middle message(s) omitted due to digest cap)`,
    ...tailLines,
  ].join("\n");
}

export function buildFallbackCompactionSummary(
  messages: ModelMessage[],
): string {
  const userSnippets: string[] = [];
  const toolNames = new Set<string>();
  const filePaths = new Set<string>();

  for (const msg of messages) {
    if (msg.role === "user") {
      const txt =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((p) =>
                  p && typeof p === "object" && "text" in p
                    ? String((p as { text?: unknown }).text ?? "")
                    : "",
                )
                .join(" ")
            : "";
      const cleaned = txt.trim();
      if (cleaned) {
        userSnippets.push(`- ${cleaned.slice(0, 280)}`);
      }
    }
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part || typeof part !== "object") continue;
        const rec = part as Record<string, unknown>;
        if (rec.type === "tool-call" && typeof rec.toolName === "string") {
          toolNames.add(rec.toolName);
          const input = (rec.input ?? rec.args) as
            | Record<string, unknown>
            | undefined;
          const candidatePath =
            input?.filePath ?? input?.path ?? input?.targetFile;
          if (typeof candidatePath === "string" && candidatePath.length > 0) {
            filePaths.add(candidatePath);
          }
        }
      }
    }
  }

  return [
    "## Goal",
    ...(userSnippets.length > 0
      ? userSnippets.slice(-4)
      : ["- Continue the active engineering task."]),
    "## Files Modified / Read",
    ...(filePaths.size > 0
      ? [...filePaths].slice(0, 24).map((p) => `- ${p}`)
      : ["- None recorded"]),
    "## Current Progress & Remaining Work",
    toolNames.size > 0
      ? `- Prior steps used tools: ${[...toolNames].join(", ")}.`
      : "- Earlier conversation compacted to stay within budget.",
  ].join("\n");
}

export function buildCompactionPrompt(
  digestText: string,
  focusInstructions?: string,
): string {
  const sections = [
    "Summarize the earlier conversation into these exact markdown sections:",
    "## Goal",
    "## Constraints & Decisions",
    "## Files Modified / Read",
    "## Current Progress & Remaining Work",
    "## Key Tool Findings / Errors",
  ];
  if (focusInstructions?.trim()) {
    sections.push(
      "",
      `Special focus requested by user (prioritize retaining these exact details): ${focusInstructions.trim()}`,
    );
  }
  sections.push("", digestText);
  return sections.join("\n");
}
