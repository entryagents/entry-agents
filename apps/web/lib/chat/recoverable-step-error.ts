import { classifyChatError } from "./friendly-error";

const RECOVERABLE_ERROR_CATEGORIES = new Set([
  "rate_limit",
  "timeout",
  "network",
  "provider_unavailable",
  "no_output",
  "context_overflow",
  "invalid_prompt",
]);

const AUTO_FIXABLE_CATEGORIES = new Set(["context_overflow", "invalid_prompt"]);

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
  "eai_again",
  "enotfound",
  "epipe",
  "socket hang up",
  "broken pipe",
  "overloaded",
  "at capacity",
  "no healthy upstream",
  "stream closed",
  "connection closed",
  "unexpected end of json",
  "terminated",
  "agent stream finished without a response message",
  "no output generated",
  "empty response",
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
  }

  const category = classifyChatError(error);
  if (AUTO_FIXABLE_CATEGORIES.has(category)) {
    return true;
  }

  if (error instanceof Error) {
    const isRetryableFlag = (error as { isRetryable?: unknown }).isRetryable;
    if (isRetryableFlag === false) {
      return false;
    }
  }

  if (RECOVERABLE_ERROR_CATEGORIES.has(category)) {
    return true;
  }

  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`.toLowerCase()
      : String(error).toLowerCase();

  return TRANSIENT_SIGNAL_PATTERNS.some((pattern) => message.includes(pattern));
}

export const WORKFLOW_STEP_RECOVERY_BACKOFF_SECONDS = [
  2, 4, 8, 15, 25, 40,
] as const;
