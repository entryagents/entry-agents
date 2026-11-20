import { describe, expect, it } from "bun:test";
import {
  countFailures,
  formatUntilFixPrompt,
  parseUntilCommand,
} from "./parse";

describe("until/parse", () => {
  it("parses /until commands accurately", () => {
    expect(parseUntilCommand("hello world")).toBeNull();
    expect(parseUntilCommand("/until")).toEqual({ kind: "empty" });
    expect(parseUntilCommand("/until off")).toEqual({ kind: "off" });
    expect(parseUntilCommand("/until pnpm test")).toEqual({
      kind: "set",
      check: "pnpm test",
      rounds: 5,
    });
    expect(parseUntilCommand("/until --rounds=3 bun test")).toEqual({
      kind: "set",
      check: "bun test",
      rounds: 3,
    });
  });

  it("extracts failure counts from common tool outputs", () => {
    expect(countFailures("3 fail\n12 pass")).toBeUndefined();
    expect(countFailures("3 failed, 10 passed")).toBe(3);
    expect(countFailures("Found 4 errors and 2 warnings")).toBe(4);
    expect(countFailures("All tests passed")).toBeUndefined();
  });

  it("formats fix prompts with clipped output", () => {
    const prompt = formatUntilFixPrompt({
      check: "pnpm typecheck",
      round: 2,
      rounds: 5,
      exitCode: 1,
      output: "error TS2322: bad type",
    });
    expect(prompt).toContain("`/until` check `pnpm typecheck` failed");
    expect(prompt).toContain("round 2 of 5 (exit code 1)");
    expect(prompt).toContain("error TS2322: bad type");
  });
});
