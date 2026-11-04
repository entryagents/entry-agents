/**
 * Entry Agents Sidecar Server — Follows Entry Agents' `packages/server/src/routes.ts`
 * and `packages/desktop/src/main/service/sidecar-credentials.ts` + `sidecar-probe.ts`.
 *
 * Exposes:
 * - GET  `/global/health` (Entry Agents health probe)
 * - GET  `/event` (SSE real-time event stream)
 * - GET  `/models` (Live models strictly from `https://entry-agents.dev/api/desktop/models` or `/api/models`)
 * - GET  `/agent` (Entry Agents agent modes: `build`, `plan`, `general`, `explore`)
 * - GET  `/auth/status`
 * - POST `/auth/device/start` (RFC 8628 device flow start)
 * - POST `/auth/device/poll` (RFC 8628 device flow token poll)
 * - POST `/auth/token` (Direct session token binding)
 * - POST `/auth/logout`
 * - GET  `/project` & POST `/project`
 * - GET  `/session` & POST `/session`
 * - GET  `/session/:id` & PATCH `/session/:id`
 * - GET  `/session/:id/message` & POST `/session/:id/message`
 * - POST `/session/:id/prompt_async`
 * - POST `/session/:id/abort`
 * - GET  `/session/:id/diff`
 * - GET  `/session/:id/artifact`
 * - GET  `/permission` & POST `/permission/:id/reply`
 * - GET  `/schedule` & POST `/schedule`
 * - GET  `/plugin`
 */
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { listVisibleAgents } from "../agent/agents";
import { DEFAULT_ENTRY_URL, EntryDeviceAuthService } from "../auth/device-auth";
import { EntryDesktopDatabase } from "../database/database";
import {
  fetchLiveEntryModels,
  type LiveDesktopModel,
} from "../models/live-models";
import { PluginRegistry } from "../plugin/hooks";
import { EntrySessionRunner } from "./session-runner";

export interface SidecarServerOptions {
  port?: number;
  hostname?: string;
  password?: string;
  dbPath?: string;
  entryBaseUrl?: string;
  defaultProjectDir?: string;
}

export interface RunningSidecarServer {
  port: number;
  hostname: string;
  url: string;
  db: EntryDesktopDatabase;
  auth: EntryDeviceAuthService;
  runner: EntrySessionRunner;
  stop: () => void;
}

