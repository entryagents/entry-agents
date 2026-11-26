import { tool } from "ai";
import { z } from "zod";
import { serializeBoundedForModel } from "./output-bounds";
import { isAgentContext, getSandbox, shellEscape } from "./utils";
import type { SandboxControlToolResult } from "../types";

const sandboxActionSchema = z.enum([
  "status",
  "info",
  "provision",
  "reconnect",
  "snapshot",
  "delete",
  "serve",
  "stop_serve",
  "ps",
  "kill_process",
  "ports",
  "expose_port",
  "unexpose_port",
  "env_get",
  "env_set",
  "checkpoint_create",
  "checkpoint_list",
  "checkpoint_restore",
  "checkpoint_delete",
  "logs",
]);

const sandboxControlInputSchema = z.object({
  action: sandboxActionSchema.describe(
    "Workspace operation: 'status', 'info', 'serve', 'stop_serve', 'ports', 'expose_port', 'unexpose_port', 'ps', 'kill_process', 'env_get', 'env_set', 'checkpoint_create', 'checkpoint_list', 'checkpoint_restore', 'checkpoint_delete', 'logs', 'provision', 'reconnect', 'snapshot', 'delete'.",
  ),
  port: z
    .number()
    .int()
    .positive()
    .max(65535)
    .optional()
    .describe(
      "Port number (for serve, stop_serve, expose_port, unexpose_port, ports, kill_process)",
    ),
  proxyName: z
    .string()
    .optional()
    .describe("Optional named HTTPS proxy route label (for expose_port)"),
  checkpointName: z
    .string()
    .optional()
    .describe(
      "Checkpoint name (for checkpoint_create, checkpoint_restore, checkpoint_delete)",
    ),
  maxChars: z
    .number()
    .int()
    .positive()
    .max(24_000)
    .optional()
    .describe(
      "Maximum characters to return from VM console logs (default 12000)",
    ),
  processNameOrPid: z
    .string()
    .optional()
    .describe("Process name or PID to kill (for kill_process)"),
  envKey: z
    .string()
    .optional()
    .describe("Environment variable key (for env_get, env_set)"),
  envValue: z
    .string()
    .optional()
    .describe("Environment variable value (for env_set)"),
});

export type SandboxControlToolInput = z.infer<typeof sandboxControlInputSchema>;

function hostResult(
  host: Record<string, unknown>,
  action: string,
): SandboxControlToolResult {
  return { ...host, success: true, action };
}

function unsupportedAction(action: string): SandboxControlToolResult {
  return {
    success: false,
    action,
    error: `Workspace action '${action}' is not supported by the current workspace provider.`,
  };
}

