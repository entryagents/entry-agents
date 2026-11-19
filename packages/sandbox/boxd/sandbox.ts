import type {
  Boxd,
  DirEntry,
  ExecResult as BoxdExecResult,
} from "@boxd-sh/sdk";
import type { Dirent } from "node:fs";
import type {
  ExecResult,
  Sandbox,
  SandboxCheckpoint,
  SandboxExposedPort,
  SandboxHooks,
  SandboxInfo,
  SandboxProxyRoute,
  SandboxStats,
  SnapshotResult,
} from "../interface.ts";
import type { ConnectOptions } from "../factory.ts";
import { BOXD_WORKING_DIRECTORY } from "./config.ts";
import {
  buildDetachedSpawnScript,
  buildKillProcessScript,
} from "../process-registry.ts";

function asDirent(entry: DirEntry): Dirent {
  return {
    name: entry.name,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isDirectory: () => entry.isDir,
    isFIFO: () => false,
    isFile: () => !entry.isDir,
    isSocket: () => false,
    isSymbolicLink: () => false,
  } as Dirent;
}

const MAX_BOXD_OUTPUT_CHARS = 200_000;

function truncateBoxdOutput(text: string): {
  text: string;
  truncated: boolean;
} {
  if (!text || text.length <= MAX_BOXD_OUTPUT_CHARS) {
    return { text: text ?? "", truncated: false };
  }
  return {
    text: text.slice(0, MAX_BOXD_OUTPUT_CHARS),
    truncated: true,
  };
}

function mapExec(result: BoxdExecResult): ExecResult {
  const stdoutRes = truncateBoxdOutput(result.stdout);
  const stderrRes = truncateBoxdOutput(result.stderr);
  return {
    success: result.success,
    exitCode: result.exitCode ?? null,
    stdout: stdoutRes.text,
    stderr: stderrRes.text,
    truncated: stdoutRes.truncated || stderrRes.truncated,
  };
}

export class BoxdSandbox implements Sandbox {
  readonly type = "cloud" as const;
  readonly workingDirectory: string;
  readonly hooks?: SandboxHooks;
  readonly env?: Record<string, string>;
  readonly host?: string;
  readonly expiresAt?: number;
  private githubToken?: string;
  private vercelToken?: string;
  private stopped = false;

  constructor(
    private readonly client: Boxd,
    private readonly machineId: string,
    private readonly machineName: string,
    options?: ConnectOptions,
    private readonly baseDomain = "boxd.sh",
    private readonly proxyPorts = new Set<number>(),
  ) {
    this.workingDirectory = options?.workingDirectory ?? BOXD_WORKING_DIRECTORY;
    this.hooks = options?.hooks;
    this.env = options?.env;
  }

  private assertRunning() {
    if (this.stopped) throw new Error("boxd sandbox is stopped");
  }

  private commandEnv(): Record<string, string> | undefined {
    let env = this.env;
    if (this.githubToken) {
      env = { ...env, GITHUB_TOKEN: this.githubToken };
    }
    if (this.vercelToken) {
      env = { ...env, VERCEL_TOKEN: this.vercelToken };
    }
    return env;
  }

  async readFile(path: string, _encoding: "utf-8"): Promise<string> {
    this.assertRunning();
    const bytes = await this.client.machines.files.download(
      this.machineId,
      path,
    );
    return new TextDecoder().decode(bytes);
  }

  async readFileBuffer(path: string): Promise<Buffer> {
    this.assertRunning();
    return Buffer.from(
      await this.client.machines.files.download(this.machineId, path),
    );
  }

  async writeFile(
    path: string,
    content: string,
    _encoding: "utf-8",
  ): Promise<void> {
    await this.writeFileBuffer(path, Buffer.from(content, "utf8"));
  }

  async writeFileBuffer(path: string, content: Buffer): Promise<void> {
    this.assertRunning();
    await this.client.machines.files.upload(this.machineId, path, content);
  }

  async stat(path: string): Promise<SandboxStats> {
    const result = await this.client.machines.exec(this.machineId, {
      command: ["stat", "-c", "%F|%s|%Y", path],
      cwd: BOXD_WORKING_DIRECTORY,
      env: this.commandEnv(),
    });
    if (!result.success) throw new Error(result.stderr || "boxd stat failed");
    const [kind, size, mtime] = result.stdout.trim().split("|");
    return {
      isDirectory: () => kind === "directory",
      isFile: () => kind === "regular file",
      size: Number(size),
      mtimeMs: Number(mtime) * 1000,
    };
  }

