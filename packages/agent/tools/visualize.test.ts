import { describe, expect, test } from "bun:test";
import { visualizeTool } from "./visualize";

describe("visualizeTool", () => {
  test("returns self-contained HTML visualization even without a sandbox", async () => {
    const execute = visualizeTool.execute;
    expect(execute).toBeDefined();
    if (!execute) return;

    const result = await execute(
      {
        title: "Architecture Graph",
        description: "Interactive module dependency map",
        kind: "diagram",
        html: "<div><h1>Graph</h1><svg width='100' height='100'></svg></div>",
        height: 480,
      },
      {
        toolCallId: "test-call-1",
        messages: [],
        experimental_context: undefined,
      },
    );

    expect(result).toEqual({
      success: true,
      title: "Architecture Graph",
      description: "Interactive module dependency map",
      kind: "diagram",
      html: "<div><h1>Graph</h1><svg width='100' height='100'></svg></div>",
      height: 480,
      filePath: null,
    });
  });
});
