import { classifyChatError } from "./friendly-error";

const RECOVERABLE_ERROR_CATEGORIES = new Set([
  "rate_limit",
  "timeout",
  "network",
  "provider_unavailable",
  "no_output",
]);

const TRANSIENT_SIGNAL_PATTERNS = [
  "429",
  "500",
  "502",
  "503",
  "504",
  "520",
  "521",
  "522",
  "523",
  "524",
  "rate limit",
  "too many requests",
  "bad gateway",
  "service unavailable",
  "gateway timeout",
  "internal server error",
  "temporarily unavailable",
  "fetch failed",
  "econnreset",
  "etimedout",
  "econnrefused",
  "socket hang up",
  "broken pipe",
  "overloaded",
  "at capacity",
  "no healthy upstream",
  "stream closed",
  "terminated",
];

/**
 * Determines whether a failed agent step should be retried at the workflow
 * level using a durable `sleep()` rather than immediately failing the turn.
 */
export function isRecoverableStepError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "FatalError") {
      return false;
    }
    const isRetryableFlag = (error as { isRetryable?: unknown }).isRetryable;
    if (isRetryableFlag === false) {
      return false;
    }
  }

  const category = classifyChatError(error);
  if (RECOVERABLE_ERROR_CATEGORIES.has(category)) {
    return true;
  }

  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : String(error).toLowerCase();

  return TRANSIENT_SIGNAL_PATTERNS.some((pattern) => message.includes(pattern));
}

export const WORKFLOW_STEP_RECOVERY_BACKOFF_SECONDS = [3, 6, 12, 24] as const;
