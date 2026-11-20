import { describe, expect, it } from "bun:test";
import {
  extractPatchLines,
  orderComments,
  quoteLines,
  rangeLabel,
  type ReviewComment,
  reviewMessage,
} from "./model";

const samplePatch = `--- a/src/app.ts
+++ b/src/app.ts
@@ -10,4 +10,5 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 export { a, b };`;

describe("review/model", () => {
  it("extracts lines from a unified patch for SelectedLineRange", () => {
    const res = extractPatchLines(samplePatch, {
      start: 11,
      end: 12,
      side: "additions",
    });
    expect(res.side).toBe("additions");
    expect(res.lineNumber).toBe(12);
    expect(res.lines).toEqual([
      { t: "+", text: "const b = 3;", neu: 11 },
      { t: "+", text: "const c = 4;", neu: 12 },
    ]);
  });

  it("formats range labels for additions and deletions", () => {
    expect(rangeLabel([{ t: "+", text: "x", neu: 12 }])).toBe("line 12");
    expect(
      rangeLabel([
        { t: "+", text: "x", neu: 12 },
        { t: "+", text: "y", neu: 14 },
      ]),
    ).toBe("lines 12–14");
    expect(rangeLabel([{ t: "-", text: "x", old: 5 }])).toBe("removed line 5");
  });

  it("shortens long quoted blocks and formats one review message", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      t: "+" as const,
      text: `line ${i + 1}`,
      neu: i + 1,
    }));
    expect(quoteLines(many)).toEqual([
      "+line 1",
      "+line 2",
      "+line 3",
      "… 3 more lines",
      "+line 7",
      "+line 8",
    ]);

    const comments: ReviewComment[] = [
      {
        id: "c1",
        path: "src/app.ts",
        side: "additions",
        lineNumber: 12,
        lines: [{ t: "+", text: "const c = 4;", neu: 12 }],
        text: "Rename c to something clearer",
        at: 100,
      },
    ];
    const msg = reviewMessage(comments, "Please address this:");
    expect(msg).toContain("Please address this:");
    expect(msg).toContain("Review of your changes:");
    expect(msg).toContain("1. src/app.ts, line 12");
    expect(msg).toContain("+const c = 4;");
    expect(msg).toContain("Rename c to something clearer");
  });

  it("orders comments by first-commented file then line number", () => {
    const list: ReviewComment[] = [
      {
        id: "b2",
        path: "b.ts",
        side: "additions",
        lineNumber: 20,
        lines: [{ t: "+", text: "x", neu: 20 }],
        text: "second in b",
        at: 300,
      },
      {
        id: "a1",
        path: "a.ts",
        side: "additions",
        lineNumber: 5,
        lines: [{ t: "+", text: "y", neu: 5 }],
        text: "first in a",
        at: 200,
      },
      {
        id: "b1",
        path: "b.ts",
        side: "additions",
        lineNumber: 10,
        lines: [{ t: "+", text: "z", neu: 10 }],
        text: "first in b",
        at: 100,
      },
    ];
    expect(orderComments(list).map((c) => c.id)).toEqual(["b1", "b2", "a1"]);
  });
});
