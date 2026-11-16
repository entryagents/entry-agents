import { describe, expect, test } from "bun:test";
import {
  dedupeMessageReasoning,
  dedupeMessageParts,
  dedupeMessageList,
} from "./dedupe-message-reasoning";
import type { WebAgentUIMessage } from "@/app/types";

/** Helper to build a minimal assistant message with the given parts. */
function msg(parts: WebAgentUIMessage["parts"]): WebAgentUIMessage {
  return {
    id: "msg_1",
    role: "assistant",
    parts,
    metadata: undefined as never,
  };
}

function reasoning(
  text: string,
  itemId?: string,
): WebAgentUIMessage["parts"][number] {
  return {
    type: "reasoning" as const,
    text,
    ...(itemId != null ? { providerMetadata: { openai: { itemId } } } : {}),
  };
}

describe("dedupeMessageReasoning", () => {
  test("returns same message when no reasoning parts exist", () => {
    const message = msg([{ type: "text" as const, text: "hello" }]);
    const result = dedupeMessageReasoning(message);
    expect(result).toBe(message); // same reference
  });

  test("returns same message when reasoning parts have no itemId", () => {
    const message = msg([
      reasoning("thinking..."),
      reasoning("more thinking..."),
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result).toBe(message);
  });

  test("returns same message when reasoning parts have unique itemIds", () => {
    const message = msg([
      reasoning("thought 1", "rs_abc"),
      reasoning("thought 2", "rs_def"),
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result).toBe(message);
  });

  test("preserves multi-summary parts (same itemId, different text)", () => {
    const message = msg([
      reasoning("summary part 0", "rs_abc"),
      reasoning("summary part 1", "rs_abc"),
      { type: "text" as const, text: "hello" },
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result).toBe(message);
    expect(result.parts).toHaveLength(3);
  });

  test("removes exact duplicate reasoning (same itemId and text)", () => {
    const message = msg([
      { type: "step-start" as const },
      reasoning("thinking about it", "rs_abc"),
      { type: "text" as const, text: "answer" },
      reasoning("thinking about it", "rs_abc"), // duplicate
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result).not.toBe(message); // new object
    expect(result.parts).toHaveLength(3);
    expect(result.parts).toEqual([
      { type: "step-start" },
      reasoning("thinking about it", "rs_abc"),
      { type: "text", text: "answer" },
    ]);
  });

  test("removes multiple duplicates", () => {
    const message = msg([
      reasoning("thought A", "rs_abc"),
      reasoning("thought B", "rs_def"),
      reasoning("thought A", "rs_abc"), // dup of first
      reasoning("thought B", "rs_def"), // dup of second
      { type: "text" as const, text: "answer" },
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result.parts).toHaveLength(3);
    expect(result.parts[0]).toEqual(reasoning("thought A", "rs_abc"));
    expect(result.parts[1]).toEqual(reasoning("thought B", "rs_def"));
    expect(result.parts[2]).toEqual({ type: "text", text: "answer" });
  });

  test("keeps non-reasoning parts untouched", () => {
    const textPart = { type: "text" as const, text: "hello" };
    const stepStart = { type: "step-start" as const };
    const message = msg([
      stepStart,
      reasoning("thought", "rs_abc"),
      textPart,
      reasoning("thought", "rs_abc"), // dup
      textPart, // text parts are always kept (even if identical)
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result.parts).toHaveLength(4);
    expect(result.parts).toEqual([
      stepStart,
      reasoning("thought", "rs_abc"),
      textPart,
      textPart,
    ]);
  });

  test("handles azure provider metadata", () => {
    const azureReasoning = (text: string, itemId: string) => ({
      type: "reasoning" as const,
      text,
      providerMetadata: { azure: { itemId } },
    });

    const message = msg([
      azureReasoning("thought", "rs_abc"),
      azureReasoning("thought", "rs_abc"), // dup
      { type: "text" as const, text: "done" },
    ]);
    const result = dedupeMessageReasoning(message);
    expect(result.parts).toHaveLength(2);
  });

  test("does not mutate the original message", () => {
    const original = msg([
      reasoning("thought", "rs_abc"),
      reasoning("thought", "rs_abc"),
    ]);
    const originalPartsLength = original.parts.length;
    dedupeMessageReasoning(original);
    expect(original.parts).toHaveLength(originalPartsLength);
  });
});

describe("dedupeMessageParts", () => {
  test("removes duplicate reasoning with identical text even without itemId", () => {
    const message = msg([
      reasoning("Launching subagents..."),
      reasoning("Launching subagents..."),
    ]);
    const result = dedupeMessageParts(message);
    expect(result.parts).toHaveLength(1);
    expect(result.parts[0]).toEqual(reasoning("Launching subagents..."));
  });

  test("deduplicates tool calls by toolCallId keeping the output-available part", () => {
    const part1 = {
      type: "dynamic-tool" as const,
      toolName: "task",
      toolCallId: "call_subagent_1",
      state: "input-available" as const,
      input: { role: "Executor" },
    };
    const part2 = {
      type: "dynamic-tool" as const,
      toolName: "task",
      toolCallId: "call_subagent_1",
      state: "output-available" as const,
      input: { role: "Executor" },
      output: { summary: "done" },
    };
    const message = msg([part1, part2]);
    const result = dedupeMessageParts(message);
    expect(result.parts).toHaveLength(1);
    expect((result.parts[0] as typeof part2).state).toBe("output-available");
  });

  test("collapses orphaned input-available tool calls when a retried step completes the same command under a new toolCallId", () => {
    const orphanedBash = {
      type: "tool-bash" as const,
      toolCallId: "call_attempt1_1",
      state: "input-available" as const,
      input: {
        command: "sed -n '1500,1620p' apps/web/app/workflows/chat.ts",
      },
    };
    const completedBash = {
      type: "tool-bash" as const,
      toolCallId: "call_attempt2_1",
      state: "output-available" as const,
      input: {
        command: "sed -n '1500,1620p' apps/web/app/workflows/chat.ts",
      },
      output: { stdout: "line 1500...", stderr: "", exitCode: 0 },
    };
    const inlineSetupError = {
      type: "text" as const,
      text: "Generation could not be completed cleanly. Retry to resume from the last checkpoint, or send another message.",
    };

    const message = msg([
      reasoning("Let's inspect chat.ts"),
      orphanedBash as unknown as WebAgentUIMessage["parts"][number],
      inlineSetupError,
      reasoning("Let's inspect chat.ts"),
      completedBash as unknown as WebAgentUIMessage["parts"][number],
    ]);

    const result = dedupeMessageParts(message);
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0]?.type).toBe("reasoning");
    expect((result.parts[1] as typeof completedBash).toolCallId).toBe(
      "call_attempt2_1",
    );
    expect((result.parts[1] as typeof completedBash).state).toBe(
      "output-available",
    );
    expect(result.metadata?.turnError).toBe(inlineSetupError.text);
  });
  test("deduplicates replayed multi-step text parts separated by tool calls", () => {
    const toolPart = {
      type: "tool-bash" as const,
      toolCallId: "call_step_1",
      state: "output-available" as const,
      input: { command: "pwd" },
      output: { stdout: "/app", exitCode: 0 },
    };
    const message = msg([
      { type: "text" as const, text: "Checking directory." },
      toolPart as unknown as WebAgentUIMessage["parts"][number],
      { type: "text" as const, text: "Done checking." },
      // Replayed sequence (e.g. from startIndex=0 resume or mergePreservingLocalWork)
      { type: "text" as const, text: "Checking directory." },
      toolPart as unknown as WebAgentUIMessage["parts"][number],
      { type: "text" as const, text: "Done checking." },
    ]);

    const result = dedupeMessageParts(message);
    expect(result.parts).toHaveLength(3);
    expect(result.parts[0]).toEqual({
      type: "text",
      text: "Checking directory.",
    });
    expect(result.parts[2]).toEqual({ type: "text", text: "Done checking." });
  });
});

describe("dedupeMessageList", () => {
  test("deduplicates consecutive identical assistant messages on reload or continuation", () => {
    const m1 = msg([reasoning("Launching subagents...")]);
    m1.id = "asst_1";
    const m2 = msg([reasoning("Launching subagents...")]);
    m2.id = "asst_2";
    const list = dedupeMessageList([m1, m2]);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("asst_1");
  });

  test("merges consecutive assistant messages with different IDs when partial local message precedes full server message", () => {
    const partialLocal = msg([
      { type: "text" as const, text: "Running build now." },
    ]);
    partialLocal.id = "asst_local";

    const fullServer = msg([
      { type: "text" as const, text: "Running build now." },
      {
        type: "tool-bash" as const,
        toolCallId: "call_build_1",
        state: "output-available" as const,
        input: { command: "pnpm build" },
        output: { stdout: "ok", exitCode: 0 },
      } as unknown as WebAgentUIMessage["parts"][number],
      { type: "text" as const, text: "Build succeeded." },
    ]);
    fullServer.id = "asst_server";

    const list = dedupeMessageList([partialLocal, fullServer]);
    expect(list).toHaveLength(1);
    expect(list[0].parts).toHaveLength(3);
    expect(list[0].parts[0]).toEqual({
      type: "text",
      text: "Running build now.",
    });
    expect(list[0].parts[2]).toEqual({
      type: "text",
      text: "Build succeeded.",
    });
  });
});
