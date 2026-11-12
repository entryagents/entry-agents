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
  Telescope,
  Terminal,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { extractRenderState, getToolName } from "@/app/lib/render-tool";
import type { WebAgentUIToolPart } from "@/app/types";
import { DEFAULT_WORKING_DIRECTORY } from "@/lib/sandbox/config";
import { ToolLayout } from "../tool-call/tool-layout";
import { BashRenderer } from "../tool-call/renderers/bash-renderer";
import { ReadRenderer } from "../tool-call/renderers/read-renderer";
import { WriteRenderer } from "../tool-call/renderers/write-renderer";
import { EditRenderer } from "../tool-call/renderers/edit-renderer";
import { GlobRenderer } from "../tool-call/renderers/glob-renderer";
import { GrepRenderer } from "../tool-call/renderers/grep-renderer";
import { TodoRenderer } from "../tool-call/renderers/todo-renderer";
import { AskUserQuestionRenderer } from "../tool-call/renderers/ask-user-question-renderer";
import { FetchRenderer } from "../tool-call/renderers/fetch-renderer";
import { SkillRenderer } from "../tool-call/renderers/skill-renderer";

const TOOL_ICON_CLASS = "h-3.5 w-3.5";

function getToolMeta(toolName: string): {
  displayName: string;
  icon?: ReactNode;
} {
  switch (toolName) {
    case "bash":
      return {
        displayName: "Bash",
        icon: <Terminal className={TOOL_ICON_CLASS} />,
      };
    case "read":
      return {
        displayName: "Read",
        icon: <FileText className={TOOL_ICON_CLASS} />,
      };
    case "write":
      return {
        displayName: "Create",
        icon: <FilePlus className={TOOL_ICON_CLASS} />,
      };
    case "edit":
      return {
        displayName: "Update",
        icon: <Pencil className={TOOL_ICON_CLASS} />,
      };
    case "grep":
      return {
        displayName: "Grep",
        icon: <Search className={TOOL_ICON_CLASS} />,
      };
    case "glob":
      return {
        displayName: "Glob",
        icon: <FolderSearch className={TOOL_ICON_CLASS} />,
      };
    case "web_fetch":
      return {
        displayName: "Fetch",
        icon: <Globe className={TOOL_ICON_CLASS} />,
      };
    case "skill":
      return {
        displayName: "Skill",
        icon: <Zap className={TOOL_ICON_CLASS} />,
      };
    case "task":
      return {
        displayName: "Task",
        icon: <Telescope className={TOOL_ICON_CLASS} />,
      };
    default: {
      const name = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      return { displayName: name };
    }
  }
}

function getToolSummary(name: string, input: unknown): string {
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
    default:
      return "";
  }
}

const IDLE_STATE: ToolRenderState = {
  running: false,
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
    case "tool-skill":
      return <SkillRenderer part={part} state={state} />;
    default: {
      const toolName = getToolName(part);
      const name = toolName.charAt(0).toUpperCase() + toolName.slice(1);
      const input = part.input as Record<string, unknown> | undefined;
      const summary = input ? JSON.stringify(input).slice(0, 40) : "...";
      return (
        <ToolLayout
          name={name}
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
  const meta = getToolMeta(pending.name);
  const summary = getToolSummary(pending.name, pending.input);

  return (
    <ToolLayout
      name={meta.displayName}
      icon={meta.icon}
      summary={summary}
      summaryClassName="font-mono"
      state={IDLE_STATE}
    />
  );
}
