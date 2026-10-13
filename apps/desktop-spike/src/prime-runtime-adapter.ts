import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { createConnection, type Socket } from "node:net";

export interface PrimeRuntimeOptions {
  binaryPath: string;
  projectRoot: string;
  socketPath: string;
}

export interface PrimeDaemonResponse {
  type: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: unknown;
}

/** Entry's first Prime bridge: owns the daemon process and speaks Prime's
 * newline-delimited daemon protocol without forwarding Entry credentials. */
export class PrimeRuntimeAdapter {
  private process: ChildProcess | null = null;
  private requestCounter = 0;

  constructor(private readonly options: PrimeRuntimeOptions) {}

  async start(): Promise<void> {
    if (this.process && !this.process.killed) return;
    this.process = spawn(
      this.options.binaryPath,
      ["--mode", "daemon", "--daemon-socket", this.options.socketPath],
      {
        cwd: this.options.projectRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? process.cwd(),
          PRIME_AGENT_DAEMON_SOCKET: this.options.socketPath,
        },
      },
    );
    this.process.stdout?.on("data", (chunk) =>
      console.log("[prime]", String(chunk).trimEnd()),
    );
    this.process.stderr?.on("data", (chunk) =>
      console.error("[prime]", String(chunk).trimEnd()),
    );
    await new Promise<void>((resolve, reject) => {
      this.process?.once("error", reject);
      this.process?.once("spawn", resolve);
    });
    await this.waitForSocket();
  }

  async waitForSocket(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        await access(this.options.socketPath, constants.F_OK);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(
      `Prime daemon socket did not appear: ${this.options.socketPath}`,
    );
  }

  async request(
    command: Record<string, unknown>,
  ): Promise<PrimeDaemonResponse> {
    const socket = await this.connect();
    const id = `entry_${++this.requestCounter}`;
    const envelope = {
      type: "command",
      id,
      protocol: { name: "prime-agent.daemon", version: 7 },
      clientId: "entry-desktop",
      command: { ...command, id },
    };
    socket.write(`${JSON.stringify(envelope)}\n`);
    return new Promise((resolve, reject) => {
      let buffer = "";
      const cleanup = () => {
        socket.removeAllListeners();
        socket.end();
      };
      socket.on("data", (chunk) => {
        buffer += String(chunk);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let value: PrimeDaemonResponse | { type?: string };
          try {
            value = JSON.parse(line) as PrimeDaemonResponse;
          } catch {
            continue;
          }
          if (value.type === "response" && "id" in value && value.id === id) {
            cleanup();
            resolve(value as PrimeDaemonResponse);
            return;
          }
        }
      });
      socket.once("error", (error) => {
        cleanup();
        reject(error);
      });
      socket.setTimeout(30_000, () =>
        finish(reject)(
          new Error("Timed out waiting for Prime daemon response"),
        ),
      );
    });
  }

  async createSession(
    projectRoot = this.options.projectRoot,
  ): Promise<PrimeDaemonResponse> {
    return this.request({
      command: "create",
      session_path: `${projectRoot}/.entry-prime-session.jsonl`,
      runtime_metadata: { product: "entry-desktop" },
    });
  }

  async prompt(
    activeSessionId: string,
    message: string,
  ): Promise<PrimeDaemonResponse> {
    return this.request({
      command: "prompt",
      active_session_id: activeSessionId,
      message,
      queue_if_busy: false,
    });
  }

  async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    if (!child || child.killed) return;
    child.kill();
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      setTimeout(resolve, 2_000);
    });
  }

  get running(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.options.socketPath);
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    });
  }
}
