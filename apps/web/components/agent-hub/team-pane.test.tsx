import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { WebAgentUIMessage } from "@/app/types";
import { InlineTeamTimeline } from "@/components/chat/inline-team-timeline";
import type { ModelOption } from "@/lib/model-options";
import {
  getTeamRoleModelsSnapshot,
  setTeamRoleModelPin,
  subscribeTeamRoleModels,
} from "@/lib/team/role-models-store";
import { AgentHubButton } from "./agent-hub-button";
import { TeamPane } from "./team-pane";

const SAMPLE_MODELS: ModelOption[] = [
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    shortLabel: "GPT-5.6 Luna",
    provider: "openai",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    shortLabel: "Claude Sonnet 4.6",
    provider: "anthropic",
  },
  {
    id: "google/gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    shortLabel: "Gemini 3.5 Flash",
    provider: "google",
  },
];

const SAMPLE_MESSAGES: WebAgentUIMessage[] = [
  {
    id: "msg_team_ssr",
    role: "assistant",
    parts: [
      {
        type: "tool-team_board",
        toolCallId: "tb_1",
        state: "output-available",
        input: { action: "upsert_tasks" },
        output: {
          action: "upsert_tasks",
          teamSnapshot: {
            teamId: "sess_1",
            entries: [
              {
                id: "entry_contract",
                kind: "contract",
                authorRole: "architect",
                targetRole: "executor",
                title: "Lock TeamPane props contract",
                content:
                  "Expose teamRoleModels and updateTeamRoleModel on context.",
                createdAt: 100,
              },
              {
                id: "entry_challenge",
                kind: "challenge",
                authorRole: "reviewer",
                targetRole: "executor",
                title: "Check 1024px drawer handoff",
                content: "Confirm @design aligns Sheet width below 1024px.",
                mentions: ["executor", "design"],
                files: ["apps/web/components/agent-hub/agent-hub-button.tsx"],
                createdAt: 200,
              },
              {
                id: "entry_debate",
                kind: "debate",
                authorRole: "executor",
                targetRole: "reviewer",
                title: "Imperative media query avoids SSR mismatch",
                content:
                  "Check matchMedia inside click handler instead of render.",
                createdAt: 300,
              },
            ],
            tasks: [
              {
                id: "T1",
                title: "Lock TeamPane contract",
                assignedRole: "architect",
                status: "completed",
                files: ["apps/web/components/agent-hub/team-pane.tsx"],
                updatedBy: "architect",
                updatedAt: 150,
              },
              {
                id: "T2",
                title: "Build TeamPane and InlineTeamTimeline",
                assignedRole: "executor",
                status: "in_progress",
                dependsOn: ["T1"],
                files: ["apps/web/components/agent-hub/team-pane.tsx"],
                worktreeBranch: "team/executor-call1234",
                updatedBy: "executor",
                updatedAt: 250,
              },
              {
                id: "T3",
                title: "Deferred animation experiment",
                assignedRole: "design",
                status: "parked",
                dependsOn: ["T1"],
                files: ["apps/web/components/agent-hub/team-pane.tsx"],
                updatedBy: "architect",
                updatedAt: 260,
              },
            ],
          },
        },
      },
      {
        type: "tool-task",
        toolCallId: "call12345678",
        state: "output-available",
        preliminary: true,
        input: {
          subagentType: "executor",
          task: "Implement docked /team pane",
        },
        output: {
          startedAt: Date.now() - 8000,
          modelId: "anthropic/claude-sonnet-4-6",
          toolCallCount: 4,
          worktreeBranch: "team/executor-call1234",
          usage: {
            inputTokens: 3200,
            cachedInputTokens: 2400,
            outputTokens: 210,
          },
        },
      },
      {
        type: "tool-task",
        toolCallId: "call99887766",
        state: "output-available",
        preliminary: false,
        input: {
          subagentType: "reviewer",
          task: "Audit responsive breakpoints",
        },
        output: {
          startedAt: 1_700_000_000_000,
          completedAt: 1_700_000_005_000,
          modelId: "google/gemini-3.5-flash",
          toolCallCount: 2,
          usage: {
            inputTokens: 1800,
            cachedInputTokens: 900,
            outputTokens: 120,
          },
        },
      },
    ] as WebAgentUIMessage["parts"],
  },
];

