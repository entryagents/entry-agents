import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

export interface PrimeRuntimeOptions {
  binaryPath: string;
  projectRoot: string;
  socketPath: string;
}

/** Minimal process boundary for the Prime daemon. The adapter deliberately
 * does not pass Entry credentials into Prime's environment. Authenticated
 * model traffic remains behind Entry's desktop backend. */
export class PrimeRuntimeAdapter {
  private process: ChildProcess | null = null;

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

  async stop(): Promise<void> {
    const child = this.process;
    this.process = null;
    if (!child || child.killed) return;
    child.kill();
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }

  get running(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
