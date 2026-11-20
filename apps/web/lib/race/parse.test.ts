import { describe, expect, it } from "bun:test";
import type { ModelOption } from "@/lib/model-options";
import { parseRaceCommand, pickRaceModels } from "./parse";

const models: ModelOption[] = [
  {
    id: "model-a",
    label: "Model A",
    shortLabel: "Model A",
    provider: "anthropic",
  },
  {
    id: "model-b",
    label: "Model B",
    shortLabel: "Model B",
    provider: "openai",
  },
];

describe("race/parse", () => {
  it("parses /race commands accurately", () => {
    expect(parseRaceCommand("fix the bug")).toBeNull();
    expect(parseRaceCommand("/race")).toEqual({ kind: "empty" });
    expect(parseRaceCommand("/race   refactor auth middleware  ")).toEqual({
      kind: "start",
      task: "refactor auth middleware",
    });
  });

  it("picks two distinct models when available", () => {
    expect(pickRaceModels("model-a", models)).toEqual(["model-a", "model-b"]);
    expect(pickRaceModels("model-b", models)).toEqual(["model-b", "model-a"]);
    expect(pickRaceModels("model-a", [models[0]!])).toEqual([
      "model-a",
      "model-a",
    ]);
  });
});
