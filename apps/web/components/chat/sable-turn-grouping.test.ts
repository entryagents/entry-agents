import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { summarizeTurnWork } from "./sable-turn-grouping";

function makeMessage(parts: WebAgentUIMessage["parts"]): WebAgentUIMessage {
  return {
    id: "m1",
    role: "assistant",
    parts,
  };
}

describe("summarizeTurnWork (Sable 1:1 tool grouping)", () => {
  test("marks reasoning-only turn as thoughtOnly with 0 steps", () => {
    const summary = summarizeTurnWork(
      makeMessage([
        { type: "reasoning", text: "Thinking through the plan", state: "done" },
        { type: "text", text: "Here is the answer." },
      ]),
    );

    expect(summary.hasCollapsible).toBe(true);
    expect(summary.stepCount).toBe(0);
    expect(summary.thoughtOnly).toBe(true);
    expect(summary.changes).toEqual({ files: 0, add: 0, del: 0 });
  });

  test("excludes todo_write from step count and aggregates file changes", () => {
    const summary = summarizeTurnWork(
      makeMessage([
        {
          type: "tool-todo_write",
          toolCallId: "t0",
          state: "output-available",
          input: { todos: [] },
          output: { success: true },
        } as unknown as WebAgentUIMessage["parts"][number],
        {
          type: "tool-read",
          toolCallId: "t1",
          state: "output-available",
          input: { filePath: "src/app.ts" },
          output: { success: true },
        } as unknown as WebAgentUIMessage["parts"][number],
        {
          type: "tool-write",
          toolCallId: "t2",
          state: "output-available",
          input: { filePath: "src/new.ts", content: "a\nb\nc" },
          output: { success: true },
        } as unknown as WebAgentUIMessage["parts"][number],
        {
          type: "tool-edit",
          toolCallId: "t3",
          state: "input-available",
          input: {
            filePath: "src/app.ts",
            oldString: "x\ny\nz",
            newString: "x",
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ]),
    );

    expect(summary.stepCount).toBe(3); // read + write + edit (todo_write excluded)
    expect(summary.thoughtOnly).toBe(false);
    expect(summary.changes).toEqual({ files: 2, add: 3, del: 2 });
    expect(summary.liveLabel).toBe("Editing app.ts");
  });
});
