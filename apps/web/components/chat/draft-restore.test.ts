import { describe, expect, test } from "bun:test";
import { mergeRestoredDraftText } from "./draft-restore";

describe("mergeRestoredDraftText", () => {
  test("returns restored text directly when composer is empty or whitespace", () => {
    expect(mergeRestoredDraftText("Fix the navbar", "")).toBe("Fix the navbar");
    expect(mergeRestoredDraftText("Fix the navbar", "   \n ")).toBe(
      "Fix the navbar",
    );
  });

  test("preserves existing typed draft below the restored message", () => {
    expect(
      mergeRestoredDraftText("Fix the navbar", "Also check mobile padding"),
    ).toBe("Fix the navbar\n\nAlso check mobile padding");
  });

  test("keeps existing draft if restored message had attachments only", () => {
    expect(mergeRestoredDraftText("", "Keep this note")).toBe("Keep this note");
  });
});
