import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import { taskTool } from "./task";

describe("taskTool.toModelOutput", () => {
  test("returns text from last assistant message", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "**Summary**: All 7 files reviewed.\n\n**Answer**: Clean.",
          },
        ],
      } as never,
    ];
    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: unknown) => { type: string; value: string };
      }
    ).toModelOutput({ output: { final: messages } });
    expect(out.value).toContain("All 7 files reviewed");
    expect(out.value).toContain("Clean");
  });

  test("recovers earlier assistant text when last message has only tool calls", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Preliminary findings: 1 bug in solver.ts" },
        ],
      } as never,
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "read", args: {} },
        ],
      } as never,
    ];
    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: unknown) => { type: string; value: string };
      }
    ).toModelOutput({ output: { final: messages } });
    expect(out.value).toBe("Preliminary findings: 1 bug in solver.ts");
  });

  test("provides informative diagnostics when no text was produced at all", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "read", args: {} },
          { type: "tool-call", toolCallId: "c2", toolName: "grep", args: {} },
        ],
      } as never,
    ];
    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: unknown) => { type: string; value: string };
      }
    ).toModelOutput({ output: { final: messages } });
    expect(out.value).toContain(
      "Subagent completed without emitting a final text summary",
    );
    expect(out.value).toContain("2 tool calls executed");
    expect(out.value).not.toBe("Task completed.");
  });

  test("handles empty messages gracefully", () => {
    const out = (
      taskTool as unknown as {
        toModelOutput: (arg: unknown) => { type: string; value: string };
      }
    ).toModelOutput({ output: { final: [] } });
    expect(out.value).toContain("without producing messages");
  });
});
