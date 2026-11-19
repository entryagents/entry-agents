import { describe, expect, it } from "bun:test";
import {
  isRecoverableStepError,
  isWorkflowStepAutoRecoverable,
  WORKFLOW_STEP_RECOVERY_BACKOFF_SECONDS,
} from "./recoverable-step-error";

describe("isRecoverableStepError", () => {
  it("returns true for transient network and gateway errors", () => {
    expect(isRecoverableStepError(new Error("fetch failed"))).toBe(true);
    expect(isRecoverableStepError(new Error("502 Bad Gateway"))).toBe(true);
    expect(isRecoverableStepError(new Error("429 Too Many Requests"))).toBe(
      true,
    );
    expect(isRecoverableStepError(new Error("socket hang up"))).toBe(true);
    expect(
      isRecoverableStepError(new Error("The model returned no output")),
    ).toBe(true);
    expect(
      isRecoverableStepError(
        new Error("Agent stream finished without a response message"),
      ),
    ).toBe(true);
  });

  it("returns true for auto-fixable context_overflow and invalid_prompt errors even when isRetryable is false", () => {
    const contextErr = Object.assign(new Error("prompt is too long"), {
      isRetryable: false,
    });
    expect(isRecoverableStepError(contextErr)).toBe(true);

    const danglingToolErr = Object.assign(
      new Error("AI_MissingToolResultsError: missing tool results"),
      { isRetryable: false },
    );
    expect(isRecoverableStepError(danglingToolErr)).toBe(true);
  });

  it("returns false for aborts, FatalError, and non-retryable errors", () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    expect(isRecoverableStepError(abortErr)).toBe(false);

    const fatalErr = new Error("Fatal failure");
    fatalErr.name = "FatalError";
    expect(isRecoverableStepError(fatalErr)).toBe(false);

    const nonRetryable = Object.assign(new Error("Invalid parameter"), {
      isRetryable: false,
    });
    expect(isRecoverableStepError(nonRetryable)).toBe(false);
  });

  it("returns false for deterministic auth/billing/validation errors", () => {
    expect(
      isRecoverableStepError(new Error("Your account has run out of credits")),
    ).toBe(false);
    expect(
      isRecoverableStepError(
        new Error("invalid_request_error: bad parameter value"),
      ),
    ).toBe(false);
  });
});

describe("isWorkflowStepAutoRecoverable", () => {
  it("keeps backoff steps fast within seconds", () => {
    expect(
      Math.max(...WORKFLOW_STEP_RECOVERY_BACKOFF_SECONDS),
    ).toBeLessThanOrEqual(5);
  });

  it("recovers from unknown, tool, quota, and mid-stream errors", () => {
    expect(
      isWorkflowStepAutoRecoverable(new Error("Unexpected stream glitch")),
    ).toBe(true);
    expect(
      isWorkflowStepAutoRecoverable(new Error("Tool execution failed")),
    ).toBe(true);
    expect(
      isWorkflowStepAutoRecoverable(new Error("Monthly usage quota reached")),
    ).toBe(true);
  });

  it("does not recover on user abort, credit exhaustion, usage window, or content policy block", () => {
    const abortErr = Object.assign(new Error("Aborted"), {
      name: "AbortError",
    });
    expect(isWorkflowStepAutoRecoverable(abortErr)).toBe(false);
    expect(
      isWorkflowStepAutoRecoverable(
        new Error("Your account has run out of credits"),
      ),
    ).toBe(false);
    expect(
      isWorkflowStepAutoRecoverable(new Error("5-hour usage window is full")),
    ).toBe(false);
    expect(
      isWorkflowStepAutoRecoverable(new Error("Blocked by content policy 451")),
    ).toBe(false);
    const setupFatal = Object.assign(new Error("Session is archived"), {
      name: "FatalError",
    });
    expect(isWorkflowStepAutoRecoverable(setupFatal)).toBe(false);
  });
});