export function sandboxControlTool() {
  return tool({
    description: `Control this session's workspace (sandbox) lifecycle, runtime networking, checkpoints, and logs.

ACTIONS:
- status / info: read-only. Returns running/paused/missing state, lifecycle state, VM details, and public URL. Call first when unsure of state.
- serve / stop_serve: start/inspect or stop a persistent dev server and return its public HTTPS (or localhost) URL + port.
- ports / expose_port / unexpose_port: list active HTTPS proxy routes and exposed ports, or expose/unexpose a specific port publicly.
- ps / kill_process: list running processes or kill a process/group by port or PID/name.
- env_get / env_set: read or store session-scoped environment variables loaded into future bash calls.
- checkpoint_create / checkpoint_list / checkpoint_restore / checkpoint_delete: capture, list, restore in-place (RAM + disk), or delete fast local checkpoints before risky changes.
- logs: inspect bounded VM boot/console logs when debugging startup or service crashes.
- provision / reconnect / snapshot / delete: start, resume, create an account-level snapshot, or tear down the workspace ('delete' destroys uncommitted work; only use when explicitly asked).`,
    inputSchema: sandboxControlInputSchema,
    toModelOutput: ({ output }) =>
      serializeBoundedForModel(output, {
        maxChars: 16_000,
        label: "sandbox output",
      }),
    execute: async (
      input,
      { experimental_context },
    ): Promise<SandboxControlToolResult> => {
      if (
        !isAgentContext(experimental_context) ||
        !experimental_context.sandboxControl
      ) {
        return {
          success: false,
          action: input.action,
          error:
            "Workspace lifecycle control isn't available in this environment.",
        };
      }

      const control = experimental_context.sandboxControl;

      try {
        switch (input.action) {
          case "status":
          case "info": {
            if (input.action === "info" && control.info) {
              const res = await control.info();
              return hostResult(res, input.action);
            }
            const status = await control.status();
            if (input.action === "info") {
              const sandbox = await getSandbox(
                experimental_context,
                "sandbox",
              ).catch(() => null);
              const info = sandbox?.getInfo
                ? await sandbox.getInfo().catch(() => null)
                : null;
              return hostResult(
                { ...status, ...(info ? { info } : {}) },
                input.action,
              );
            }
            return hostResult(status, input.action);
          }
          case "ports": {
            if (control.ports) {
              const res = await control.ports({ port: input.port });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const [proxies, exposedPorts, listeners] = await Promise.all([
              sandbox.listProxies
                ? sandbox.listProxies().catch(() => [])
                : Promise.resolve([]),
              sandbox.listExposedPorts
                ? sandbox.listExposedPorts().catch(() => [])
                : Promise.resolve([]),
              sandbox
                .exec(
                  "(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || true) | head -n 30",
                  sandbox.workingDirectory,
                  5000,
                )
                .then((r) => r.stdout.trim())
                .catch(() => ""),
            ]);
            const portUrl =
              input.port && sandbox.domain
                ? sandbox.domain(input.port)
                : undefined;
            return hostResult(
              {
                ...(portUrl ? { port: input.port, url: portUrl } : {}),
                proxies,
                exposedPorts,
                ...(listeners ? { listening: listeners } : {}),
              },
              input.action,
            );
          }
          case "expose_port": {
            if (!input.port) {
              throw new Error("port is required for expose_port");
            }
            if (control.expose_port) {
              const res = await control.expose_port({
                port: input.port,
                name: input.proxyName,
              });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (sandbox.exposeProxy) {
              const proxy = await sandbox.exposeProxy(
                input.port,
                input.proxyName,
              );
              return hostResult({ proxy, url: proxy.url }, input.action);
            }
            if (sandbox.exposePort) {
              const exposed = await sandbox.exposePort(input.port, "tcp");
              return hostResult({ exposed }, input.action);
            }
            if (sandbox.domain) {
              return hostResult(
                { port: input.port, url: sandbox.domain(input.port) },
                input.action,
              );
            }
            return unsupportedAction(input.action);
          }
          case "unexpose_port": {
            if (!input.port) {
              throw new Error("port is required for unexpose_port");
            }
            if (control.unexpose_port) {
              const res = await control.unexpose_port({ port: input.port });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (sandbox.unexposePort) {
              await sandbox.unexposePort(input.port);
              return hostResult(
                { unexposed: true, port: input.port },
                input.action,
              );
            }
            return unsupportedAction(input.action);
          }
          case "provision": {
            const provisioned = await control.provision();
            return hostResult(provisioned, input.action);
          }
          case "reconnect": {
            const reconnected = await control.reconnect();
            return hostResult(reconnected, input.action);
          }
          case "snapshot": {
            const snapshotted = await control.snapshot();
            return hostResult(snapshotted, input.action);
          }
          case "delete": {
            const deleted = await control.delete();
            return hostResult(deleted, input.action);
          }
          case "serve": {
            if (control.serve) {
              const res = await control.serve({ port: input.port });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const targetPort = input.port ?? 3000;
            const url = sandbox.domain
              ? sandbox.domain(targetPort)
              : `http://localhost:${targetPort}`;
            const probe = await sandbox.exec(
              `lsof -i :${targetPort} -sTCP:LISTEN -t 2>/dev/null || true`,
              sandbox.workingDirectory,
              5000,
            );
            const pid = probe.stdout.trim();
            if (pid) {
              return hostResult(
                {
                  running: true,
                  port: targetPort,
                  pid,
                  url,
                },
                input.action,
              );
            }
            if (sandbox.execDetached) {
              const { commandId } = await sandbox.execDetached(
                `npm run dev -- -p ${targetPort}`,
                sandbox.workingDirectory,
              );
              return hostResult(
                {
                  running: true,
                  port: targetPort,
                  commandId,
                  url,
                },
                input.action,
              );
            }
            return hostResult(
              {
                running: false,
                error: "Detached background execution not supported",
              },
              input.action,
            );
          }
          case "stop_serve": {
            if (control.stop_serve) {
              const res = await control.stop_serve({ port: input.port });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const targetPort = input.port ?? 3000;
            await sandbox.exec(
              `fuser -k -9 ${targetPort}/tcp 2>/dev/null || true`,
              sandbox.workingDirectory,
              5000,
            );
            return hostResult(
              { stopped: true, port: targetPort },
              input.action,
            );
          }
          case "ps": {
            if (control.ps) {
              const res = await control.ps();
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const res = await sandbox.exec(
              "ps aux --sort=-%cpu | head -n 30",
              sandbox.workingDirectory,
              10000,
            );
            return hostResult({ processes: res.stdout }, input.action);
          }
          case "kill_process": {
            if (control.kill_process) {
              const res = await control.kill_process({
                processNameOrPid: input.processNameOrPid,
                port: input.port,
              });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (input.port) {
              await sandbox.exec(
                `fuser -k -9 ${input.port}/tcp 2>/dev/null || (lsof -ti:${input.port} 2>/dev/null | xargs kill -9 2>/dev/null) || true`,
                sandbox.workingDirectory,
                5000,
              );
              return hostResult(
                { killed: true, port: input.port },
                input.action,
              );
            }
            if (input.processNameOrPid) {
              await sandbox.exec(
                `pkill -9 -f ${shellEscape(input.processNameOrPid)} || kill -9 ${input.processNameOrPid} 2>/dev/null || true`,
                sandbox.workingDirectory,
                5000,
              );
              return hostResult(
                { killed: true, target: input.processNameOrPid },
                input.action,
              );
            }
            return hostResult(
              {
                killed: false,
                error: "Provide port or processNameOrPid to kill",
              },
              input.action,
            );
          }
          case "env_set": {
            if (!input.envKey)
              throw new Error("envKey is required for env_set");
            if (control.env_set) {
              const res = await control.env_set({
                key: input.envKey,
                value: input.envValue ?? "",
              });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const safeKey = input.envKey.replace(/[^a-zA-Z0-9_]/g, "");
            await sandbox.exec(
              `mkdir -p "$HOME" && echo "export ${safeKey}=${shellEscape(input.envValue ?? "")}" >> "$HOME/.entry_session_env"`,
              sandbox.workingDirectory,
              10000,
            );
            return hostResult({ key: safeKey, set: true }, input.action);
          }
          case "env_get": {
            const secretCtx =
              experimental_context && typeof experimental_context === "object"
                ? (experimental_context as {
                    secrets?: Array<{ name: string }>;
                    secretRedactor?: {
                      hasSecrets: () => boolean;
                      redact: (t: string) => string;
                    };
                  })
                : {};
            if (
              input.envKey &&
              secretCtx.secrets?.some(
                (s) => s.name === input.envKey?.trim().toUpperCase(),
              )
            ) {
              throw new Error(
                `Secret "${input.envKey}" is private and cannot be read with env_get.`,
              );
            }
            const redactEnv = (value: string) =>
              secretCtx.secretRedactor?.hasSecrets()
                ? secretCtx.secretRedactor.redact(value)
                : value;
            if (control.env_get) {
              const res = await control.env_get({ key: input.envKey });
              return hostResult(
                typeof res === "string"
                  ? redactEnv(res)
                  : secretCtx.secretRedactor?.hasSecrets()
                    ? JSON.parse(redactEnv(JSON.stringify(res)))
                    : res,
                input.action,
              );
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const res = await sandbox.exec(
              `if [ -f "$HOME/.entry_session_env" ]; then cat "$HOME/.entry_session_env"; fi`,
              sandbox.workingDirectory,
              10000,
            );
            return hostResult({ env: redactEnv(res.stdout) }, input.action);
          }
          case "checkpoint_create": {
            if (control.checkpoint_create) {
              const res = await control.checkpoint_create({
                name: input.checkpointName,
              });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (!sandbox.createCheckpoint) {
              return unsupportedAction(input.action);
            }
            const checkpoint = await sandbox.createCheckpoint(
              input.checkpointName ?? `cp-${Date.now()}`,
            );
            return hostResult({ checkpoint }, input.action);
          }
          case "checkpoint_list": {
            if (control.checkpoint_list) {
              const res = await control.checkpoint_list();
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (!sandbox.listCheckpoints) {
              return unsupportedAction(input.action);
            }
            const checkpoints = await sandbox.listCheckpoints();
            return hostResult({ checkpoints }, input.action);
          }
          case "checkpoint_restore": {
            if (!input.checkpointName) {
              throw new Error(
                "checkpointName is required for checkpoint_restore",
              );
            }
            if (control.checkpoint_restore) {
              const res = await control.checkpoint_restore({
                name: input.checkpointName,
              });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (!sandbox.restoreCheckpoint) {
              return unsupportedAction(input.action);
            }
            await sandbox.restoreCheckpoint(input.checkpointName);
            return hostResult(
              { restored: true, checkpointName: input.checkpointName },
              input.action,
            );
          }
          case "checkpoint_delete": {
            if (!input.checkpointName) {
              throw new Error(
                "checkpointName is required for checkpoint_delete",
              );
            }
            if (control.checkpoint_delete) {
              const res = await control.checkpoint_delete({
                name: input.checkpointName,
              });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (!sandbox.deleteCheckpoint) {
              return unsupportedAction(input.action);
            }
            await sandbox.deleteCheckpoint(input.checkpointName);
            return hostResult(
              { deleted: true, checkpointName: input.checkpointName },
              input.action,
            );
          }
          case "logs": {
            if (control.logs) {
              const res = await control.logs({ maxChars: input.maxChars });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            if (!sandbox.getLogs) {
              return unsupportedAction(input.action);
            }
            const logs = await sandbox.getLogs(input.maxChars ?? 12_000);
            return hostResult({ logs }, input.action);
          }
        }
      } catch (error) {
        return {
          success: false,
          action: input.action,
          error:
            error instanceof Error
              ? error.message
              : `Workspace ${input.action} failed`,
        };
      }
    },
  });
}
