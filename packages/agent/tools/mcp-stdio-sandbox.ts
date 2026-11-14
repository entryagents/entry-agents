import type {
  JSONRPCMessage,
  MCPTransport,
  MCPTransportSendOptions,
} from "@ai-sdk/mcp";
import type { Sandbox } from "@entry-agents/sandbox";
import {
  createSecretRedactor,
  type SecretRedactor,
} from "../lib/secret-redactor";

export interface SandboxStdioTransportConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  sandbox: Sandbox;
  secretRedactor?: SecretRedactor;
  timeoutMs?: number;
}

const DEFAULT_STDIO_TIMEOUT_MS = 25_000;
const SAFE_BASE_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function validateEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/**
 * MCPTransport adapter that executes `stdio` MCP servers inside the user's
 * isolated sandbox via `sandbox.exec`.
 *
 * Because cloud sandboxes expose a stateless `exec(command, cwd, timeoutMs)`
 * RPC per invocation (no persistent host-to-container stdin/stdout pipe across
 * serverless step boundaries), each JSON-RPC request replays the negotiated
 * `initialize` + `notifications/initialized` preamble followed by the target
 * JSON-RPC request over a FIFO to the stdio server inside `env -i` isolation,
 * reads until the matching JSON-RPC response ID arrives on stdout, and cleanly
 * closes stdin/terminates the helper process immediately afterward.
 *
 * Security guarantees:
 * - Never runs on the Entry web host (`node:child_process` is never spawned on the server).
 * - Uses `env -i` so host/sandbox ambient tokens aren't inherited by third-party MCP binaries
 *   unless explicitly configured in `server.env`.
 * - Redacts configured secret values from any stdout/stderr/error messages.
 */
