import { describe, expect, test } from "bun:test";
import {
  getDefaultSessionTitle,
  getRandomCityName,
  sanitizePromptToTitle,
} from "./random-city";

describe("getDefaultSessionTitle & getRandomCityName", () => {
  test("returns 'New Session' when no names are used", () => {
    const result = getRandomCityName(new Set());
    expect(result).toBe("New Session");
  });

  test("uses repoName when provided", () => {
    const result = getDefaultSessionTitle(new Set(), {
      repoName: "entry-agents",
    });
    expect(result).toBe("entry-agents");
  });

  test("appends suffix when repoName already exists", () => {
    const used = new Set(["entry-agents"]);
    const result = getDefaultSessionTitle(used, { repoName: "entry-agents" });
    expect(result).toBe("entry-agents (2)");
  });

  test("returned name is not in the usedNames set", () => {
    const used = new Set(["New Session", "New Session 2"]);
    const result = getRandomCityName(used);
    expect(used.has(result)).toBe(false);
    expect(result).toBe("New Session 3");
  });

  test("generates unique names across many calls", () => {
    const used = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const name = getRandomCityName(used);
      expect(used.has(name)).toBe(false);
      used.add(name);
    }
    expect(used.size).toBe(50);
  });

  test("falls back to numbered suffix when base title is used", () => {
    const used = new Set<string>(["New Session"]);
    const result = getRandomCityName(used);
    expect(/ \d+$/.test(result)).toBe(true);
    expect(result).toBe("New Session 2");
  });

  test("numbered suffix increments to avoid collisions", () => {
    const used = new Set<string>([
      "New Session",
      "New Session 2",
      "New Session 3",
    ]);
    const result = getRandomCityName(used);
    expect(result).toBe("New Session 4");
  });

  test("does not mutate the usedNames set", () => {
    const used = new Set(["New Session"]);
    const sizeBefore = used.size;
    getRandomCityName(used);
    expect(used.size).toBe(sizeBefore);
  });
});

describe("sanitizePromptToTitle", () => {
  test("cleans conversational filler words", () => {
    expect(
      sanitizePromptToTitle("Can you please help me with authentication bug"),
    ).toBe("Authentication bug");
    expect(
      sanitizePromptToTitle("Hey, let's build a three column workspace"),
    ).toBe("Build a three column workspace");
  });

  test("handles empty string gracefully", () => {
    expect(sanitizePromptToTitle("")).toBe("New Session");
    expect(sanitizePromptToTitle("   ")).toBe("New Session");
  });

  test("truncates long prompt cleanly without trailing punctuation", () => {
    const longPrompt =
      "Build a full responsive three-column development workspace with integrated terminal, file tree, and preview tabs";
    const result = sanitizePromptToTitle(longPrompt);
    expect(result.length).toBeLessThanOrEqual(51);
    expect(result.endsWith("...")).toBe(true);
  });
});