export function startSidecarServer(
  options: SidecarServerOptions = {},
): RunningSidecarServer {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.ENTRY_SIDECAR_PORT ?? 4096);
  const password = options.password ?? process.env.ENTRY_SERVER_PASSWORD ?? "";
  const entryBaseUrl = options.entryBaseUrl ?? DEFAULT_ENTRY_URL;

  const db = new EntryDesktopDatabase(options.dbPath);
  const plugins = new PluginRegistry();
  const auth = new EntryDeviceAuthService(db, entryBaseUrl);
  const runner = new EntrySessionRunner(db, plugins, entryBaseUrl);

  // Ensure a default project & initial architecture conversation exist for immediate workspace inspection
  const defaultDir = options.defaultProjectDir ?? process.cwd();
  const defaultProject = db.upsertProject({
    id: "proj_default",
    worktree: defaultDir,
    vcs: "git",
    branch: "main",
    name: basename(defaultDir) || "entry-agents",
  });

  if (db.listSessions().length === 0) {
    const initialSession = db.createSession({
      id: "sess_initial",
      project_id: defaultProject.id,
      slug: "entry-desktop-architecture",
      directory: defaultProject.worktree,
      title: "Entry Agents Collaborative System Architecture",
      agent: "build",
      model_id: null,
    });

    db.upsertArtifact({
      id: "art_initial_blueprint",
      session_id: initialSession.id,
      title: "Entry Agents Architecture Blueprint",
      kind: "architecture",
      file_path: "apps/desktop/src/server/server.ts",
      content: `# Entry Agents V1 — Five Promises & Entry Agents Architecture

## Core Product Principle
The most capable AI development environment shouldn't be the one that consumes the most tokens, runs the most agents, or has the most features. It should be the one that gets the most **verified work** done with the least time, money, and human intervention.

## Architecture Layers
- **L1 — Native 3-Column Workspace GUI (\`entry-desktop.exe\`)**: Pure native GPU-rendered Rust GUI (\`eframe\`/\`egui\`) with zero Electron or WebView overhead.
- **L2 — Local Sidecar Runtime (\`entry-agent-sidecar.exe\`)**: HTTP + SSE Event Bus, SQLite WAL database (\`~/.entry/desktop/entry-desktop.sqlite\`), and Entry Agents wildcard permission engine.
- **L3 — Dual Agent Modes (\`Build\` & \`Plan\`)**: \`Plan\` mode enforces read-only exploration and writes blueprints to \`.entry/plan/*.md\`; \`Build\` mode executes tools via \`@entry-agents/agent\` + \`LocalSandbox\` and runs the Verification Gate.
- **L4 — Unified Entry Cloud Gateway (\`https://entry-agents.dev\`)**: OAuth 2.0 Device Flow (\`/desktop/approve\`), live model catalog (\`/api/desktop/models\`), and SSE model proxy (\`/v1/chat/completions\`).`,
    });
  }

  let cachedModels: LiveDesktopModel[] = [];

  function checkBasicAuth(req: Request): boolean {
    if (!password) return true;
    const header = req.headers.get("authorization") ?? "";
    if (!header.startsWith("Basic ")) return false;
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
    const [, pass] = decoded.split(":");
    return pass === password;
  }

  function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      },
    });
  }

  const server = Bun.serve({
    hostname,
    port,
    idleTimeout: 255,
    async fetch(req: Request): Promise<Response> {
      if (req.method === "OPTIONS") {
        return jsonResponse({ ok: true });
      }
      if (!checkBasicAuth(req)) {
        return jsonResponse({ error: "Unauthorized sidecar request" }, 401);
      }

      const url = new URL(req.url);
      const path = url.pathname;

      try {
        // 1. Health probe (Entry Agents `/global/health` & `/health`)
        if (
          req.method === "GET" &&
          (path === "/global/health" || path === "/health")
        ) {
          return jsonResponse({
            healthy: true,
            ok: true,
            service: "entry-agent-sidecar",
            version: "1.0.0",
            entryBaseUrl,
            dbPath: db.dbPath,
          });
        }

        // 2. SSE Event Bus (`GET /event`)
        if (req.method === "GET" && path === "/event") {
          let unsubscribe: (() => void) | null = null;
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              const send = (ev: unknown) => {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(ev)}\n\n`),
                );
              };
              send({
                type: "server.connected",
                properties: { timestamp: Date.now() },
              });
              unsubscribe = runner.subscribe((ev) => send(ev));
            },
            cancel() {
              unsubscribe?.();
            },
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // 3. Live Models (`GET /models`) — Strictly from Entry's live API, zero hardcoded demo models!
        if (req.method === "GET" && path === "/models") {
          const account = db.getActiveAccount();
          const token =
            account?.access_token ?? process.env.ENTRY_SESSION_TOKEN ?? null;
          try {
            const liveCatalog = await fetchLiveEntryModels({
              baseUrl: entryBaseUrl,
              sessionToken: token,
            });
            cachedModels = liveCatalog.models;
            return jsonResponse({
              models: liveCatalog.models,
              freePlanModelId: liveCatalog.freePlanModelId,
              userPlan: liveCatalog.userPlan,
              creditGate: liveCatalog.creditGate,
              sourceUrl: liveCatalog.sourceUrl,
            });
          } catch (err) {
            return jsonResponse(
              {
                models: cachedModels,
                error:
                  err instanceof Error
                    ? err.message
                    : "Failed to fetch live models from Entry",
              },
              cachedModels.length > 0 ? 200 : 502,
            );
          }
        }

        // 4. Agents (`GET /agent`)
        if (req.method === "GET" && path === "/agent") {
          return jsonResponse({ agents: listVisibleAgents() });
        }

        // 5. Auth Routes (`/auth/*`)
        if (req.method === "GET" && path === "/auth/status") {
          const account = await auth.refreshAccountStatus();
          return jsonResponse({
            authenticated: Boolean(account),
            account,
            entryBaseUrl,
          });
        }

        if (req.method === "POST" && path === "/auth/device/start") {
          const device = await auth.startDeviceAuthorization();
          return jsonResponse(device);
        }

        if (req.method === "POST" && path === "/auth/device/poll") {
          const body = (await req.json()) as { device_code?: string };
          if (!body.device_code) {
            return jsonResponse({ error: "device_code required" }, 400);
          }
          const result = await auth.pollDeviceToken(body.device_code);
          return jsonResponse(result);
        }

        if (req.method === "POST" && path === "/auth/token") {
          const body = (await req.json()) as {
            token?: string;
            email?: string;
          };
          if (!body.token) {
            return jsonResponse({ error: "token required" }, 400);
          }
          const account = await auth.setSessionToken(body.token, body.email);
          return jsonResponse({ authenticated: true, account });
        }

        if (req.method === "POST" && path === "/auth/logout") {
          db.clearAccounts();
          return jsonResponse({ ok: true });
        }

        // 6. Projects (`/project`)
        if (req.method === "GET" && path === "/project") {
          return jsonResponse({ projects: db.listProjects() });
        }

        if (req.method === "POST" && path === "/project") {
          const body = (await req.json()) as {
            worktree?: string;
            name?: string;
            branch?: string;
          };
          if (!body.worktree) {
            return jsonResponse({ error: "worktree required" }, 400);
          }
          const proj = db.upsertProject({
            id: `proj_${randomUUID().slice(0, 8)}`,
            worktree: body.worktree,
            name: body.name ?? (basename(body.worktree) || "project"),
            branch: body.branch ?? "main",
            vcs: "git",
          });
          return jsonResponse({ project: proj });
        }

        // 7. Sessions (`/session`)
        if (req.method === "GET" && path === "/session") {
          const projectId = url.searchParams.get("projectId") ?? undefined;
          return jsonResponse({ sessions: db.listSessions(projectId) });
        }

        if (req.method === "POST" && path === "/session") {
          const body = (await req.json()) as {
            projectId?: string;
            directory?: string;
            title?: string;
            agent?: "build" | "plan" | "explore" | "general";
            modelId?: string | null;
          };
          const projects = db.listProjects();
          const project =
            (body.projectId ? db.getProject(body.projectId) : null) ??
            projects[0] ??
            defaultProject;
          const id = `sess_${randomUUID().slice(0, 10)}`;
          const session = db.createSession({
            id,
            project_id: project.id,
            slug: id,
            directory: body.directory ?? project.worktree,
            title: body.title ?? "New Conversation",
            agent: body.agent ?? "build",
            model_id: body.modelId ?? null,
          });
          runner.emit({
            type: "session.created",
            properties: { session },
          });
          return jsonResponse({ session });
        }

        const sessionMatch = path.match(
          /^\/session\/([^/]+)(?:\/(message|prompt_async|abort|diff|artifact))?$/,
        );
        if (sessionMatch) {
          const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
          const subroute = sessionMatch[2];

          if (!subroute && req.method === "GET") {
            const session = db.getSession(sessionId);
            if (!session) return jsonResponse({ error: "Not found" }, 404);
            return jsonResponse({
              session,
              messages: db.listMessages(sessionId),
              artifacts: db.listArtifacts(sessionId),
            });
          }

          if (!subroute && req.method === "PATCH") {
            const body = (await req.json()) as {
              title?: string;
              agent?: "build" | "plan" | "explore" | "general";
              model_id?: string | null;
            };
            const updated = db.updateSession(sessionId, body);
            if (!updated) return jsonResponse({ error: "Not found" }, 404);
            runner.emit({
              type: "session.updated",
              properties: { session: updated },
            });
            return jsonResponse({ session: updated });
          }

          if (subroute === "message" && req.method === "GET") {
            return jsonResponse({ messages: db.listMessages(sessionId) });
          }

          if (
            (subroute === "message" || subroute === "prompt_async") &&
            req.method === "POST"
          ) {
            const body = (await req.json()) as {
              text?: string;
              agent?: "build" | "plan" | "explore" | "general";
              modelId?: string;
              turbo?: boolean;
            };
            if (!body.text?.trim()) {
              return jsonResponse({ error: "text required" }, 400);
            }
            if (subroute === "prompt_async") {
              runner
                .runPrompt({
                  sessionId,
                  text: body.text,
                  agent: body.agent,
                  modelId: body.modelId,
                  turbo: body.turbo,
                })
                .catch(() => undefined);
              return jsonResponse({ accepted: true, sessionId }, 202);
            }
            const result = await runner.runPrompt({
              sessionId,
              text: body.text,
              agent: body.agent,
              modelId: body.modelId,
              turbo: body.turbo,
            });
            return jsonResponse({
              ...result,
              session: db.getSession(sessionId),
              messages: db.listMessages(sessionId),
              artifacts: db.listArtifacts(sessionId),
            });
          }

          if (subroute === "abort" && req.method === "POST") {
            const aborted = await runner.abortSession(sessionId);
            return jsonResponse({ ok: true, aborted });
          }

          if (subroute === "diff" && req.method === "GET") {
            const session = db.getSession(sessionId);
            if (!session) return jsonResponse({ error: "Not found" }, 404);
            return jsonResponse(runner.getWorkspaceDiff(session.directory));
          }

          if (subroute === "artifact" && req.method === "GET") {
            return jsonResponse({ artifacts: db.listArtifacts(sessionId) });
          }
        }

        // 8. Permissions (`/permission`)
        if (req.method === "GET" && path === "/permission") {
          return jsonResponse({
            permissions: runner.listPendingPermissions(),
          });
        }

        const permReplyMatch = path.match(/^\/permission\/([^/]+)\/reply$/);
        if (permReplyMatch && req.method === "POST") {
          const permId = decodeURIComponent(permReplyMatch[1] ?? "");
          const body = (await req.json()) as {
            approved?: boolean;
            reason?: string;
          };
          const ok = runner.replyPermission(permId, {
            approved: Boolean(body.approved),
            reason: body.reason,
          });
          return jsonResponse({ ok });
        }

        // 9. Schedules / Automations (`/schedule`)
        if (req.method === "GET" && path === "/schedule") {
          return jsonResponse({ schedules: db.listSchedules() });
        }

        if (req.method === "POST" && path === "/schedule") {
          const body = (await req.json()) as {
            projectId?: string;
            name?: string;
            cron?: string;
            prompt?: string;
            agent?: "build" | "plan";
          };
          if (!body.name || !body.cron || !body.prompt) {
            return jsonResponse(
              { error: "name, cron, and prompt are required" },
              400,
            );
          }
          const schedule = db.upsertSchedule({
            id: `sched_${randomUUID().slice(0, 8)}`,
            project_id: body.projectId ?? defaultProject.id,
            name: body.name,
            cron: body.cron,
            prompt: body.prompt,
            agent: body.agent ?? "build",
            enabled: true,
          });
          return jsonResponse({ schedule });
        }

        // 10. Plugins / Customizations (`/plugin`)
        if (req.method === "GET" && path === "/plugin") {
          return jsonResponse({ plugins: plugins.list() });
        }

        // 11. MCP Servers (`/mcp` — powered by `entryagents.mcp`)
        if (req.method === "GET" && path === "/mcp") {
          return jsonResponse({
            servers: runner.listMcpServers(),
          });
        }

        if (req.method === "POST" && path === "/mcp") {
          const body = (await req.json()) as {
            name?: string;
            transport?: "http" | "sse";
            url?: string;
            headers?: Record<string, string>;
          };
          if (!body.name || !body.url) {
            return jsonResponse({ error: "name and url required" }, 400);
          }
          const server = runner.upsertMcpServer({
            name: body.name,
            transport: body.transport ?? "http",
            url: body.url,
            headers: body.headers,
          });
          return jsonResponse({ server });
        }

        return jsonResponse({ error: `Route not found: ${path}` }, 404);
      } catch (err) {
        return jsonResponse(
          {
            error: err instanceof Error ? err.message : String(err),
          },
          500,
        );
      }
    },
  });

  const actualPort = server.port ?? port;
  return {
    port: actualPort,
    hostname,
    url: `http://${hostname}:${actualPort}`,
    db,
    auth,
    runner,
    stop: () => {
      server.stop(true);
      db.close();
    },
  };
}
