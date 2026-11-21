import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { WebAgentUIMessage } from "@/app/types";
import { WorkspaceAgentsTab } from "./workspace-agents-tab";

const MESSAGES: WebAgentUIMessage[] = [
  {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Audit the auth routes and UI" }],
  },
  {
    id: "a1",
    role: "assistant",
    parts: [
      {
        type: "tool-task",
        toolCallId: "tc-run-1",
        state: "output-available",
        preliminary: true,
        input: {
          subagentType: "architect",
          task: "Inspect auth middleware",
          instructions: "Check cookie validation paths.",
        },
        output: {
          status: "running",
          startedAt: Date.now() - 4000,
          pending: { name: "read", input: { file_path: "auth.ts" } },
        },
      },
      {
        type: "tool-task",
        toolCallId: "tc-done-1",
        state: "output-available",
        preliminary: false,
        input: {
          subagentType: "reviewer",
          task: "Verify test suite",
          instructions: "Run auth tests.",
        },
        output: {
          status: "completed",
          startedAt: Date.now() - 12000,
          completedAt: Date.now() - 2000,
          final: [
            {
              role: "assistant",
              content: [{ type: "text", text: "All tests pass." }],
            },
          ],
        },
      },
    ],
  },
];

describe("WorkspaceAgentsTab (1:1 Sable AgentsTab)", () => {
  test("renders calm empty state when no agents have run", () => {
    const html = renderToStaticMarkup(
      <WorkspaceAgentsTab
        messages={[]}
        isParentStreaming={false}
        defaultModelId="anthropic/claude-sonnet-4"
        teamRoleModels={{}}
        onUpdateRoleModel={() => {}}
        modelOptions={[]}
        isFreeTierLocked={false}
        freePlanModelId=""
        freeTierAllowedModelIds={[]}
        onSelectSubagent={() => {}}
        onStopRun={() => {}}
      />,
    );
    expect(html).toContain("No agents in this session yet.");
  });

  test("renders two-tier live cards and done rows with 1 running count", () => {
    const html = renderToStaticMarkup(
      <WorkspaceAgentsTab
        messages={MESSAGES}
        isParentStreaming
        defaultModelId="anthropic/claude-sonnet-4"
        teamRoleModels={{}}
        onUpdateRoleModel={() => {}}
        modelOptions={[]}
        isFreeTierLocked={false}
        freePlanModelId=""
        freeTierAllowedModelIds={[]}
        onSelectSubagent={() => {}}
        onStopRun={() => {}}
      />,
    );
    expect(html).toContain("1 running");
    expect(html).toContain("Inspect auth middleware");
    expect(html).toContain("Running read");
    expect(html).toContain("Verify test suite");
    expect(html).toContain("Done");
  });
});
