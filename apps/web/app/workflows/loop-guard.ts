const READ_ONLY_TOOLS = new Set([
  "read",
  "dir_list",
  "glob",
  "grep",
  "todo_read",
  "ls",
  "find",
  "inbox",
]);

/**
 * Sliding window size (in steps) for duplicate tool-call detection.
 * Prevents legitimate repeated checks (e.g. `pnpm test`, `git status`) over a
 * multi-hour autonomous run from accumulating forever and falsely killing the turn.
 */
const SIGNATURE_WINDOW_STEPS = 20;

export function normalizeToolCallSignature(
  toolName: string,
  rawInput: unknown,
): string {
  const name = toolName || "unknown";
  if (name === "inbox") {
    const action =
      rawInput &&
      typeof rawInput === "object" &&
      (rawInput as { action?: unknown }).action === "list"
        ? "list"
        : "check";
    return `inbox:{"action":"${action}"}`;
  }
  try {
    return `${name}:${JSON.stringify(rawInput ?? {})}`;
  } catch {
    return name;
  }
}

export type LoopGuardDecision =
  | { action: "continue" }
  | { action: "warn"; reason: string }
  | { action: "break"; reason: string };

/**
 * Detects both consecutive and non-consecutive (alternating) tool-call loops
 * within a sliding window as well as runaway read-only exploration stalls.
 */
export class TurnLoopGuard {
  private readonly signatureCounts = new Map<string, number>();
  private readonly recentStepSignatures: string[][] = [];
  private consecutiveReadOnlySteps = 0;
  private warned = false;
  private stepsSinceWarn = 0;

  private evictOldestStepIfNeeded(): void {
    while (this.recentStepSignatures.length >= SIGNATURE_WINDOW_STEPS) {
      const oldest = this.recentStepSignatures.shift();
      if (!oldest) break;
      for (const sig of oldest) {
        const count = (this.signatureCounts.get(sig) ?? 0) - 1;
        if (count <= 0) {
          this.signatureCounts.delete(sig);
        } else {
          this.signatureCounts.set(sig, count);
        }
      }
    }
  }

  recordStep(
    toolCalls: Array<{ toolName: string; signature: string }>,
  ): LoopGuardDecision {
    if (toolCalls.length === 0) {
      this.consecutiveReadOnlySteps = 0;
      return { action: "continue" };
    }

    this.evictOldestStepIfNeeded();
    const stepSigs: string[] = [];

    let maxRepeat = 0;
    let repeatedSig = "";
    for (const tc of toolCalls) {
      stepSigs.push(tc.signature);
      const next = (this.signatureCounts.get(tc.signature) ?? 0) + 1;
      this.signatureCounts.set(tc.signature, next);
      if (next > maxRepeat) {
        maxRepeat = next;
        repeatedSig = tc.signature;
      }
    }
    this.recentStepSignatures.push(stepSigs);

    const allReadOnly = toolCalls.every((tc) =>
      READ_ONLY_TOOLS.has(tc.toolName),
    );
    if (allReadOnly) {
      this.consecutiveReadOnlySteps += 1;
    } else {
      this.consecutiveReadOnlySteps = 0;
    }

    if (this.warned) {
      this.stepsSinceWarn += 1;
      if (maxRepeat >= 4) {
        return {
          action: "break",
          reason: `Repeated tool call ${maxRepeat}x within ${SIGNATURE_WINDOW_STEPS} steps after warning (${repeatedSig})`,
        };
      }
      if (this.stepsSinceWarn >= 3 && this.consecutiveReadOnlySteps >= 12) {
        return {
          action: "break",
          reason: `Continued read-only exploration (${this.consecutiveReadOnlySteps} steps) after warning`,
        };
      }
      // Clear stale warning once the agent has moved on and no signature is near threshold
      if (
        maxRepeat < 3 &&
        this.consecutiveReadOnlySteps < 12 &&
        this.stepsSinceWarn >= 3
      ) {
        this.warned = false;
        this.stepsSinceWarn = 0;
      }
      return { action: "continue" };
    }

    if (maxRepeat >= 3) {
      this.warned = true;
      return {
        action: "warn",
        reason: `Tool call repeated ${maxRepeat}x (${repeatedSig})`,
      };
    }

    if (this.consecutiveReadOnlySteps >= 12) {
      this.warned = true;
      return {
        action: "warn",
        reason: `Read-only exploration stalled for ${this.consecutiveReadOnlySteps} consecutive steps`,
      };
    }

    return { action: "continue" };
  }
}
