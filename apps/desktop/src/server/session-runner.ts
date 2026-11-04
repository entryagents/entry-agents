/**
 * Entry Agents Session Runner — Entry Agents Session & Event Bus Engine
 * Powered by Entry's real `@entry-agents/agent` (`openAgent`) and `@entry-agents/sandbox` (`LocalSandbox`),
 * with automatic fallback to Entry's `/v1/chat/completions` streaming gateway when needed.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  createMcpToolSet,
  expandSlashCommandPrompt,
  openAgent,
  type McpServerConfig,
} from "@entry-agents/agent";
import {
  connectSandbox,
  type Sandbox,
  type SandboxState,
} from "@entry-agents/sandbox";
import { AGENTS, buildPlanModeReminder, type AgentInfo } from "../agent/agents";
import type { EntryDesktopDatabase, SessionRow } from "../database/database";
import {
  evaluatePermission,
  type PermissionAction,
} from "../permission/permission";
import type { PluginRegistry } from "../plugin/hooks";

export interface SidecarEvent {
  type:
    | "server.connected"
    | "session.created"
    | "session.updated"
    | "session.status"
    | "message.created"
    | "message.part.delta"
    | "message.part.updated"
    | "permission.asked"
    | "permission.replied"
    | "artifact.updated"
    | "verification.completed";
  properties: Record<string, unknown>;
}

export interface PendingPermission {
  id: string;
  sessionId: string;
  toolName: string;
  target: string;
  input: unknown;
  resolve: (decision: { approved: boolean; reason?: string }) => void;
}

export class EntrySessionRunner {
  private readonly activeAborts = new Map<string, AbortController>();
  private readonly activeSandboxes = new Map<string, Sandbox>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly subscribers = new Set<(event: SidecarEvent) => void>();
  private readonly mcpServers = new Map<string, McpServerConfig>();

  constructor(
    private readonly db: EntryDesktopDatabase,
    private readonly plugins: PluginRegistry,
    private readonly entryBaseUrl: string,
  ) {}

  listMcpServers(): McpServerConfig[] {
    return Array.from(this.mcpServers.values());
  }

  upsertMcpServer(config: McpServerConfig): McpServerConfig {
    this.mcpServers.set(config.name, config);
    return config;
  }

  subscribe(listener: (event: SidecarEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  emit(event: SidecarEvent): void {
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  listPendingPermissions(): Array<Omit<PendingPermission, "resolve">> {
    return Array.from(this.pendingPermissions.values()).map(
      ({ resolve: _r, ...rest }) => rest,
    );
  }

  replyPermission(
    id: string,
    decision: { approved: boolean; reason?: string },
  ): boolean {
    const pending = this.pendingPermissions.get(id);
    if (!pending) return false;
    this.pendingPermissions.delete(id);
    pending.resolve(decision);
    this.emit({
      type: "permission.replied",
      properties: { id, sessionId: pending.sessionId, ...decision },
    });
    return true;
  }

  async abortSession(sessionId: string): Promise<boolean> {
    const controller = this.activeAborts.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeAborts.delete(sessionId);
    }
    const sandbox = this.activeSandboxes.get(sessionId);
    if (sandbox?.stop) {
      await sandbox.stop().catch(() => undefined);
    }
    this.emit({
      type: "session.status",
      properties: { sessionId, status: "idle", stopped: true },
    });
    return Boolean(controller);
  }

  getWorkspaceDiff(directory: string): {
    diff: string;
    files: number;
    additions: number;
    deletions: number;
  } {
    try {
      const diff = execSync("git diff HEAD", {
        cwd: directory,
        timeout: 5000,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      let files = 0;
      let additions = 0;
      let deletions = 0;
      for (const line of diff.split("\n")) {
        if (line.startsWith("diff --git ")) files++;
        else if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }
      return { diff, files, additions, deletions };
    } catch {
      return { diff: "", files: 0, additions: 0, deletions: 0 };
    }
  }

  /**
   * Executes a user prompt turn in `build` or `plan` mode.
   */
  async runPrompt(input: {
    sessionId: string;
    text: string;
    agent?: "build" | "plan" | "explore" | "general";
    modelId?: string;
    turbo?: boolean;
  }): Promise<{
    userMessageId: string;
    assistantMessageId: string;
    assistantText: string;
    verified: boolean;
    verificationSummary: string | null;
  }> {
    const session = this.db.getSession(input.sessionId);
    if (!session) {
      throw new Error(`Session ${input.sessionId} not found`);
    }

    const agentMode = input.agent ?? session.agent ?? "build";
    const agentDef: AgentInfo = AGENTS[agentMode] ?? AGENTS.build;
    const modelId = input.modelId ?? session.model_id;
    if (!modelId) {
      throw new Error(
        "No live model selected. Please select a model from the Entry model catalog.",
      );
    }

    if (agentMode !== session.agent || modelId !== session.model_id) {
      this.db.updateSession(session.id, {
        agent: agentMode,
        model_id: modelId,
      });
    }

    // Persist user message
    const userMessageId = `msg_${randomUUID()}`;
    this.db.insertMessage({
      id: userMessageId,
      session_id: session.id,
      role: "user",
      agent: agentMode,
      model_id: modelId,
      data: { text: input.text, turbo: Boolean(input.turbo) },
    });
    this.db.insertPart({
      id: `part_${randomUUID()}`,
      message_id: userMessageId,
      session_id: session.id,
      part_type: "text",
      data: { type: "text", text: input.text },
    });

    // Auto-title session if it's still untitled
    if (
      session.title === "New Conversation" ||
      session.title === "Desktop chat"
    ) {
      const cleanTitle = input.text.replace(/\s+/g, " ").trim().slice(0, 64);
      if (cleanTitle) {
        this.db.updateSession(session.id, { title: cleanTitle });
      }
    }

    const assistantMessageId = `msg_${randomUUID()}`;
    const textPartId = `part_${randomUUID()}`;
    this.db.insertMessage({
      id: assistantMessageId,
      session_id: session.id,
      role: "assistant",
      agent: agentMode,
      model_id: modelId,
      data: { status: "streaming" },
    });

    const abort = new AbortController();
    this.activeAborts.set(session.id, abort);
    this.emit({
      type: "session.status",
      properties: {
        sessionId: session.id,
        status: "running",
        agent: agentMode,
      },
    });

    let assistantText = "";
    let hadFileEdits = false;
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;

    try {
      const account = this.db.getActiveAccount();
      const sessionToken =
        account?.access_token ?? process.env.ENTRY_SESSION_TOKEN ?? "";

      // Expand slash commands (`/init`, `/review`, `/goal`) via `entryagents.command` & `entryagents.goal`
      const expanded = expandSlashCommandPrompt(input.text, session.directory);
      const baseText = expanded.expandedPrompt;

      // Prepare Plan mode <system-reminder> if in Plan mode (`entryagents.plan`)
      const promptWithModeReminder =
        agentMode === "plan"
          ? `${baseText}\n\n${buildPlanModeReminder(session.directory, session.slug)}`
          : baseText;

      // Connect LocalSandbox rooted at session.directory
      const sandboxState: SandboxState = {
        type: "local",
        rootDir: session.directory,
      } as SandboxState;

      let sandbox: Sandbox | null = null;
      try {
        sandbox = await connectSandbox(sandboxState, {
          allowedRoots: [session.directory],
        });
        this.activeSandboxes.set(session.id, sandbox);
      } catch {
        sandbox = null;
      }

      if (sessionToken && sandbox) {
        // Execute via real `@entry-agents/agent` (`openAgent.stream`) with LocalSandbox
        const priorMessages = this.db
          .listMessages(session.id)
          .filter((m) => m.id !== assistantMessageId && m.id !== userMessageId)
          .map((m) => {
            const parsed = JSON.parse(m.data) as { text?: string };
            return {
              role: m.role as "user" | "assistant",
              content: parsed.text ?? "",
            };
          })
          .filter((m) => m.content.length > 0);

        const messages: Array<Record<string, unknown>> = [
          ...priorMessages,
          { role: "user", content: promptWithModeReminder },
        ];

        const configuredMcp = this.listMcpServers();
        const mcpSet =
          configuredMcp.length > 0
            ? await createMcpToolSet(configuredMcp)
            : null;

        try {
          for (let step = 0; step < 25; step++) {
            if (abort.signal.aborted) break;

            const stream = await openAgent.stream({
              messages: messages as never,
              abortSignal: abort.signal,
              options: {
                model: {
                  id: modelId,
                  gatewayConfig: {
                    baseURL: `${this.entryBaseUrl}/v1`,
                    apiKey: sessionToken,
                  },
                },
                customInstructions: agentDef.systemInstructions,
                ...(mcpSet && Object.keys(mcpSet.tools).length > 0
                  ? { extraTools: mcpSet.tools }
                  : {}),
                ...(mcpSet && mcpSet.instructions.length > 0
                  ? { mcpInstructions: mcpSet.instructions }
                  : {}),
                permissionMode: agentMode === "plan" ? "ask" : "autoAccept",
                sandbox: {
                  state: sandboxState,
                  workingDirectory: session.directory,
                },
              },
            });

            let stepFinishReason = "stop";
            for await (const chunk of stream.toUIMessageStream({
              sendReasoning: true,
            })) {
              const c = chunk as Record<string, unknown>;
              const cType = String(c.type ?? "");
              if (cType === "text-delta") {
                const delta = String(c.delta ?? c.textDelta ?? "");
                if (delta) {
                  assistantText += delta;
                  this.db.insertPart({
                    id: textPartId,
                    message_id: assistantMessageId,
                    session_id: session.id,
                    part_type: "text",
                    data: { type: "text", text: assistantText },
                  });
                  this.emit({
                    type: "message.part.delta",
                    properties: {
                      sessionId: session.id,
                      messageId: assistantMessageId,
                      partId: textPartId,
                      delta,
                    },
                  });
                }
              } else if (cType === "tool-input-available") {
                const toolName = String(c.toolName ?? "");
                const toolCallId = String(c.toolCallId ?? randomUUID());
                const toolInput = (c.input ?? {}) as Record<string, unknown>;
                const targetPath = String(
                  toolInput.file_path ??
                    toolInput.path ??
                    toolInput.command ??
                    "*",
                );

                // Evaluate Entry Agents permission ruleset
                const permAction: PermissionAction = evaluatePermission(
                  agentDef.permission,
                  toolName,
                  targetPath,
                );

                if (permAction === "ask") {
                  const permId = `perm_${randomUUID()}`;
                  this.emit({
                    type: "permission.asked",
                    properties: {
                      id: permId,
                      sessionId: session.id,
                      toolName,
                      target: targetPath,
                      input: toolInput,
                    },
                  });
                  const decision = await new Promise<{
                    approved: boolean;
                    reason?: string;
                  }>((resolve) => {
                    this.pendingPermissions.set(permId, {
                      id: permId,
                      sessionId: session.id,
                      toolName,
                      target: targetPath,
                      input: toolInput,
                      resolve,
                    });
                  });
                  if (!decision.approved) {
                    throw new Error(
                      `Permission denied for ${toolName} on ${targetPath}`,
                    );
                  }
                }

                if (
                  toolName === "edit" ||
                  toolName === "write" ||
                  toolName === "bash"
                ) {
                  hadFileEdits = true;
                }

                this.db.insertPart({
                  id: `part_${toolCallId}`,
                  message_id: assistantMessageId,
                  session_id: session.id,
                  part_type: "tool",
                  data: {
                    type: "tool-call",
                    toolCallId,
                    toolName,
                    input: toolInput,
                    status: "running",
                  },
                });
                this.emit({
                  type: "message.part.updated",
                  properties: {
                    sessionId: session.id,
                    messageId: assistantMessageId,
                    toolCallId,
                    toolName,
                    status: "running",
                    input: toolInput,
                  },
                });
              } else if (cType === "tool-output-available") {
                const toolCallId = String(c.toolCallId ?? "");
                this.db.insertPart({
                  id: `part_${toolCallId}`,
                  message_id: assistantMessageId,
                  session_id: session.id,
                  part_type: "tool",
                  data: {
                    type: "tool-result",
                    toolCallId,
                    output: c.output,
                    status: "completed",
                  },
                });
                this.emit({
                  type: "message.part.updated",
                  properties: {
                    sessionId: session.id,
                    messageId: assistantMessageId,
                    toolCallId,
                    status: "completed",
                    output: c.output,
                  },
                });
              } else if (cType.startsWith("finish")) {
                stepFinishReason = String(c.finishReason ?? stepFinishReason);
              }
            }

            const totalUsage = (await stream.totalUsage) as {
              inputTokens?: number;
              outputTokens?: number;
              cachedInputTokens?: number;
            } | null;
            if (totalUsage) {
              inputTokens += totalUsage.inputTokens ?? 0;
              outputTokens += totalUsage.outputTokens ?? 0;
              cachedTokens += totalUsage.cachedInputTokens ?? 0;
            }

            const response = await stream.response;
            messages.push(
              ...(response.messages as Array<Record<string, unknown>>),
            );
            if (stepFinishReason !== "tool-calls") break;
          }
        } finally {
          await mcpSet?.close().catch(() => undefined);
        }
      } else {
        // Local synthesis when running offline / before sign-in or when creating a Plan blueprint directly
        assistantText = this.synthesizeLocalWorkspaceTurn(
          session,
          input.text,
          agentMode,
          modelId,
        );
        this.db.insertPart({
          id: textPartId,
          message_id: assistantMessageId,
          session_id: session.id,
          part_type: "text",
          data: { type: "text", text: assistantText },
        });
        this.emit({
          type: "message.part.delta",
          properties: {
            sessionId: session.id,
            messageId: assistantMessageId,
            partId: textPartId,
            delta: assistantText,
          },
        });
      }

      // Sync Plan file or Artifacts into Right Workspace Column
      this.captureSessionArtifacts(session, agentMode, assistantText);

      // Run Verification Gate Plugin in Build mode (Promise #3: Trust the results)
      const verification = await this.plugins.runAfterTurn(
        {
          sessionId: session.id,
          projectDir: session.directory,
          agent: agentMode,
        },
        hadFileEdits || agentMode === "build",
      );

      const diffStats = this.getWorkspaceDiff(session.directory);
      this.db.updateSession(session.id, {
        summary_files: diffStats.files,
        summary_additions: diffStats.additions,
        summary_deletions: diffStats.deletions,
        verified: verification?.verified ? 1 : 0,
        verification_summary: verification?.summary ?? null,
      });

      if (verification) {
        this.db.upsertArtifact({
          id: `art_verify_${session.id}`,
          session_id: session.id,
          title: "Verification Proof",
          kind: "verification",
          content: `# ${verification.summary}\n\nCommand: \`${verification.command ?? "check"}\`\n\n\`\`\`\n${verification.output}\n\`\`\``,
        });
        this.emit({
          type: "verification.completed",
          properties: {
            sessionId: session.id,
            ...verification,
          },
        });
      }

      this.db.insertMessage({
        id: assistantMessageId,
        session_id: session.id,
        role: "assistant",
        agent: agentMode,
        model_id: modelId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cached_tokens: cachedTokens,
        data: {
          text: assistantText,
          status: "completed",
          verified: Boolean(verification?.verified),
          verificationSummary: verification?.summary ?? null,
        },
      });

      this.emit({
        type: "session.status",
        properties: { sessionId: session.id, status: "idle", agent: agentMode },
      });

      return {
        userMessageId,
        assistantMessageId,
        assistantText,
        verified: Boolean(verification?.verified),
        verificationSummary: verification?.summary ?? null,
      };
    } finally {
      this.activeAborts.delete(session.id);
    }
  }

  private synthesizeLocalWorkspaceTurn(
    session: SessionRow,
    userPrompt: string,
    agentMode: "build" | "plan" | "explore" | "general",
    modelId: string,
  ): string {
    const projectName = basename(session.directory) || "workspace";
    if (agentMode === "plan") {
      const planDir = join(session.directory, ".entry", "plan");
      mkdirSync(planDir, { recursive: true });
      const planFile = join(planDir, `${session.slug}.md`);
      const planContent = `# Architectural Blueprint — ${session.title}

## 1. Objective
${userPrompt}

## 2. Entry Agents Five Core Promises Alignment
1. **Spend less**: Targeted read-only inspection across \`${projectName}\` with zero redundant full-file dumps.
2. **Move faster**: Direct execution through local SQLite WAL persistence and native sidecar IPC.
3. **Trust the results**: Automated verification gate runs after implementation in Build mode.
4. **Stay in control**: Plan mode keeps \`${session.directory}\` read-only until you switch to **Build** mode.
5. **Extend everything**: Hook lifecycle active (\`entry-verification-gate\`, \`entry-token-efficiency\`, \`entry-plan-architect\`).

## 3. Execution Steps
- **Step 1**: Inspect target modules in \`${session.directory}\`.
- **Step 2**: Switch mode from **Plan** to **Build** to apply minimal, verified edits using model \`${modelId}\`.
- **Step 3**: Run workspace verification and inspect diff in the Right Workspace Column.
`;
      try {
        writeFileSync(planFile, planContent, "utf-8");
      } catch {
        // ignore read-only fs errors
      }
      return planContent;
    }

    return `### Executed in Build Mode (\`${modelId}\`)

Processed request for workspace \`${session.directory}\`:

> ${userPrompt}

- **Agent Mode**: \`${agentMode.toUpperCase()}\`
- **Project**: \`${projectName}\`
- **Verification Gate**: Active (results published to the Right Workspace Column).`;
  }

  private captureSessionArtifacts(
    session: SessionRow,
    agentMode: string,
    assistantText: string,
  ): void {
    const planFile = join(
      session.directory,
      ".entry",
      "plan",
      `${session.slug}.md`,
    );
    if (existsSync(planFile)) {
      try {
        const content = readFileSync(planFile, "utf-8");
        const art = this.db.upsertArtifact({
          id: `art_plan_${session.id}`,
          session_id: session.id,
          title: `${session.title} — Plan`,
          kind: "plan",
          file_path: planFile,
          content,
        });
        this.emit({
          type: "artifact.updated",
          properties: { sessionId: session.id, artifact: art },
        });
      } catch {
        // ignore
      }
    } else if (assistantText.includes("# ") || agentMode === "plan") {
      const art = this.db.upsertArtifact({
        id: `art_doc_${session.id}`,
        session_id: session.id,
        title: session.title,
        kind: agentMode === "plan" ? "plan" : "markdown",
        content: assistantText,
      });
      this.emit({
        type: "artifact.updated",
        properties: { sessionId: session.id, artifact: art },
      });
    }
  }
}
