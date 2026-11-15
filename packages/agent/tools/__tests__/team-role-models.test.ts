import { describe, expect, test } from "bun:test";
import { createInertPlaceholderModel } from "../../models";
import { getSubagentModel } from "../utils";

function modelIdOf(model: unknown): string | undefined {
  if (!model || typeof model !== "object") return undefined;
  const raw = (model as { modelId?: unknown }).modelId;
  return typeof raw === "string" ? raw : undefined;
}

describe("getSubagentModel per-role pinning", () => {
  const mainModel = createInertPlaceholderModel("openai/gpt-5.3");
  const defaultSubagentModel = createInertPlaceholderModel("openai/gpt-5-mini");
  const gatewayConfig = {
    baseURL: "https://entry-gateway.test/v1",
    apiKey: "test-gateway-key",
  };

  test("resolves teamRoleModels[subagentType] with gatewayConfig when pinned", () => {
    const context = {
      model: mainModel,
      subagentModel: defaultSubagentModel,
      gatewayConfig,
      teamRoleModels: {
        architect: "claude-sonnet-4-6",
        reviewer: "gemini-3.5-flash",
      },
    };

    expect(modelIdOf(getSubagentModel(context, "task", "architect"))).toBe(
      "claude-sonnet-4-6",
    );
    expect(modelIdOf(getSubagentModel(context, "task", "reviewer"))).toBe(
      "gemini-3.5-flash",
    );
  });

  test("falls back to subagentModel then main model when role is unpinned or whitespace", () => {
    const contextWithSubagentFallback = {
      model: mainModel,
      subagentModel: defaultSubagentModel,
      gatewayConfig,
      teamRoleModels: {
        executor: "   ",
      },
    };

    expect(
      getSubagentModel(contextWithSubagentFallback, "task", "executor"),
    ).toBe(defaultSubagentModel);
    expect(
      getSubagentModel(contextWithSubagentFallback, "task", "design"),
    ).toBe(defaultSubagentModel);

    const contextWithMainFallback = {
      model: mainModel,
      gatewayConfig,
    };

    expect(getSubagentModel(contextWithMainFallback, "task", "executor")).toBe(
      mainModel,
    );
    expect(getSubagentModel(contextWithMainFallback, "task")).toBe(mainModel);
  });

  test("throws a clear error when experimental_context lacks model", () => {
    expect(() => getSubagentModel(undefined, "task", "architect")).toThrow(
      "Model not initialized in context (tool: task)",
    );
  });
});
