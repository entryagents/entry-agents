import { describe, expect, test } from "bun:test";
import type { Sandbox } from "@entry-agents/sandbox";
import { createSecretRedactor } from "../lib/secret-redactor";
import { SandboxStdioMcpTransport } from "./mcp-stdio-sandbox";

function createMockSandbox(
  handler: (
    command: string,
    cwd: string | undefined,
    timeoutMs: number | undefined,
    options?: Parameters<Sandbox["exec"]>[3],
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>,
): Sandbox {
  return {
    workingDirectory: "/workspace",
    exec: handler,
    readFile: async () => "",
    writeFile: async () => {},
  } as unknown as Sandbox;
}

describe("SandboxStdioMcpTransport", () => {
  test("replays initialize preamble before subsequent JSON-RPC requests and redacts secrets", async () => {
    const calls: Array<{
      command: string;
      env?: Record<string, string>;
    }> = [];
    const secretValue = "super_secret_token_987654";

    const sandbox = createMockSandbox(
      async (command, _cwd, _timeoutMs, options) => {
        calls.push({ command, env: options?.env });
        const payload = Buffer.from(options?.env?.PAYLOAD_B64 ?? "", "base64")
          .toString("utf8")
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(line) as { id?: number | string; method?: string },
          );
        const last = payload[payload.length - 1];
        if (last?.method === "initialize") {
          return {
            stdout: `${JSON.stringify({
              jsonrpc: "2.0",
              id: last.id,
              result: { protocolVersion: "2024-11-05", capabilities: {} },
            })}\n`,
            stderr: "",
            exitCode: 0,
          };
        }
        return {
          stdout: `${JSON.stringify({
            jsonrpc: "2.0",
            id: last?.id,
            result: {
              tools: [
                {
                  name: "demo_tool",
                  description: `leaked ${secretValue}`,
                },
              ],
            },
          })}\n`,
          stderr: "",
          exitCode: 0,
        };
      },
    );

    const received: unknown[] = [];
    const transport = new SandboxStdioMcpTransport({
      name: "demo-stdio",
      command: "npx",
      args: ["-y", "@example/mcp"],
      env: { API_TOKEN: secretValue },
      sandbox,
      secretRedactor: createSecretRedactor([
        { name: "API_TOKEN", value: secretValue },
      ]),
    });
    Object.assign(transport, {
      onmessage: (msg: unknown) => received.push(msg),
    });

    await transport.start();
    await transport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    });
    await transport.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    await transport.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]!.env?.API_TOKEN).toBe(secretValue);

    const replayed = Buffer.from(calls[1]!.env?.PAYLOAD_B64 ?? "", "base64")
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { method?: string });
    expect(replayed.map((m) => m.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);

    expect(received).toHaveLength(2);
    const secondPayload = JSON.stringify(received[1]);
    expect(secondPayload).not.toContain(secretValue);
    expect(secondPayload).toContain("[REDACTED:API_TOKEN]");
  });

  test("redacts stderr when stdio server fails without returning matching JSON-RPC id", async () => {
    const secretValue = "ghp_secret_value_abc12345";
    const sandbox = createMockSandbox(async () => ({
      stdout: "banner line\n",
      stderr: `fatal auth failure for ${secretValue}`,
      exitCode: 1,
    }));

    const transport = new SandboxStdioMcpTransport({
      name: "failing-stdio",
      command: "broken-mcp",
      sandbox,
      secretRedactor: createSecretRedactor([
        { name: "GH_PAT", value: secretValue },
      ]),
    });

    await transport.start();
    await expect(
      transport.send({
        jsonrpc: "2.0",
        id: 42,
        method: "tools/list",
      }),
    ).rejects.toThrow("[REDACTED:GH_PAT]");
  });

  test("rejects invalid env variable identifiers", async () => {
    const sandbox = createMockSandbox(async () => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
    }));

    const transport = new SandboxStdioMcpTransport({
      name: "bad-env",
      command: "mcp",
      env: { "BAD;ENV": "val" },
      sandbox,
    });

    await transport.start();
    await expect(
      transport.send({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    ).rejects.toThrow('Invalid environment variable name "BAD;ENV"');
  });
});
