import { describe, expect, test } from "bun:test";
import type { LanguageModel, ModelMessage, ToolSet } from "ai";
import { addCacheControl } from "./cache-control";

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
});
