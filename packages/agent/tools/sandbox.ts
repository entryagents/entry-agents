import { tool } from "ai";
import { z } from "zod";
import { serializeBoundedForModel } from "./output-bounds";
import { isAgentContext, getSandbox, shellEscape } from "./utils";
import type { SandboxControlToolResult } from "../types";

const sandboxActionSchema = z.enum([
  "status",
  "provision",
  "reconnect",
  "snapshot",
  "delete",
  "serve",
  "stop_serve",
  "ps",
  "kill_process",
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
    "Workspace operation: 'status', 'info', 'serve', 'stop_serve', 'ps', 'kill_process', 'env_get', 'env_set', 'checkpoint_create', 'checkpoint_list', 'checkpoint_restore', 'checkpoint_delete', 'logs', 'provision', 'reconnect', 'snapshot', 'delete'.",
  ),
  port: z
    .number()
    .int()
    .positive()
    .max(65535)
    .optional()
    .describe("Port number (for serve, stop_serve, kill_process)"),
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
    description: `Control this session's workspace (sandbox) lifecycle, runtime networking, checkpoints, sizing, and logs.

ACTIONS:
- status: read-only. Returns running/paused/missing state, lifecycle state, expiry, and supported capabilities. Call first when unsure of state.
- serve / stop_serve: start/inspect or stop a persistent dev server and return its public HTTPS (or localhost) URL + port.
- ps / kill_process: list running processes or kill a process/group by port or PID/name.
- env_get / env_set: read or store session-scoped environment variables loaded into future bash calls.
- checkpoint_create / checkpoint_list / checkpoint_restore / checkpoint_delete: capture, list, restore in-place (RAM + disk), or delete fast local checkpoints before risky changes.
- expose_port / unexpose_port / ports: manage public HTTPS proxy routes (explicit port or portAuto: true, optional proxyName) or raw TCP/UDP port forwards.
- logs: inspect bounded VM boot/console logs when debugging startup or service crashes.
- resize: resize VM vCPU and/or memory ('4G', '8G', '16G', '32G') when workloads need more compute (may reboot a running VM).
- fork: clone the current running workspace into a new isolated VM for safe side experiments.
- egress_allow: update outbound network allowlist entries (hostnames/CIDRs; empty array removes restrictions).
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
          case "status": {
            const status = await control.status();
            return hostResult(status, input.action);
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
            if (control.env_get) {
              const res = await control.env_get({ key: input.envKey });
              return hostResult(res, input.action);
            }
            const sandbox = await getSandbox(experimental_context, "sandbox");
            const res = await sandbox.exec(
              `if [ -f "$HOME/.entry_session_env" ]; then cat "$HOME/.entry_session_env"; fi`,
              sandbox.workingDirectory,
              10000,
            );
            return hostResult({ env: res.stdout }, input.action);
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
