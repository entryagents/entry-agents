import { describe, expect, it } from "bun:test";
import { parseAnsiSegments } from "./ansi";

describe("parseAnsiSegments", () => {
  it("parses plain text without ANSI codes", () => {
    expect(parseAnsiSegments("hello world")).toEqual([
      { text: "hello world", style: {} },
    ]);
  });

  it("parses SGR colors, bold, and reset sequences", () => {
    const input =
      "\x1B[1;32mPASS\x1B[0m tests/app.test.ts \x1B[31m1 failed\x1B[0m";
    expect(parseAnsiSegments(input)).toEqual([
      { text: "PASS", style: { bold: true, fgClass: "text-emerald-400" } },
      { text: " tests/app.test.ts ", style: {} },
      { text: "1 failed", style: { fgClass: "text-rose-400" } },
    ]);
  });

  it("strips non-SGR CSI sequences cleanly", () => {
    const input = "\x1B[2K\x1B[36mBuilding...\x1B[39m";
    expect(parseAnsiSegments(input)).toEqual([
      { text: "Building...", style: { fgClass: "text-cyan-400" } },
    ]);
  });
});