  async access(path: string): Promise<void> {
    const result = await this.client.machines.exec(this.machineId, {
      command: ["test", "-e", path],
      cwd: BOXD_WORKING_DIRECTORY,
      env: this.commandEnv(),
    });
    if (!result.success)
      throw new Error(result.stderr || `Path does not exist: ${path}`);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.assertRunning();
    if (options?.recursive === false) {
      await this.client.machines.files.mkdir(this.machineId, path);
      return;
    }
    await this.client.machines.exec(this.machineId, {
      command: ["mkdir", "-p", path],
      cwd: BOXD_WORKING_DIRECTORY,
      env: this.commandEnv(),
    });
  }

  async readdir(
    path: string,
    _options: { withFileTypes: true },
  ): Promise<Dirent[]> {
    const listing = await this.client.machines.files.listDir(
      this.machineId,
      path,
    );
    return listing.entries.map(asDirent);
  }

  async exec(
    command: string,
    cwd: string,
    timeoutMs: number,
    options?: { signal?: AbortSignal; env?: Record<string, string> },
  ): Promise<ExecResult> {
    this.assertRunning();
    if (options?.signal?.aborted) {
      const err = new Error("Command aborted");
      err.name = "AbortError";
      throw err;
    }

    const cmdId = `boxd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const pidFile = `/tmp/.entry_pid_${cmdId}`;
    const wrappedCommand = `echo $$ > ${pidFile}; trap 'rm -f ${pidFile}' EXIT; ${command}`;

    if (this.hooks?.onCommandStart) {
      try {
        await this.hooks.onCommandStart({
          cmdId,
          command,
          cwd,
          startedAt: Date.now(),
        });
      } catch (error) {
        console.warn("[BoxdSandbox] onCommandStart hook failed:", error);
      }
    }

    const baseEnv = this.commandEnv();
    const mergedEnv = options?.env ? { ...baseEnv, ...options.env } : baseEnv;

    const execPromise = this.client.machines.exec(this.machineId, {
      command: ["bash", "-c", wrappedCommand],
      cwd,
      timeout: timeoutMs,
      env: mergedEnv,
    });

    let abortListener: (() => void) | undefined;
    const abortPromise = options?.signal
      ? new Promise<never>((_resolve, reject) => {
          abortListener = () => {
            const err = new Error("Command aborted");
            err.name = "AbortError";
            reject(err);
          };
          if (options.signal!.aborted) {
            abortListener();
          } else {
            options.signal!.addEventListener("abort", abortListener, {
              once: true,
            });
          }
        })
      : null;

    try {
      const result = abortPromise
        ? await Promise.race([execPromise, abortPromise])
        : await execPromise;
      return mapExec(result);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        await this.killCommand(cmdId).catch(() => {});
      }
      throw error;
    } finally {
      if (abortListener && options?.signal) {
        options.signal.removeEventListener("abort", abortListener);
      }
      if (this.hooks?.onCommandEnd) {
        try {
          await this.hooks.onCommandEnd(cmdId);
        } catch (error) {
          console.warn("[BoxdSandbox] onCommandEnd hook failed:", error);
        }
      }
    }
  }

  async pause(): Promise<void> {
    if (this.stopped) return;
    await this.hooks?.beforeStop?.(this);
    await this.client.machines.pause(this.machineId);
  }

  async execDetached(
    command: string,
    cwd: string,
  ): Promise<{ commandId: string }> {
    this.assertRunning();
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const script = buildDetachedSpawnScript(command, commandId, cwd);
    await this.client.machines.exec(this.machineId, {
      command: ["bash", "-c", script],
      cwd,
      timeout: 10000,
      env: this.commandEnv(),
    });
    return { commandId };
  }

  async setGitHubAuthToken(token?: string): Promise<void> {
    this.githubToken = token;
  }

  async setVercelAuthToken(token?: string): Promise<void> {
    this.vercelToken = token;
  }

  async destroy(): Promise<void> {
    if (this.stopped) return;
    await this.hooks?.beforeStop?.(this);
    await this.client.machines.delete(this.machineId);
    await this.client.close();
    this.stopped = true;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    await this.hooks?.beforeStop?.(this);
    await this.client.machines.hibernate(this.machineId);
    this.stopped = true;
  }

  async killCommand(cmdId: string): Promise<void> {
    if (this.stopped) {
      return;
    }
    const trimmed = cmdId.trim();
    if (/^boxd_[0-9]+_[a-z0-9]+$/.test(trimmed)) {
      const pidFile = `/tmp/.entry_pid_${trimmed}`;
      await this.client.machines
        .exec(this.machineId, {
          command: [
            "bash",
            "-c",
            `if [ -f ${pidFile} ]; then PID=$(cat ${pidFile} 2>/dev/null); if [ -n "$PID" ]; then pkill -TERM -P "$PID" 2>/dev/null || true; kill -TERM -"$PID" "$PID" 2>/dev/null || true; sleep 0.5; pkill -KILL -P "$PID" 2>/dev/null || true; kill -KILL -"$PID" "$PID" 2>/dev/null || true; fi; rm -f ${pidFile}; fi`,
          ],
          cwd: BOXD_WORKING_DIRECTORY,
          timeout: 5_000,
        })
        .catch(() => undefined);
      return;
    }
    if (
      !/^[1-9][0-9]*$/.test(trimmed) &&
      !/^cmd_[0-9]+_[a-z0-9]+$/.test(trimmed)
    ) {
      return;
    }
    await this.client.machines
      .exec(this.machineId, {
        command: ["bash", "-c", buildKillProcessScript(trimmed)],
        cwd: BOXD_WORKING_DIRECTORY,
        timeout: 10_000,
      })
      .catch(() => undefined);
  }

  domain(port: number): string {
    if (this.proxyPorts.has(port)) {
      return `https://p${port}.${this.machineName}.${this.baseDomain}`;
    }
    void this.client.machines.proxies
      .setPort(this.machineId, port)
      .catch(() => undefined);
    return `https://${this.machineName}.${this.baseDomain}`;
  }

  async snapshot(): Promise<SnapshotResult> {
    this.assertRunning();
    const snapshotName = `snap-${this.machineName}-${Date.now()}`.slice(0, 63);
    const created = await this.client.snapshots.create(
      this.machineId,
      snapshotName,
    );
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const snap = await this.client.snapshots
        .get(created.name)
        .catch(() => null);
      if (snap?.status === "ready") {
        break;
      }
      if (snap?.status === "failed") {
        throw new Error(`Boxd snapshot '${created.name}' failed`);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return { snapshotId: created.name || created.id };
  }

  async createCheckpoint(name: string): Promise<SandboxCheckpoint> {
    this.assertRunning();
    const safeName =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63) || `cp-${Date.now()}`;
    const created = await this.client.machines.checkpoints.create(
      this.machineId,
      safeName,
    );
    const deadline = Date.now() + 15_000;
    let latest: SandboxCheckpoint = {
      id: created.id,
      name: created.name,
      status: created.status,
    };
    while (Date.now() < deadline) {
      const list = await this.client.machines.checkpoints
        .list(this.machineId)
        .catch(() => []);
      const match = list.find(
        (cp) => cp.name === created.name || cp.id === created.id,
      );
      if (match) {
        latest = {
          id: match.id,
          name: match.name,
          status: match.status,
          sizeBytes: match.sizeBytes,
          createdAt: match.createdAt.toISOString(),
          available: match.available,
        };
        if (match.status === "ready" || match.status === "failed") {
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (latest.status === "failed") {
      throw new Error(`Checkpoint '${latest.name}' failed`);
    }
    return latest;
  }

  async listCheckpoints(): Promise<SandboxCheckpoint[]> {
    this.assertRunning();
    const list = await this.client.machines.checkpoints.list(this.machineId);
    return list.map((cp) => ({
      id: cp.id,
      name: cp.name,
      status: cp.status,
      sizeBytes: cp.sizeBytes,
      createdAt: cp.createdAt.toISOString(),
      available: cp.available,
    }));
  }

  async restoreCheckpoint(name: string): Promise<void> {
    this.assertRunning();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const list = await this.client.machines.checkpoints
        .list(this.machineId)
        .catch(() => []);
      const match = list.find((cp) => cp.name === name);
      if (!match || match.status === "ready") {
        break;
      }
      if (match.status === "failed") {
        throw new Error(`Checkpoint '${name}' failed and cannot be restored`);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    await this.client.machines.checkpoints.restore(this.machineId, name);
    await this.client.machines.waitUntilReady(this.machineId);
  }

  async deleteCheckpoint(name: string): Promise<void> {
    this.assertRunning();
    await this.client.machines.checkpoints.delete(this.machineId, name);
  }

  async exposePort(
    port: number,
    protocol: "tcp" | "udp" | "both" = "tcp",
  ): Promise<SandboxExposedPort> {
    this.assertRunning();
    const exposed = await this.client.machines.ports.expose(
      this.machineId,
      port,
      { protocol },
    );
    return {
      machinePort: exposed.machinePort,
      publicPort: exposed.publicPort,
      protocol: exposed.protocol,
      dns: exposed.dns,
    };
  }

  async unexposePort(port: number): Promise<void> {
    this.assertRunning();
    await this.client.machines.ports.unexpose(this.machineId, port);
  }

  async listExposedPorts(): Promise<SandboxExposedPort[]> {
    this.assertRunning();
    const ports = await this.client.machines.ports.list(this.machineId);
    return ports.map((p) => ({
      machinePort: p.machinePort,
      publicPort: p.publicPort,
      protocol: p.protocol,
      dns: p.dns,
    }));
  }

  async exposeProxy(
    port: number | "auto",
    name?: string,
  ): Promise<{ url: string; port: number | "auto"; name?: string }> {
    this.assertRunning();
    if (port === "auto" || !name) {
      await this.client.machines.proxies.setPort(this.machineId, port);
      return {
        url: `https://${this.machineName}.${this.baseDomain}`,
        port,
      };
    }
    const routeName =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63) || `p${port}`;
    const existing = await this.client.machines.proxies
      .list(this.machineId)
      .catch(() => []);
    const matched = existing.find((p) => p.name === routeName);
    if (!matched) {
      await this.client.machines.proxies.create(
        this.machineId,
        routeName,
        port,
      );
    } else if (matched.port !== port) {
      await this.client.machines.proxies.setPort(this.machineId, port, {
        name: routeName,
      });
    }
    this.proxyPorts.add(port);
    return {
      url: `https://${routeName}.${this.machineName}.${this.baseDomain}`,
      port,
      name: routeName,
    };
  }

  async listProxies(): Promise<SandboxProxyRoute[]> {
    this.assertRunning();
    const proxies = await this.client.machines.proxies.list(this.machineId);
    return proxies.map((p) => ({
      name: p.name,
      domain: p.domain,
      port: p.port,
      portMode: p.portMode,
      isDefault: p.isDefault,
    }));
  }

  async getLogs(maxChars = 12_000): Promise<string> {
    this.assertRunning();
    const decoder = new TextDecoder();
    let collected = "";
    for await (const chunk of this.client.machines.logs(this.machineId, {
      follow: false,
    })) {
      collected += decoder.decode(chunk, { stream: true });
      if (collected.length > maxChars * 4) {
        collected = collected.slice(-(maxChars * 2));
      }
    }
    collected += decoder.decode();
    return collected.length > maxChars ? collected.slice(-maxChars) : collected;
  }

  async resize(params: {
    vcpu?: number;
    memory?: "4G" | "8G" | "16G" | "32G";
  }): Promise<{ vcpu: number; memoryBytes: number; rebooted: boolean }> {
    this.assertRunning();
    const res = await this.client.machines.resize(this.machineId, params);
    if (res.rebooted) {
      await this.client.machines.waitUntilReady(this.machineId);
    }
    return {
      vcpu: res.vcpu,
      memoryBytes: res.memoryBytes,
      rebooted: res.rebooted,
    };
  }

  async fork(name?: string): Promise<{
    machineId: string;
    machineName: string;
    url?: string;
  }> {
    this.assertRunning();
    const safeName = name
      ? name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 63)
      : undefined;
    // Preserve east-west network isolation on every forked workspace VM.
    const forked = await this.client.machines.fork(this.machineId, {
      ...(safeName ? { name: safeName } : {}),
      isolated: true,
    });
    return {
      machineId: forked.id,
      machineName: forked.name,
      url: forked.access?.url,
    };
  }

  async setEgressAllow(entries: string[]): Promise<string[]> {
    this.assertRunning();
    return await this.client.machines.setEgressAllow(this.machineId, entries);
  }

  async getInfo(): Promise<SandboxInfo> {
    this.assertRunning();
    const machine = await this.client.machines.get(this.machineId);
    return {
      status: machine.status,
      vcpu: machine.resources.vcpu,
      memoryBytes: machine.resources.memoryBytes,
      diskBytes: machine.resources.diskBytes,
      url: machine.access.url,
      desktopUrl: machine.access.desktopUrl || undefined,
      egressAllow: machine.egressAllow,
      bootTimeMs: machine.bootTimeMs,
      sshPort: machine.access.sshPort,
    };
  }

  getState(): { type: "boxd"; machineId: string; machineName: string } {
    return {
      type: "boxd",
      machineId: this.machineId,
      machineName: this.machineName,
    };
  }
}
