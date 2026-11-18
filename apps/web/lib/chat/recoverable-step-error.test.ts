import { describe, expect, it } from "bun:test";
import { isRecoverableStepError } from "./recoverable-step-error";

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
        new Error("invalid_request_error: bad prompt shape"),
      ),
    ).toBe(false);
  });
});
