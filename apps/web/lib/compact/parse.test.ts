import { describe, expect, test } from "bun:test";
import { parseCompactCommand } from "./parse";

describe("parseCompactCommand", () => {
  test("matches /compact and optional focus instructions", () => {
    expect(parseCompactCommand("/compact")).toEqual({ kind: "compact" });
    expect(parseCompactCommand("  /COMPACT  ")).toEqual({ kind: "compact" });
    expect(parseCompactCommand("/compact preserve database schema")).toEqual({
      kind: "compact",
      focus: "preserve database schema",
    });
  });

  test("ignores non-/compact messages", () => {
    expect(parseCompactCommand("please compact this")).toBeNull();
    expect(parseCompactCommand("/compactness")).toBeNull();
    expect(parseCompactCommand("")).toBeNull();
  });
});
