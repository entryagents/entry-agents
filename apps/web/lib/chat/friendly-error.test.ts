import { describe, expect, test } from "bun:test";
import {
  classifyChatError,
  isFriendlyChatErrorText,
  toFriendlyChatErrorText,
} from "./friendly-error";

describe("isFriendlyChatErrorText", () => {
  test("matches an exact friendly error string", () => {
    expect(isFriendlyChatErrorText("The request was stopped.")).toBe(true);
  });

  test("matches with surrounding whitespace", () => {
    expect(
      isFriendlyChatErrorText(
        "  The AI provider is temporarily unavailable. Please try again in a moment.  ",
      ),
    ).toBe(true);
  });

  test("matches the unknown fallback friendly error string", () => {
    expect(
      isFriendlyChatErrorText(
        "The model request was interrupted before finishing. Send your next message or switch models if the issue persists.",
      ),
    ).toBe(true);
  });

  test("does not match real assistant text", () => {
    expect(
      isFriendlyChatErrorText(
        "I've updated your config file and restarted the server.",
      ),
    ).toBe(false);
  });

  test("does not match empty or whitespace-only text", () => {
    expect(isFriendlyChatErrorText("")).toBe(false);
    expect(isFriendlyChatErrorText("   ")).toBe(false);
  });

  test("does not match text that merely mentions an error string later", () => {
    expect(
      isFriendlyChatErrorText(
        "Here's what happened: The request was stopped. But I retried and it worked.",
      ),
    ).toBe(false);
  });
});

describe("classifyChatError", () => {
  test("classifies AI_InvalidToolInputError as tool_failure even when message mentions type validation failed", () => {
    const err = new Error(
      'AI_InvalidToolInputError: Invalid input for tool sandbox: Type validation failed: Value: {"action":"ports"}.',
    );
    expect(classifyChatError(err)).toBe("tool_failure");
    expect(toFriendlyChatErrorText(err)).not.toContain("incomplete tool call");
  });

  test("classifies AI_NoSuchToolError as tool_failure", () => {
    const err = new Error(
      "AI_NoSuchToolError: Model tried to call unavailable tool foo.",
    );
    expect(classifyChatError(err)).toBe("tool_failure");
  });
});
