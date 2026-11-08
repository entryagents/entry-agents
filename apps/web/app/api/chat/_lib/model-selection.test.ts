import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/models-with-context", () => ({
  fetchAvailableLanguageModels: mock(async () => [
    { id: "anthropic/claude-sonnet-4.6" },
  ]),
}));
mock.module("@/lib/db/model-overrides", () => ({
  getDisabledModelIdSet: mock(async () => new Set<string>()),
}));

const { APP_DEFAULT_MODEL_ID } = await import("@/lib/models");
const { resolveChatModelSelection } = await import("./model-selection");

describe("resolveChatModelSelection", () => {
  test("returns direct model ids unchanged when the model isn't reasoning-capable", async () => {
    const selection = await resolveChatModelSelection({
      selectedModelId: "openai/gpt-5",
      reasoningEffort: null,
      missingModelLabel: "Selected model",
    });

    expect(selection).toEqual({
      id: "openai/gpt-5",
    });
  });

  test("attaches reasoning provider options for a reasoning-capable model", async () => {
    const selection = await resolveChatModelSelection({
      selectedModelId: "deepseek-v4-pro",
      reasoningEffort: "high",
      missingModelLabel: "Selected model",
    });

    expect(selection).toEqual({
      id: "deepseek-v4-pro",
      providerOptionsOverrides: {
        openai: {
          reasoningEffort: "high",
          store: false,
        },
      },
    });
  });

  test("ignores reasoning effort for models that don't support it", async () => {
    const selection = await resolveChatModelSelection({
      selectedModelId: "openai/gpt-5",
      reasoningEffort: "high",
      missingModelLabel: "Selected model",
    });

    expect(selection).toEqual({
      id: "openai/gpt-5",
    });
  });

  test("self-heals to a live model when the requested model is hard-blocked", async () => {
    const { fetchAvailableLanguageModels } =
      await import("@/lib/models-with-context");
    (
      fetchAvailableLanguageModels as unknown as ReturnType<typeof mock>
    ).mockImplementationOnce(async () => [
      { id: APP_DEFAULT_MODEL_ID },
      { id: "openai/gpt-5" },
    ]);

    const selection = await resolveChatModelSelection({
      selectedModelId: "kimi-k3",
      reasoningEffort: null,
      missingModelLabel: "Selected model",
    });

    expect(selection).toEqual({
      id: APP_DEFAULT_MODEL_ID,
    });
  });

  test("uses the default model when no model id is provided", async () => {
    const selection = await resolveChatModelSelection({
      selectedModelId: null,
      reasoningEffort: null,
      missingModelLabel: "Selected model",
    });

    expect(selection).toEqual({
      id: APP_DEFAULT_MODEL_ID,
    });
  });

  test("self-heals to live gateway model for an admin-disabled model from DB override table", async () => {
    const { getDisabledModelIdSet } = await import("@/lib/db/model-overrides");
    (
      getDisabledModelIdSet as unknown as ReturnType<typeof mock>
    ).mockImplementationOnce(async () => new Set(["deepseek-v4-pro"]));

    const { fetchAvailableLanguageModels } =
      await import("@/lib/models-with-context");
    (
      fetchAvailableLanguageModels as unknown as ReturnType<typeof mock>
    ).mockImplementationOnce(async () => [{ id: "openai/gpt-5" }]);

    const selection = await resolveChatModelSelection({
      selectedModelId: "deepseek-v4-pro",
      reasoningEffort: null,
      missingModelLabel: "Selected model",
    });

    expect(selection).toEqual({
      id: "openai/gpt-5",
    });
  });

  test("throws a clear error when model is disabled and no live models are reachable", async () => {
    const { fetchAvailableLanguageModels } =
      await import("@/lib/models-with-context");
    (
      fetchAvailableLanguageModels as unknown as ReturnType<typeof mock>
    ).mockImplementationOnce(async () => []);

    await expect(
      resolveChatModelSelection({
        selectedModelId: "kimi-k3",
        reasoningEffort: null,
        missingModelLabel: "Selected model",
      }),
    ).rejects.toThrow(/no AI models are reachable right now/);
  });
});
