import { tool } from "ai";
import { z } from "zod";
import {
  buildKillProcessScript,
  buildProcessStatusScript,
} from "@entry-agents/sandbox";
import { getSandboxForCommand } from "./utils";

const processStatusInputSchema = z.object({
  processId: z
    .string()
    .optional()
    .describe(
      "Optional specific background process ID (e.g. cmd_173...) to inspect with detailed logs. Omit to list all registered background processes and listening ports.",
    ),
  tailLines: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Number of trailing log lines to include when inspecting a process (default 30).",
    ),
});

export interface SandboxProcessEntry {
  id: string;
  pid: number | null;
  alive: boolean;
  command: string;
  cwd: string;
  startedAt: number | null;
  logPath: string;
  psInfo?: string;
  recentLogs?: string;
}

export function parseProcessStatusOutput(stdout: string): {
  processes: SandboxProcessEntry[];
  listeningPorts: string[];
} {
  const processes: SandboxProcessEntry[] = [];
  const listeningPorts: string[] = [];

  const [procSection = "", portsSection = ""] = stdout.split("=== PORTS ===");

  const blocks = procSection.split("---ENTRY_PROC---").slice(1);
  for (const block of blocks) {
    const lines = block.split("\n");
    let id = "";
    let pid: number | null = null;
    let alive = false;
    let psInfo: string | undefined;
    let command = "";
    let cwd = "";
    let startedAt: number | null = null;
    let logPath = "";
    const logLines: string[] = [];
    let inLogs = false;

    for (const line of lines) {
      if (line === "LOGS_START") {
        inLogs = true;
        continue;
      }
      if (line === "LOGS_END") {
        inLogs = false;
        continue;
      }
      if (inLogs) {
        logLines.push(line);
        continue;
      }
      if (line.startsWith("ID:")) {
        id = line.slice(3).trim();
      } else if (line.startsWith("PID:")) {
        const raw = line.slice(4).trim();
        const parsed = Number.parseInt(raw, 10);
        pid = Number.isFinite(parsed) ? parsed : null;
      } else if (line.startsWith("ALIVE:")) {
        alive = line.slice(6).trim() === "true";
      } else if (line.startsWith("PS:")) {
        const val = line.slice(3).trim();
        if (val) psInfo = val;
      } else if (line.startsWith("META:")) {
        try {
          const meta = JSON.parse(line.slice(5)) as {
            command?: string;
            cwd?: string;
            startedAt?: number;
            logPath?: string;
          };
          command = meta.command ?? "";
          cwd = meta.cwd ?? "";
          startedAt =
            typeof meta.startedAt === "number" ? meta.startedAt : null;
          logPath = meta.logPath ?? "";
        } catch {
          // Ignore malformed metadata line
        }
      }
    }

    if (id) {
      processes.push({
        id,
        pid,
        alive,
        command,
        cwd,
        startedAt,
        logPath,
        ...(psInfo ? { psInfo } : {}),
        ...(logLines.length > 0 ? { recentLogs: logLines.join("\n") } : {}),
      });
    }
  }

  for (const rawLine of portsSection.split("\n")) {
    const trimmed = rawLine.trim();
    if (trimmed) {
      listeningPorts.push(trimmed);
    }
  }

  return { processes, listeningPorts };
}

export const processStatusTool = tool({
  description:
    "Inspect durable background processes started with bash(detached: true) in this sandbox, check if they are alive, tail their logs, and list listening TCP ports.",
  inputSchema: processStatusInputSchema,
  execute: async ({ processId, tailLines }, { experimental_context }) => {
    const { sandbox } = await getSandboxForCommand(experimental_context);
    const script = buildProcessStatusScript(processId, tailLines ?? 30);
    const result = await sandbox.exec(script, sandbox.workingDirectory, 15_000);
    const parsed = parseProcessStatusOutput(result.stdout);
    return {
      success: result.success,
      processes: parsed.processes,
      listeningPorts: parsed.listeningPorts,
      ...(result.stderr ? { stderr: result.stderr } : {}),
    };
  },
});

const killProcessInputSchema = z.object({
  target: z
    .string()
    .min(1)
    .describe(
      "Background process ID (e.g. cmd_173...) or numeric PID to terminate cleanly (SIGTERM -> SIGKILL).",
    ),
});

export const killProcessTool = tool({
  description:
    "Terminate a running background process (and its process group) by processId or numeric PID.",
  inputSchema: killProcessInputSchema,
  execute: async ({ target }, { experimental_context }) => {
    const { sandbox } = await getSandboxForCommand(experimental_context);
    const script = buildKillProcessScript(target);
    const result = await sandbox.exec(script, sandbox.workingDirectory, 15_000);
    const output = result.stdout.trim();
    const status = output.split(":")[0] || (result.success ? "OK" : "ERROR");
    return {
      success: result.success,
      target,
      status,
      output,
      ...(result.stderr ? { stderr: result.stderr } : {}),
    };
  },
});
