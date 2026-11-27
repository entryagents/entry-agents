import { describe, expect, test } from "bun:test";
import {
  getUnlockedFreeModelIds,
  isModelBlockedForFreePlan,
  resolveNewChatModelId,
} from "./paid-model-gate";

describe("paid-model-gate", () => {
  test("never blocks paid-plan users with modelAccess=all", () => {
    expect(
      isModelBlockedForFreePlan({
        modelAccess: "all",
        modelId: "anthropic/claude-opus-4.6",
        freePlanModelId: null,
        freeTierAllowedModelIds: [],
      }),
    ).toBe(false);
  });

  test("blocks free-plan users when no free models are unlocked", () => {
    expect(
      isModelBlockedForFreePlan({
        modelAccess: "starter-only",
        modelId: "anthropic/claude-opus-4.6",
        freePlanModelId: null,
        freeTierAllowedModelIds: [],
      }),
    ).toBe(true);

    expect(
      isModelBlockedForFreePlan({
        modelAccess: "starter-only",
        modelId: null,
        freePlanModelId: null,
        freeTierAllowedModelIds: [],
      }),
    ).toBe(true);
  });

  test("blocks paid models and allows unlocked free models for starter-only users", () => {
    expect(
      isModelBlockedForFreePlan({
        modelAccess: "starter-only",
        modelId: "deepseek/deepseek-v4.1-flash",
        freePlanModelId: "deepseek/deepseek-v4.1-flash",
        freeTierAllowedModelIds: ["deepseek/deepseek-v4.1-flash"],
      }),
    ).toBe(false);

    expect(
      isModelBlockedForFreePlan({
        modelAccess: "starter-only",
        modelId: "anthropic/claude-sonnet-4.6",
        freePlanModelId: "deepseek/deepseek-v4.1-flash",
        freeTierAllowedModelIds: ["deepseek/deepseek-v4.1-flash"],
      }),
    ).toBe(true);
  });

  test("prefers an unlocked free model over a paid saved default on the new chat page", () => {
    expect(
      resolveNewChatModelId({
        modelAccess: "starter-only",
        selectedModelId: null,
        defaultModelId: "anthropic/claude-sonnet-4.6",
        availableModelIds: [
          "anthropic/claude-sonnet-4.6",
          "deepseek/deepseek-v4.1-flash",
        ],
        freePlanModelId: "deepseek/deepseek-v4.1-flash",
        freeTierAllowedModelIds: ["deepseek/deepseek-v4.1-flash"],
      }),
    ).toBe("deepseek/deepseek-v4.1-flash");
  });

  test("falls back to catalog default when zero free models are unlocked so the lock gate triggers", () => {
    expect(
      resolveNewChatModelId({
        modelAccess: "starter-only",
        selectedModelId: null,
        defaultModelId: null,
        availableModelIds: ["anthropic/claude-sonnet-4.6"],
        freePlanModelId: null,
        freeTierAllowedModelIds: [],
      }),
    ).toBe("anthropic/claude-sonnet-4.6");
  });

  test("deduplicates unlocked free model IDs cleanly", () => {
    expect(
      getUnlockedFreeModelIds("model-a", ["model-a", "model-b", "  "]),
    ).toEqual(["model-a", "model-b"]);
  });
});
