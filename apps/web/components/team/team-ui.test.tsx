import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { WebAgentUIMessage } from "@/app/types";
import { TaskRenderer } from "@/components/tool-call/renderers/task-renderer";
import { SubagentThreadView } from "./subagent-thread-view";
import { TeamStatusButton } from "./team-status-button";
import { TeamWorkspace } from "./team-workspace";

const SAMPLE_MESSAGES: WebAgentUIMessage[] = [
  {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "/team audit auth and build UI" }],
  },
  {
    id: "m2",
    role: "assistant",
    parts: [
      {
        type: "tool-task",
        toolCallId: "tc-arch-1",
        state: "output-available",
        preliminary: true,
        input: {
          subagentType: "architect",
          task: "Design auth contracts",
          instructions: "Inspect auth.ts and define the session contract.",
        },
        output: {
          status: "running",
          sessionId: "sub-arch-1",
          streamedText: "Checking session contract...",
          startedAt: Date.now() - 3000,
          executedTools: [
            {
              toolCallId: "inner-1",
              name: "read",
              input: { filePath: "apps/web/lib/auth/config.ts" },
              output: "ok",
            },
          ],
        },
      },
      {
        type: "tool-task",
        toolCallId: "tc-rev-1",
        state: "output-available",
        preliminary: false,
        input: {
          subagentType: "reviewer",
          task: "Verify test suite",
          instructions: "Run auth tests and report.",
        },
        output: {
          status: "completed",
          sessionId: "sub-rev-1",
          startedAt: Date.now() - 8000,
          completedAt: Date.now() - 1000,
          final: [
            {
              role: "assistant",
              content: [{ type: "text", text: "All 12 auth tests passed." }],
            },
          ],
        },
      },
    ],
  },
];

describe("Team & Subagent UI", () => {
  test("TaskRenderer renders only the subagent name in a dense inline row", () => {
    const part = SAMPLE_MESSAGES[1]!.parts[0] as Extract<
      WebAgentUIMessage["parts"][number],
      { type: "tool-task" }
    >;
    const html = renderToStaticMarkup(
      <TaskRenderer
        part={part}
        state={{
          running: true,
          interrupted: false,
          denied: false,
          approvalRequested: false,
          isActiveApproval: false,
        }}
      />,
    );

    expect(html).toContain("Architect");
    expect(html).not.toContain("Design auth contracts");
    expect(html).not.toContain("Team execution");
  });

  test("SubagentThreadView renders 1:1 main-chat feed for a clicked subagent", () => {
    const html = renderToStaticMarkup(
      <SubagentThreadView
        subagentId="tc-rev-1"
        messages={SAMPLE_MESSAGES}
        onClose={() => {}}
      />,
    );

    expect(html).toContain("Reviewer");
    expect(html).toContain("Run auth tests and report.");
    expect(html).toContain("All 12 auth tests passed.");
  });

  test("TeamStatusButton and TeamWorkspace show running count and subagents", () => {
    const btnHtml = renderToStaticMarkup(
      <TeamStatusButton
        messages={SAMPLE_MESSAGES}
        onSelectSubagent={() => {}}
      />,
    );
    expect(btnHtml).toContain("1 running");

    const wsHtml = renderToStaticMarkup(
      <TeamWorkspace
        messages={SAMPLE_MESSAGES}
        onSelectSubagent={() => {}}
        onClose={() => {}}
      />,
    );
    expect(wsHtml).toContain("1 running");
    expect(wsHtml).toContain("Architect");
    expect(wsHtml).toContain("Reviewer");
    expect(wsHtml.toLowerCase()).not.toContain("swarm");
  });
});
