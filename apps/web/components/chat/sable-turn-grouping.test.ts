import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { isLeadIn, leadTitle } from "./lead-in";
import {
  buildAssistantTurnFlow,
  formatExploreRunLabel,
  summarizeTurnWork,
} from "./sable-turn-grouping";

function makeMessage(parts: WebAgentUIMessage["parts"]): WebAgentUIMessage {
  return {
    id: "m1",
    role: "assistant",
    parts,
  };
}

function toolPart(
  type: string,
  toolCallId: string,
  state: string,
  input: Record<string, unknown>,
  output?: unknown,
): WebAgentUIMessage["parts"][number] {
  return {
    type,
    toolCallId,
    state,
    input,
    ...(output !== undefined ? { output } : {}),
  } as unknown as WebAgentUIMessage["parts"][number];
}

describe("Sable 1:1 lead-in detection & title extraction", () => {
  test("detects announcements, moves, and nods while rejecting findings", () => {
    expect(isLeadIn("Let me read the handler.", false)).toBe(true);
    expect(isLeadIn("Now the CSS.", false)).toBe(true);
    expect(isLeadIn("Committed.", false)).toBe(true);
    expect(isLeadIn("The guard returns 403. Let me fix it.", false)).toBe(
      false,
    );
    expect(
      isLeadIn("I'll rerun CI, but the migration already failed.", false),
    ).toBe(false);
    expect(leadTitle("Now let me run the tests.")).toBe("Run the tests");
    expect(leadTitle("Committed.")).toBe("");
  });
});

