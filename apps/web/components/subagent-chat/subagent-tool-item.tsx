"use client";

import type { TaskPendingToolCall } from "@entry-agents/agent";
import { toRelativePath } from "@entry-agents/shared";
import type { ToolRenderState } from "@entry-agents/shared/lib/tool-state";
import {
  FilePlus,
  FileText,
  FolderSearch,
  Globe,
  Pencil,
  Search,
  Share2,
  Telescope,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import { extractRenderState, getToolName } from "@/app/lib/render-tool";
import type { WebAgentUIToolPart } from "@/app/types";
import { DEFAULT_WORKING_DIRECTORY } from "@/lib/sandbox/config";
import { ToolLayout } from "../tool-call/tool-layout";
import { AskUserQuestionRenderer } from "../tool-call/renderers/ask-user-question-renderer";
import { BashRenderer } from "../tool-call/renderers/bash-renderer";
import { BrandToolRenderer } from "../tool-call/renderers/brand-tool-renderer";
import { EditRenderer } from "../tool-call/renderers/edit-renderer";
import { FetchRenderer } from "../tool-call/renderers/fetch-renderer";
import { GlobRenderer } from "../tool-call/renderers/glob-renderer";
import { GrepRenderer } from "../tool-call/renderers/grep-renderer";
import {
  isMcpOrBridgeTool,
  McpRenderer,
} from "../tool-call/renderers/mcp-renderer";
import { ReadRenderer } from "../tool-call/renderers/read-renderer";
import { SearchRenderer } from "../tool-call/renderers/search-renderer";
import { SkillRenderer } from "../tool-call/renderers/skill-renderer";
import { TeamBoardRenderer } from "../tool-call/renderers/team-board-renderer";
import { TodoRenderer } from "../tool-call/renderers/todo-renderer";
import { WriteRenderer } from "../tool-call/renderers/write-renderer";

const TOOL_ICON_CLASS = "h-3.5 w-3.5";

export function getSubagentRoleTag(subagentType: string | undefined): string {
  switch (subagentType) {
    case "architect":
    case "executor":
    case "design":
    case "explorer":
    case "reviewer":
      return subagentType;
    default:
      return subagentType ? subagentType.toLowerCase() : "subagent";
  }
}

export function getSubagentToolMeta(toolName: string): {
  displayName: string;
  icon?: ReactNode;
} {
  switch (toolName) {
    case "bash":
      return {
        displayName: "bash",
        icon: <Terminal className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "read":
      return {
        displayName: "read",
        icon: <FileText className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "write":
      return {
        displayName: "write",
        icon: <FilePlus className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "edit":
      return {
        displayName: "edit",
        icon: <Pencil className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "grep":
      return {
        displayName: "grep",
        icon: <Search className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "glob":
      return {
        displayName: "glob",
        icon: <FolderSearch className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "web_fetch":
      return {
        displayName: "fetch",
        icon: <Globe className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "web_search":
      return {
        displayName: "search",
        icon: <Search className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "skill":
      return {
        displayName: "skill",
        icon: <Terminal className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "team_board":
      return {
        displayName: "team_board",
        icon: <Share2 className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    case "task":
      return {
        displayName: "task",
        icon: <Telescope className={TOOL_ICON_CLASS} strokeWidth={1.5} />,
      };
    default:
      return { displayName: toolName };
  }
}

export function getSubagentToolSummary(name: string, input: unknown): string {
  const inp = input as Record<string, unknown> | undefined;
  if (!inp) return "";
  switch (name) {
    case "read":
    case "write":
    case "edit": {
      const fp = inp.filePath ?? "";
      return fp ? toRelativePath(String(fp), DEFAULT_WORKING_DIRECTORY) : "";
    }
    case "grep":
    case "glob":
      return inp.pattern ? `'${inp.pattern}'` : "";
    case "bash":
      return inp.command ? String(inp.command) : "";
    case "web_fetch":
      return inp.url ? String(inp.url) : "";
    case "web_search":
      return inp.query ? String(inp.query) : "";
    case "team_board":
      return inp.action ? String(inp.action) : "";
    default:
      return "";
  }
}

const LIVE_STEP_STATE: ToolRenderState = {
  running: true,
  interrupted: false,
  denied: false,
  approvalRequested: false,
  isActiveApproval: false,
};

export function SubagentToolItem({ part }: { part: WebAgentUIToolPart }) {
  const state = extractRenderState(part, null, false);
  const cwd = DEFAULT_WORKING_DIRECTORY;

  switch (part.type) {
    case "tool-bash":
      return <BashRenderer part={part} state={state} />;
    case "tool-read":
      return <ReadRenderer part={part} state={state} cwd={cwd} />;
    case "tool-write":
      return <WriteRenderer part={part} state={state} cwd={cwd} />;
    case "tool-edit":
      return <EditRenderer part={part} state={state} cwd={cwd} />;
    case "tool-glob":
      return <GlobRenderer part={part} state={state} />;
    case "tool-grep":
      return <GrepRenderer part={part} state={state} />;
    case "tool-todo_write":
      return <TodoRenderer part={part} state={state} />;
    case "tool-ask_user_question":
      return <AskUserQuestionRenderer part={part} state={state} />;
    case "tool-web_fetch":
      return <FetchRenderer part={part} state={state} />;
    case "tool-web_search":
      return <SearchRenderer part={part} state={state} />;
    case "tool-skill":
      return <SkillRenderer part={part} state={state} />;
    case "tool-team_board":
      return <TeamBoardRenderer part={part} state={state} />;
    case "tool-github_cli":
    case "tool-vercel_cli":
    case "tool-vercel_api":
      return <BrandToolRenderer part={part} state={state} />;
    default: {
      const toolName = getToolName(part);
      if (isMcpOrBridgeTool(toolName)) {
        return <McpRenderer part={part} state={state} toolName={toolName} />;
      }
      const input = part.input as Record<string, unknown> | undefined;
      const summary = input ? JSON.stringify(input).slice(0, 48) : "...";
      return (
        <ToolLayout
          name={toolName}
          summary={summary}
          summaryClassName="font-mono"
          meta={part.state === "output-available" ? "Done" : undefined}
          state={state}
        />
      );
    }
  }
}

export function PendingSubagentToolItem({
  pending,
}: {
  pending: TaskPendingToolCall;
}) {
  const meta = getSubagentToolMeta(pending.name);
  const summary = getSubagentToolSummary(pending.name, pending.input);

  return (
    <ToolLayout
      name={meta.displayName}
      icon={meta.icon}
      summary={summary}
      summaryClassName="font-mono"
      state={LIVE_STEP_STATE}
    />
  );
}