describe("TeamPane, InlineTeamTimeline, AgentHubButton & role-models-store", () => {
  test("TeamPane renders /team board with challenges/contracts/debates and zero swarm naming", () => {
    const html = renderToStaticMarkup(
      <TeamPane
        initialTab="board"
        messages={SAMPLE_MESSAGES}
        defaultModelId="anthropic/claude-sonnet-4-6"
        teamRoleModels={{ architect: "anthropic/claude-sonnet-4-6" }}
        onUpdateRoleModel={() => {}}
        modelOptions={SAMPLE_MODELS}
      />,
    );

    expect(html).toContain("/team");
    expect(html).toContain("Board");
    expect(html).toContain("Members");
    expect(html).toContain("Graph");
    expect(html).toContain("Lock TeamPane props contract");
    expect(html).toContain("Check 1024px drawer handoff");
    expect(html).toContain("@design");
    expect(html.toLowerCase()).not.toContain("swarm");
  });

  test("TeamPane Members tab renders per-role selects and clamps options when free-tier locked", () => {
    const html = renderToStaticMarkup(
      <TeamPane
        initialTab="members"
        messages={SAMPLE_MESSAGES}
        defaultModelId="openai/gpt-5.6-luna"
        teamRoleModels={{ executor: "openai/gpt-5.6-luna" }}
        onUpdateRoleModel={() => {}}
        modelOptions={SAMPLE_MODELS}
        isFreeTierLocked={true}
        freePlanModelId="openai/gpt-5.6-luna"
        freeTierAllowedModelIds={["openai/gpt-5.6-luna"]}
        onSelectMember={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Model for Architect"');
    expect(html).toContain('aria-label="Model for Executor"');
    expect(html).toContain('aria-label="Model for Reviewer"');
    expect(html).toContain("GPT-5.6 Luna");
    expect(html).not.toContain("Claude Sonnet 4.6");
    expect(html).toContain("team/executor-call1234");
    expect(html).toContain("Inspect trace");
  });

  test("TeamPane Graph tab renders Wave scrubber and parked task badges", () => {
    const html = renderToStaticMarkup(
      <TeamPane
        initialTab="graph"
        messages={SAMPLE_MESSAGES}
        teamRoleModels={{}}
        onUpdateRoleModel={() => {}}
        modelOptions={SAMPLE_MODELS}
      />,
    );

    expect(html).toContain("Wave scrubber");
    expect(html).toContain("Wave 1");
    expect(html).toContain("Wave 2");
    expect(html).toContain("Parked");
  });

  test("InlineTeamTimeline uses flush hairline lanes instead of 2-column cards", () => {
    const html = renderToStaticMarkup(
      <InlineTeamTimeline
        message={SAMPLE_MESSAGES[0]!}
        isStreaming={true}
        onOpenSubagentTab={() => {}}
      />,
    );

    expect(html).toContain("Team execution");
    expect(html).toContain("/team");
    expect(html).toContain("divide-y divide-border/70");
    expect(html).toContain("@executor");
    expect(html).toContain("@reviewer");
    expect(html).toContain("team/executor-call1234");
    expect(html).toContain("Teammate comms &amp; handoffs");
    expect(html).toContain("Shared task wave board");
    expect(html).toContain("Parked");
    expect(html).not.toContain("grid-cols-1 gap-3 md:grid-cols-2");
    expect(html.toLowerCase()).not.toContain("swarm");
  });

  test("AgentHubButton renders clean Team trigger label without swarm terminology", () => {
    const html = renderToStaticMarkup(
      <AgentHubButton
        messages={SAMPLE_MESSAGES}
        isDesktopTeamPaneOpen={false}
        onToggleDesktopTeamPane={() => {}}
        teamRoleModels={{ architect: "anthropic/claude-sonnet-4-6" }}
        onUpdateRoleModel={() => {}}
        modelOptions={SAMPLE_MODELS}
      />,
    );

    expect(html).toContain("Team");
    expect(html).toContain("1/2");
    expect(html.toLowerCase()).not.toContain("swarm");
  });

  test("role-models-store notifies subscribers on pin/unpin and ignores unknown roles", () => {
    const chatId = `chat_store_${Date.now()}`;
    let notifications = 0;
    const unsubscribe = subscribeTeamRoleModels(chatId, () => {
      notifications += 1;
    });

    expect(getTeamRoleModelsSnapshot(chatId)).toEqual({});
    setTeamRoleModelPin(chatId, "architect", "claude-sonnet-4-6");
    expect(getTeamRoleModelsSnapshot(chatId)).toEqual({
      architect: "claude-sonnet-4-6",
    });
    expect(notifications).toBe(1);

    setTeamRoleModelPin(chatId, "unknown_role", "gpt-5.3");
    expect(getTeamRoleModelsSnapshot(chatId)).toEqual({
      architect: "claude-sonnet-4-6",
    });
    expect(notifications).toBe(1);

    setTeamRoleModelPin(chatId, "architect", null);
    expect(getTeamRoleModelsSnapshot(chatId)).toEqual({});
    expect(notifications).toBe(2);

    unsubscribe();
  });
});
