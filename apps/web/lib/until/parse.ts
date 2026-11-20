export type ParsedUntilCommand =
  | { kind: "off" }
  | { kind: "empty" }
  | { kind: "set"; check: string; rounds: number };

const DEFAULT_ROUNDS = 5;
const MAX_ROUNDS = 10;

/**
 * Parses `/until <check>`, `/until off`, or `/until --rounds=N <check>`.
 * Returns null if the message is not an `/until` command.
 */
export function parseUntilCommand(text: string): ParsedUntilCommand | null {
  const trimmed = text.trim();
  if (!/^\/until(?:\s|$)/i.test(trimmed)) {
    return null;
  }

  let rest = trimmed.slice("/until".length).trim();
  if (!rest) {
    return { kind: "empty" };
  }

  if (/^(off|stop|clear|cancel)$/i.test(rest)) {
    return { kind: "off" };
  }

  let rounds = DEFAULT_ROUNDS;
  const roundsMatch = /^--rounds=(\d+)\s+(.+)$/i.exec(rest);
  if (roundsMatch?.[1] && roundsMatch[2]) {
    const n = Number(roundsMatch[1]);
    if (Number.isFinite(n) && n >= 1) {
      rounds = Math.min(MAX_ROUNDS, Math.max(1, Math.floor(n)));
    }
    rest = roundsMatch[2].trim();
  }

  if (!rest) {
    return { kind: "empty" };
  }

  return { kind: "set", check: rest, rounds };
}

/**
 * Extracts a failure count from test/lint/typecheck output when available.
 */
export function countFailures(output: string): number | undefined {
  const patterns = [
    /(\d+)\s+fail(?:ed|ing)/i,
    /Found\s+(\d+)\s+error/i,
    /Errors:\s*(\d+)/i,
    /(\d+)\s+error(?:s)?\s+generated/i,
  ];
  for (const re of patterns) {
    const m = re.exec(output);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

const MAX_OUTPUT_CHARS = 6000;

/**
 * Formats the automated follow-up prompt when an `/until` check fails.
 */
export function formatUntilFixPrompt(params: {
  check: string;
  round: number;
  rounds: number;
  exitCode: number;
  output: string;
}): string {
  const trimmed = params.output.trim();
  const clipped =
    trimmed.length > MAX_OUTPUT_CHARS
      ? `…(truncated)\n${trimmed.slice(-MAX_OUTPUT_CHARS)}`
      : trimmed;

  return [
    `The \`/until\` check \`${params.check}\` failed on round ${params.round} of ${params.rounds} (exit code ${params.exitCode}).`,
    "Fix the issue and verify:",
    "```",
    clipped || "(no output)",
    "```",
  ].join("\n\n");
}
