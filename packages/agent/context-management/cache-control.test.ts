import { describe, expect, test } from "bun:test";
import type { LanguageModel, ModelMessage, ToolSet } from "ai";
import { addCacheControl } from "./cache-control";
import { buildSystemPromptParts } from "../system-prompt";

describe("addCacheControl", () => {
  const anthropicModel = {
    provider: "anthropic",
    modelId: "claude-3-7-sonnet-20250219",
  } as unknown as LanguageModel;

  const openaiModel = {
    provider: "openai",
    modelId: "gpt-4o",
  } as unknown as LanguageModel;

  test("wraps instructions in SystemModelMessage with ephemeral cacheControl for Anthropic", () => {
    const instructions = "You are a helpful coding agent.";
    const result = addCacheControl({
      instructions,
      model: anthropicModel,
    });

    expect(typeof result).toBe("object");
    expect(result).toEqual({
      role: "system",
      content: instructions,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  });

  test("leaves instructions as plain string for OpenAI", () => {
    const instructions = "You are a helpful coding agent.";
    const result = addCacheControl({
      instructions,
      model: openaiModel,
    });

    expect(result).toBe(instructions);
  });

  test("marks only the last tool with cacheControl for Anthropic", () => {
    const tools = {
      read: { description: "read file", execute: async () => "" },
      write: { description: "write file", execute: async () => "" },
      bash: { description: "run command", execute: async () => "" },
    } as unknown as ToolSet;

    const result = addCacheControl({
      tools,
      model: anthropicModel,
    });

    const record = result as Record<
      string,
      { providerOptions?: { anthropic?: { cacheControl?: unknown } } }
    >;
    expect(record.read?.providerOptions).toBeUndefined();
    expect(record.write?.providerOptions).toBeUndefined();
    expect(record.bash?.providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    });
  });

  test("marks multi-turn conversation with previous assistant checkpoint and latest message", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there, how can I help?" },
      { role: "user", content: "can you fix this bug?" },
    ];

    const result = addCacheControl({
      messages,
      model: anthropicModel,
    });

    // Checkpoint index 1 (assistant message) should have cacheControl
    expect(result[1]?.providerOptions?.anthropic).toEqual({
      cacheControl: { type: "ephemeral" },
    });
    // Final index 2 (latest user message) should have cacheControl
    expect(result[2]?.providerOptions?.anthropic).toEqual({
      cacheControl: { type: "ephemeral" },
    });
    // First message should NOT have cacheControl
    expect(result[0]?.providerOptions?.anthropic).toBeUndefined();
  });

  test("handles single-turn message correctly", () => {
    const messages: ModelMessage[] = [{ role: "user", content: "hello" }];

    const result = addCacheControl({
      messages,
      model: anthropicModel,
    });

    expect(result[0]?.providerOptions?.anthropic).toEqual({
      cacheControl: { type: "ephemeral" },
    });
  });

  test("keeps staticCore cached separately from dynamicContext for Anthropic models", () => {
    const turn1 = buildSystemPromptParts({
      modelId: "claude-sonnet-4-6",
      cwd: "/workspace",
      currentBranch: "main",
    });
    const turn2 = buildSystemPromptParts({
      modelId: "claude-sonnet-4-6",
      cwd: "/workspace",
      currentBranch: "feat/new-branch",
      guidedFrontendWorkflow: true,
    });

    expect(turn1.staticCore).toBe(turn2.staticCore);
    expect(turn1.dynamicContext).not.toBe(turn2.dynamicContext);

    const cached1 = addCacheControl({
      instructions: [turn1.staticCore, turn1.dynamicContext],
      model: anthropicModel,
    });
    const cached2 = addCacheControl({
      instructions: [turn2.staticCore, turn2.dynamicContext],
      model: anthropicModel,
    });

    expect(Array.isArray(cached1)).toBe(true);
    expect(Array.isArray(cached2)).toBe(true);
    if (Array.isArray(cached1) && Array.isArray(cached2)) {
      expect(cached1).toHaveLength(2);
      expect(cached1[0]?.content).toBe(cached2[0]?.content);
      expect(cached1[0]?.providerOptions).toEqual({
        anthropic: { cacheControl: { type: "ephemeral" } },
      });
      expect(cached1[1]?.providerOptions).toBeUndefined();
    }
  });

  test("joins split instructions back to a plain string for non-Anthropic models", () => {
    const joined = addCacheControl({
      instructions: ["STATIC", "DYNAMIC"],
      model: openaiModel,
    });
    expect(joined).toBe("STATIC\nDYNAMIC");
  });
});
