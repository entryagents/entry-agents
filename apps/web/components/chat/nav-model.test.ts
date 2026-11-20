import { describe, expect, it } from "bun:test";
import { firstLine, nearest, stepTarget, ticksOf } from "./nav-model";

describe("nav-model", () => {
  it("coalesces close ticks and keeps highest priority kind", () => {
    const ys = [100, 102, 400];
    const kinds = ["msg", "files", "wait"] as const;
    const ticks = ticksOf(ys, (i) => kinds[i] ?? "msg", 0.5, 3);
    expect(ticks).toEqual([
      { y: 50, kind: "files" },
      { y: 200, kind: "wait" },
    ]);
  });

  it("finds nearest mark within radius", () => {
    const ys = [10, 50, 100];
    expect(nearest(ys, 48, 8)).toBe(1);
    expect(nearest(ys, 75, 8)).toBe(-1);
  });

  it("steps cleanly with Alt+Up and Alt+Down", () => {
    const ys = [0, 300, 700];
    expect(stepTarget(ys, 450, 350, -1)).toBe(1);
    expect(stepTarget(ys, 450, 298, -1)).toBe(0);
    expect(stepTarget(ys, 450, 350, 1)).toBe(2);
    expect(stepTarget(ys, 800, 600, 1)).toBe(3);
  });

  it("extracts truncated first non-empty line", () => {
    expect(firstLine("\n\n  Hello world\nSecond line")).toBe("Hello world");
    expect(firstLine("a".repeat(20), 10)).toBe("aaaaaaaaa…");
  });
});
