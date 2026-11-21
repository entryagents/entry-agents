import { isToolUIPart } from "ai";
import type { WebAgentUIMessage, WebAgentUIMessagePart } from "@/app/types";
import {
  getProviderDisplayName,
  getProviderFromModelId,
} from "@/components/provider-icons";

export interface ChatMarkdownMeta {
  title: string;
  modelId?: string | null;
  repoName?: string | null;
  repoOwner?: string | null;
  branch?: string | null;
  createdAt?: Date | string | number | null;
}

export interface ChatMarkdownOptions {
  locale?: string;
  timeZone?: string;
  agentName?: (modelId: string) => string;
}

type FileTally = {
  add: number;
  del: number;
  created: boolean;
  deleted: boolean;
};

type TurnSummary = {
  lines: string[];
  files: Map<string, FileTally>;
  counts: {
    read: number;
    search: number;
    fetch: number;
    other: number;
  };
  steps: number;
};

const newTurn = (): TurnSummary => ({
  lines: [],
  files: new Map(),
  counts: { read: 0, search: 0, fetch: 0, other: 0 },
  steps: 0,
});

function body(s: string): string {
  return s.trim().replace(/\n{3,}/g, "\n\n");
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function inlineCode(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (!flat) return "``";
  const runs = flat.match(/`+/g);
  const fence = "`".repeat(
    (runs ? Math.max(...runs.map((r) => r.length)) : 0) + 1,
  );
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

function defaultAgentName(modelId: string): string {
  if (!modelId) return "Assistant";
  const provider = getProviderFromModelId(modelId);
  if (provider && provider !== "unknown") {
    return getProviderDisplayName(provider);
  }
  const slashIdx = modelId.indexOf("/");
  return slashIdx >= 0 ? modelId.slice(slashIdx + 1) : modelId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(obj: Record<string, unknown> | null, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v.trim() : "";
}

function getToolName(part: WebAgentUIMessagePart): string {
  if (part.type === "dynamic-tool") {
    return part.toolName;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return "";
}

function stepsBlock(t: TurnSummary): string {
  if (t.steps === 0) return "";
  const out = [...t.lines];
  for (const [p, f] of t.files) {
    const counts = [f.add ? `+${f.add}` : "", f.del ? `−${f.del}` : ""]
      .filter(Boolean)
      .join(" ");
    const verb = f.deleted ? "Deleted" : f.created ? "Created" : "Changed";
    out.push(`- ${verb} ${inlineCode(p)}${counts ? `: ${counts}` : ""}`);
  }
  const c = t.counts;
  const also = [
    c.read ? `read ${plural(c.read, "file")}` : "",
    c.search ? `searched ${plural(c.search, "time")}` : "",
    c.fetch ? `fetched ${plural(c.fetch, "page")}` : "",
    c.other ? plural(c.other, "other step") : "",
  ].filter(Boolean);
  if (also.length > 0) {
    const words =
      also.length > 1
        ? `${also.slice(0, -1).join(", ")} and ${also[also.length - 1]}`
        : also[0];
    const sentence = out.length
      ? `Also ${words}`
      : `${words[0].toUpperCase()}${words.slice(1)}`;
    out.push(`- ${sentence}`);
  }
  const head = `**Steps** (${t.steps})`;
  return [head, "", ...out].join("\n");
}

function isSlashCommand(text: string): boolean {
  return /^\/[a-zA-Z0-9_-]+(?:\s|$)/.test(text.trim());
}

function getCompactionFlag(m: WebAgentUIMessage): boolean {
  const meta = asRecord(m.metadata);
  return meta?.isCompactionNotice === true;
}

/**
 * Sanitize a session title into a safe `.md` download filename,
 * matching Sable's `markdownFilename` convention.
 */
export function markdownFilename(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  const slug = (cleaned || "chat")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "chat"}.md`;
}

/**
 * Render an Entry chat session's `WebAgentUIMessage[]` timeline into clean
 * readable Markdown matching Sable's `chatMarkdown` format.
 */
export function chatMarkdown(
  meta: ChatMarkdownMeta,
  messages: WebAgentUIMessage[],
  opts: ChatMarkdownOptions = {},
): string {
  const agentName = opts.agentName ?? defaultAgentName;
  const baseModelId = meta.modelId ?? "";
  let currentModelId = baseModelId;

  // Detect the initial model from the first assistant message if available
  const firstAssistant = messages.find(
    (m) => m.role === "assistant" && !getCompactionFlag(m),
  );
  const firstMeta = asRecord(firstAssistant?.metadata);
  const firstModelId =
    readString(firstMeta, "modelId") ||
    readString(firstMeta, "selectedModelId") ||
    baseModelId;
  if (firstModelId) {
    currentModelId = firstModelId;
  }

  const parsedDate = meta.createdAt ? new Date(meta.createdAt) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const date = safeDate.toLocaleDateString(opts.locale ?? "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  });

  const about = [
    agentName(currentModelId),
    meta.repoName || "",
    meta.branch || "",
    date,
  ]
    .filter(Boolean)
    .join(" · ");

  const blocks: string[] = [
    `# ${meta.title.replace(/\s+/g, " ").trim() || "Chat"}`,
    about,
  ];

  let turn = newTurn();
  let speaking = false;

  const speak = (modelId: string) => {
    const targetName = agentName(modelId || currentModelId);
    if (!speaking) {
      blocks.push(`## ${targetName}`);
      speaking = true;
    }
  };

  const endTurn = () => {
    const b = stepsBlock(turn);
    if (b) blocks.push(b);
    turn = newTurn();
  };

  for (const m of messages) {
    if (m.role === "user") {
      endTurn();
      const textParts: string[] = [];
      const attachmentNames: string[] = [];

      for (const part of m.parts) {
        if (part.type === "text") {
          const t = body(part.text);
          if (t) textParts.push(t);
        } else if (part.type === "file") {
          const name = part.filename?.trim() || "attachment";
          attachmentNames.push(name);
        }
      }

      const combinedText = body(textParts.join("\n\n"));
      if (!combinedText && attachmentNames.length === 0) continue;

      const lines = ["## You"];
      if (combinedText) {
        lines.push(
          isSlashCommand(combinedText) && !combinedText.includes("\n")
            ? inlineCode(combinedText)
            : combinedText,
        );
      }
      if (attachmentNames.length > 0) {
        lines.push(`_Attached: ${attachmentNames.join(", ")}_`);
      }
      blocks.push(lines.join("\n\n"));
      speaking = false;
      continue;
    }

    if (m.role !== "assistant") continue;

    if (getCompactionFlag(m)) {
      endTurn();
      const noticeText = m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text.trim())
        .filter(Boolean)
        .join(" ");
      blocks.push(`> ${noticeText || "Context compacted"}`);
      speaking = false;
      continue;
    }

    const msgMeta = asRecord(m.metadata);
    const msgModelId =
      readString(msgMeta, "modelId") ||
      readString(msgMeta, "selectedModelId") ||
      currentModelId;

    if (
      msgModelId &&
      currentModelId &&
      agentName(msgModelId) !== agentName(currentModelId)
    ) {
      endTurn();
      currentModelId = msgModelId;
      blocks.push(`> Switched to ${agentName(msgModelId)}`);
      speaking = false;
    } else if (msgModelId) {
      currentModelId = msgModelId;
    }

    for (const part of m.parts) {
      if (part.type === "text") {
        const text = body(part.text);
        if (!text) continue;
        speak(currentModelId);
        blocks.push(text);
        continue;
      }

      if (part.type === "reasoning" || part.type === "step-start") {
        continue;
      }

      if (isToolUIPart(part)) {
        const toolName = getToolName(part).toLowerCase();
        const input = asRecord("input" in part ? part.input : null);
        const output = asRecord("output" in part ? part.output : null);
        const state = "state" in part ? String(part.state) : "";
        const failed = state === "output-error";

        if (toolName === "create_plan" || toolName === "exit_plan_mode") {
          const planText =
            readString(input, "plan") ||
            readString(input, "content") ||
            readString(output, "plan");
          if (planText) {
            speak(currentModelId);
            blocks.push(`**Plan**\n\n${body(planText)}`);
          }
          continue;
        }

        if (
          toolName === "ask_user_question" ||
          toolName === "askuserquestion"
        ) {
          const questions = Array.isArray(input?.questions)
            ? input.questions
            : [];
          const answers = asRecord(output?.answers);
          for (const qItem of questions) {
            const qRec = asRecord(qItem);
            const qText = readString(qRec, "question");
            if (!qText) continue;
            speak(currentModelId);
            const rawAns = answers?.[qText];
            const ansList = Array.isArray(rawAns)
              ? rawAns.map(String).filter(Boolean)
              : typeof rawAns === "string" && rawAns
                ? [rawAns]
                : [];
            blocks.push(
              `> ${qText}${ansList.length ? `\n>\n> Answer: ${ansList.join(", ")}` : ""}`,
            );
          }
          continue;
        }

        if (toolName === "todo_write" || toolName === "todowrite") {
          continue;
        }

        turn.steps++;

        if (toolName === "bash" || toolName === "execute_command") {
          const cmd =
            readString(input, "command") || readString(input, "cmd") || "bash";
          const outcome = failed ? "failed" : "completed";
          turn.lines.push(`- Ran ${inlineCode(cmd)}: ${outcome}`);
        } else if (
          toolName === "edit" ||
          toolName === "write" ||
          toolName === "multi_edit" ||
          toolName === "edit_file" ||
          toolName === "write_file"
        ) {
          const filePath =
            readString(input, "file_path") ||
            readString(input, "path") ||
            readString(input, "target_file");
          if (filePath && !failed) {
            const existing = turn.files.get(filePath) ?? {
              add: 0,
              del: 0,
              created: toolName.startsWith("write"),
              deleted: false,
            };
            turn.files.set(filePath, existing);
          } else {
            turn.counts.other++;
          }
        } else if (
          toolName === "subagent" ||
          toolName === "task" ||
          toolName === "spawn_agent"
        ) {
          const desc =
            readString(input, "description") ||
            readString(input, "task") ||
            readString(input, "subagent_type") ||
            "Subagent";
          turn.lines.push(`- Agent: ${desc.replace(/\s+/g, " ").trim()}`);
        } else if (toolName === "skill" || toolName === "read_skill") {
          const skillName =
            readString(input, "skill") || readString(input, "name") || "skill";
          turn.lines.push(`- Skill: ${skillName}`);
        } else if (
          toolName === "read" ||
          toolName === "read_file" ||
          toolName === "view_file"
        ) {
          turn.counts.read++;
        } else if (
          toolName === "grep" ||
          toolName === "glob" ||
          toolName === "search" ||
          toolName === "web_search"
        ) {
          turn.counts.search++;
        } else if (toolName === "web_fetch" || toolName === "fetch") {
          turn.counts.fetch++;
        } else {
          turn.counts.other++;
        }
      }
    }

    const turnError = readString(msgMeta, "turnError");
    if (turnError) {
      blocks.push(`> Error: ${turnError.replace(/\s+/g, " ").trim()}`);
    }
    endTurn();
  }

  endTurn();
  return `${blocks
    .map((b) => body(b))
    .filter(Boolean)
    .join("\n\n")}\n`;
}