describe("Sable 1:1 tool-call grouping & checkpoint flow", () => {
  test("marks reasoning-only turn as thoughtOnly with 0 steps", () => {
    const summary = summarizeTurnWork(
      makeMessage([
        { type: "reasoning", text: "Thinking through the plan", state: "done" },
        { type: "text", text: "Here is the answer." },
      ]),
    );

    expect(summary.hasCollapsible).toBe(true);
    expect(summary.stepCount).toBe(0);
    expect(summary.thoughtOnly).toBe(true);
    expect(summary.changes).toEqual({ files: 0, add: 0, del: 0 });
  });

  test("excludes todo_write from step count, deduplicates it to first slot with latest state, and aggregates file changes", () => {
    const msg = makeMessage([
      toolPart("tool-todo_write", "todo-1", "output-available", {
        todos: [{ content: "step 1", status: "in_progress" }],
      }),
      toolPart("tool-read", "t1", "output-available", {
        filePath: "src/app.ts",
      }),
      toolPart("tool-todo_write", "todo-2", "output-available", {
        todos: [{ content: "step 1", status: "completed" }],
      }),
      toolPart("tool-write", "t2", "output-available", {
        filePath: "src/new.ts",
        content: "a\nb\nc",
      }),
      toolPart("tool-edit", "t3", "input-available", {
        filePath: "src/app.ts",
        oldString: "x\ny\nz",
        newString: "x",
      }),
    ]);

    const summary = summarizeTurnWork(msg);
    expect(summary.stepCount).toBe(3); // read + write + edit (todos excluded)
    expect(summary.thoughtOnly).toBe(false);
    expect(summary.changes).toEqual({ files: 2, add: 3, del: 2 });
    expect(summary.liveLabel).toBe("Editing app.ts");

    const turnFlow = buildAssistantTurnFlow(msg, false);
    const stepsChunk = turnFlow.flow[0];
    expect(stepsChunk?.kind).toBe("steps");
    if (stepsChunk?.kind === "steps") {
      const todoRows = stepsChunk.rows.filter(
        (r) => r.kind === "item" && r.item.kind === "tool" && r.item.isTodo,
      );
      expect(todoRows).toHaveLength(1);
      // Kept at first todo position (index 0) but showing latest todo part (todo-2)
      expect(stepsChunk.rows[0]?.kind).toBe("item");
      if (stepsChunk.rows[0]?.kind === "item") {
        expect(stepsChunk.rows[0].key).toBe("tool:todo-1");
        if (stepsChunk.rows[0].item.kind === "tool") {
          expect(stepsChunk.rows[0].item.part.toolCallId).toBe("todo-2");
        }
      }
    }
  });

  test("groups consecutive look-only explore tools into ExploreRun and breaks out errored tools", () => {
    expect(formatExploreRunLabel(6, 0, 0)).toBe("Read 6 files");
    expect(formatExploreRunLabel(0, 3, 0)).toBe("Searched 3 times");
    expect(formatExploreRunLabel(0, 0, 2)).toBe("Fetched 2 pages");
    expect(formatExploreRunLabel(4, 2, 0)).toBe("Explored 4 files, 2 searches");
    expect(formatExploreRunLabel(2, 1, 1)).toBe(
      "Explored 2 files, 1 search, 1 page",
    );

    const msg = makeMessage([
      toolPart("tool-read", "r1", "output-available", { filePath: "a.ts" }),
      toolPart("tool-read", "r2", "output-available", { filePath: "b.ts" }),
      toolPart("tool-grep", "g1", "output-available", { pattern: "foo" }),
      toolPart(
        "tool-read",
        "r3-err",
        "output-available",
        { filePath: "missing.ts" },
        { success: false, error: "ENOENT" },
      ),
      toolPart("tool-glob", "gl1", "output-available", { pattern: "*.ts" }),
      toolPart("tool-web_fetch", "f1", "output-available", {
        url: "https://example.com",
      }),
    ]);

    const turnFlow = buildAssistantTurnFlow(msg, false);
    const stepsChunk = turnFlow.flow[0];
    expect(stepsChunk?.kind).toBe("steps");
    if (stepsChunk?.kind === "steps") {
      expect(stepsChunk.rows).toHaveLength(3);
      expect(stepsChunk.rows[0]?.kind).toBe("explore-run");
      if (stepsChunk.rows[0]?.kind === "explore-run") {
        expect(stepsChunk.rows[0].items.map((i) => i.part.toolCallId)).toEqual([
          "r1",
          "r2",
          "g1",
        ]);
      }
      // Errored read broke out as its own visible row
      expect(stepsChunk.rows[1]?.kind).toBe("item");
      expect(stepsChunk.rows[2]?.kind).toBe("explore-run");
      if (stepsChunk.rows[2]?.kind === "explore-run") {
        expect(stepsChunk.rows[2].items.map((i) => i.part.toolCallId)).toEqual([
          "gl1",
          "f1",
        ]);
      }
    }
  });

  test("splits multi-checkpoint turns on substantive notes, folds lead-ins into steps, and keeps trailing nods as quiet tail", () => {
    const msg = makeMessage([
      { type: "text", text: "Let me inspect the route first." },
      toolPart("tool-read", "r1", "output-available", {
        filePath: "route.ts",
      }),
      {
        type: "text",
        text: "The handler skips validation when the header is missing.",
      },
      toolPart("tool-edit", "e1", "output-available", {
        filePath: "route.ts",
        oldString: "a",
        newString: "b",
      }),
      {
        type: "text",
        text: "Added strict header validation and verified all unit tests pass.",
      },
      { type: "text", text: "Committed." },
    ]);

    const settled = buildAssistantTurnFlow(msg, false);
    expect(settled.runCount).toBe(2);
    expect(settled.multi).toBe(true);
    expect(settled.totalSteps).toBe(2);
    expect(settled.flow.map((c) => c.kind)).toEqual([
      "steps",
      "text",
      "steps",
      "text",
      "text",
    ]);

    // First text ("The handler skips...") is an intermediate note that folds when settled
    const midNote = settled.flow[1];
    expect(midNote?.kind === "text" && midNote.isNote).toBe(true);
    // Substantive final report is the answer
    const answer = settled.flow[3];
    expect(answer?.kind === "text" && answer.isAnswer && !answer.isNote).toBe(
      true,
    );
    // Trailing "Committed." is kept as a quiet tail nod
    const tailNod = settled.flow[4];
    expect(tailNod?.kind === "text" && tailNod.isTail && !tailNod.isNote).toBe(
      true,
    );
  });

  test("uses current lead-in title while steps run, counts concurrent sub-agents, and goes quiet while streaming prose", () => {
    const withLead = buildAssistantTurnFlow(
      makeMessage([
        { type: "text", text: "Now let me run the test suite.", state: "done" },
        toolPart("tool-bash", "b1", "input-available", { command: "bun test" }),
      ]),
      true,
    );
    expect(withLead.live.title).toBe("Run the test suite");
    expect(withLead.live.quiet).toBe(false);

    const multiSubagents = buildAssistantTurnFlow(
      makeMessage([
        toolPart("tool-task", "s1", "input-available", { task: "Explore UI" }),
        toolPart("tool-task", "s2", "input-available", { task: "Check API" }),
      ]),
      true,
    );
    expect(multiSubagents.live.title).toBe("Running 2 sub-agents");

    const writingProse = buildAssistantTurnFlow(
      makeMessage([
        toolPart("tool-read", "r1", "output-available", { filePath: "a.ts" }),
        {
          type: "text",
          text: "Here is a full explanation of what caused the regression.",
          state: "streaming",
        },
      ]),
      true,
    );
    expect(writingProse.live.quiet).toBe(true);
  });
});
