import { describe, expect, it } from "bun:test";
import { formatAgentLine } from "./agent-line";

describe("agent-line", () => {
  it("formats settled subagent summary with steps and tokens", () => {
    const line = formatAgentLine({
      isRunning: false,
      isFailed: false,
      toolCallCount: 14,
      inputTokens: 30_000,
      outputTokens: 11_000,
    });
    expect(line.state).toBe("Done");
    expect(line.parts).toEqual(["14 steps", "41.0k tokens"]);
  });

  it("formats failed and running subagent states", () => {
    expect(
      formatAgentLine({ isRunning: true, isFailed: false, toolCallCount: 1 }),
    ).toEqual({ state: "Working", parts: ["1 step"] });
    expect(
      formatAgentLine({ isRunning: false, isFailed: true, toolCallCount: 3 }),
    ).toEqual({ state: "Failed", tone: "error", parts: ["3 steps"] });
  });
});