export class SandboxStdioMcpTransport implements MCPTransport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  protocolVersion?: string;

  private readonly config: SandboxStdioTransportConfig;
  private readonly redactor: SecretRedactor;
  private closed = false;
  private initializeRequest: JSONRPCMessage | null = null;
  private initializedNotification: JSONRPCMessage | null = null;

  constructor(config: SandboxStdioTransportConfig) {
    this.config = config;
    this.redactor = config.secretRedactor ?? createSecretRedactor([]);
  }

  setProtocolVersion(version: string): void {
    this.protocolVersion = version;
  }

  async start(): Promise<void> {
    if (!this.config.command.trim()) {
      throw new Error(
        `Stdio MCP server "${this.config.name}" is missing a command.`,
      );
    }
    this.closed = false;
  }

  async send(
    message: JSONRPCMessage,
    options?: MCPTransportSendOptions,
  ): Promise<void> {
    if (this.closed) {
      throw new Error(`MCP transport "${this.config.name}" is closed.`);
    }

    const msgObj = message as unknown as {
      id?: string | number;
      method?: string;
    };

    if (msgObj.method === "initialize" && msgObj.id !== undefined) {
      this.initializeRequest = message;
    } else if (
      msgObj.method === "notifications/initialized" ||
      msgObj.method === "initialized"
    ) {
      this.initializedNotification = message;
      // Notification with no response expected.
      return;
    }

    // Notifications (no id) other than initialized can be ignored cleanly if standalone.
    if (msgObj.id === undefined) {
      return;
    }

    const messagesToSend: JSONRPCMessage[] = [];
    if (msgObj.method !== "initialize" && this.initializeRequest) {
      messagesToSend.push(this.initializeRequest);
      if (this.initializedNotification) {
        messagesToSend.push(this.initializedNotification);
      } else {
        messagesToSend.push({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        } as unknown as JSONRPCMessage);
      }
    }
    messagesToSend.push(message);

    const requestId = msgObj.id;
    const responseMessage = await this.execJsonRpcTurn(
      messagesToSend,
      requestId,
      options?.signal,
    );

    if (!this.closed && responseMessage) {
      this.onmessage?.(responseMessage);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  private async execJsonRpcTurn(
    messages: JSONRPCMessage[],
    targetId: string | number,
    signal?: AbortSignal,
  ): Promise<JSONRPCMessage> {
    const ndjsonPayloadB64 = Buffer.from(
      `${messages.map((m) => JSON.stringify(m)).join("\n")}\n`,
      "utf8",
    ).toString("base64");
    const targetIdB64 = Buffer.from(JSON.stringify(targetId), "utf8").toString(
      "base64",
    );

    const extraEnv: Record<string, string> = {
      PAYLOAD_B64: ndjsonPayloadB64,
      TARGET_ID_B64: targetIdB64,
    };
    const envForwardPairs: string[] = [
      shellEscape(`PATH=${SAFE_BASE_PATH}`),
      shellEscape(
        `HOME=${this.config.sandbox.workingDirectory || "/workspace"}`,
      ),
    ];

    if (this.config.env) {
      for (const [k, v] of Object.entries(this.config.env)) {
        if (!validateEnvKey(k)) {
          throw new Error(
            `Invalid environment variable name "${k}" for MCP server "${this.config.name}".`,
          );
        }
        extraEnv[k] = v;
        envForwardPairs.push(`"${k}=\${${k}}"`);
      }
    }

    const innerCommand = [
      "env",
      "-i",
      ...envForwardPairs,
      shellEscape(this.config.command.trim()),
      ...(this.config.args ?? []).map(shellEscape),
    ].join(" ");

    const timeoutMs = this.config.timeoutMs ?? DEFAULT_STDIO_TIMEOUT_MS;
    const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000) - 2);

    const script = [
      `if command -v node >/dev/null 2>&1; then`,
      `  node -e '`,
      `    const { spawn } = require("child_process");`,
      `    const payload = Buffer.from(process.env.PAYLOAD_B64, "base64").toString("utf8");`,
      `    const targetId = JSON.parse(Buffer.from(process.env.TARGET_ID_B64, "base64").toString("utf8"));`,
      `    const envArg = JSON.parse(process.argv[1]);`,
      `    const childEnv = { PATH: ${JSON.stringify(SAFE_BASE_PATH)}, HOME: process.env.HOME || "/workspace" };`,
      `    for (const k of envArg) { if (process.env[k] !== undefined) childEnv[k] = process.env[k]; }`,
      `    const child = spawn(process.argv[2], JSON.parse(process.argv[3]), { stdio: ["pipe", "pipe", "pipe"], env: childEnv });`,
      `    let buf = "";`,
      `    let stderr = "";`,
      `    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} process.stderr.write(stderr || "MCP stdio timeout"); process.exit(124); }, ${Math.max(3000, timeoutMs - 2000)});`,
      `    child.stderr.on("data", (d) => { if (stderr.length < 8192) stderr += d.toString("utf8"); });`,
      `    child.stdout.on("data", (chunk) => {`,
      `      buf += chunk.toString("utf8");`,
      `      let idx;`,
      `      while ((idx = buf.indexOf("\\n")) !== -1) {`,
      `        const line = buf.slice(0, idx).trim();`,
      `        buf = buf.slice(idx + 1);`,
      `        if (!line) continue;`,
      `        try {`,
      `          const parsed = JSON.parse(line);`,
      `          if (parsed && Object.prototype.hasOwnProperty.call(parsed, "id") && parsed.id === targetId) {`,
      `            clearTimeout(timer);`,
      `            process.stdout.write(line + "\\n");`,
      `            try { child.stdin.end(); child.kill("SIGTERM"); } catch {}`,
      `            process.exit(0);`,
      `          }`,
      `        } catch {}`,
      `      }`,
      `    });`,
      `    child.on("error", (err) => { clearTimeout(timer); process.stderr.write(String(err)); process.exit(1); });`,
      `    child.on("close", (code) => { clearTimeout(timer); if (stderr) process.stderr.write(stderr); process.exit(code || 1); });`,
      `    child.stdin.write(payload);`,
      `  ' ${shellEscape(JSON.stringify(Object.keys(this.config.env ?? {})))} ${shellEscape(this.config.command.trim())} ${shellEscape(JSON.stringify(this.config.args ?? []))}`,
      `else`,
      `  printf '%s' "$PAYLOAD_B64" | base64 -d | timeout ${timeoutSec}s ${innerCommand}`,
      `fi`,
    ].join("\n");

    const result = await this.config.sandbox.exec(
      script,
      this.config.sandbox.workingDirectory,
      timeoutMs,
      { signal, env: extraEnv },
    );

    const redactedStderr = this.redactor.redact(result.stderr || "").trim();
    const lines = (result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as JSONRPCMessage & {
          id?: string | number;
        };
        if (parsed && parsed.id === targetId) {
          return this.redactor.redactUnknown(parsed);
        }
      } catch {
        // Ignore non-JSON banner lines written to stdout by noisy CLI wrappers
      }
    }

    const detail =
      redactedStderr || this.redactor.redact(result.stdout || "").slice(0, 400);
    const err = new Error(
      `Stdio MCP server "${this.config.name}" did not return a JSON-RPC response for id=${String(targetId)}${detail ? `: ${detail}` : ""}`,
    );
    this.onerror?.(err);
    throw err;
  }
}
