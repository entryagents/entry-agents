/**
 * Classify failures thrown while looking up a Workflow SDK run.
 *
 * `getRun(id)` returns a handle for any id -- the platform call happens on
 * `.status` / `.getReadable()`. Only two outcomes prove a stored run id is
 * dead: the run does not exist, or it aged out of retention. The SDK
 * signals both with dedicated error classes exported from `workflow/errors`
 * (`WorkflowRunNotFoundError`, `RunExpiredError`).
 *
 * Everything else -- `WorkflowWorldError`, `ThrottleError`, network
 * failures, deployment mismatches, plain `Error`s -- is transient: the run
 * may well be alive and mid-stream. Clearing a live run's `activeStreamId`
 * orphans it, and the next submit then starts a *second* workflow for the
 * same chat, duplicating the response and the billing. Callers must treat
 * an unknown failure as "cannot determine", never as "gone".
 *
 * Matched by error name (and `code`) so a wrapped or re-thrown error still
 * classifies correctly.
 */

const DEFINITELY_GONE_RUN_ERROR_NAMES: ReadonlySet<string> = new Set([
  "WorkflowRunNotFoundError",
  "RunExpiredError",
]);

function readErrorField(error: unknown, field: "name" | "code"): unknown {
  if (error instanceof Error) {
    return (error as unknown as Record<string, unknown>)[field];
  }

  if (error !== null && typeof error === "object") {
    return (error as Record<string, unknown>)[field];
  }

  return undefined;
}

/**
 * True only when the error proves the run no longer exists (or has aged
 * out of retention), i.e. when a stored `activeStreamId` is safe to clear.
 * Everything else is transient and must NOT clear a possibly-live run.
 */
export function isDefinitelyGoneRunError(error: unknown): boolean {
  const name = readErrorField(error, "name");
  if (typeof name === "string" && DEFINITELY_GONE_RUN_ERROR_NAMES.has(name)) {
    return true;
  }

  const code = readErrorField(error, "code");
  return typeof code === "string" && DEFINITELY_GONE_RUN_ERROR_NAMES.has(code);
}
