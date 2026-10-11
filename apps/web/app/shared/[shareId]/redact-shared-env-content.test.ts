import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { redactSharedEnvContent } from "./redact-shared-env-content";

// SECURITY REGRESSION TEST (2026-08-27, pentest finding): a shared
// session's raw `bash` tool stdout/stderr was never scanned for
// secret-looking lines at all, unlike read/write/edit which already
// had .env-path based redaction. Cover both the top-level bash call
// and a bash call nested inside a sub-agent's `task` output.
describe("redactSharedEnvContent", () => {
  test("redacts secret-looking lines from a top-level bash tool's stdout/stderr", () => {
    const message: WebAgentUIMessage = {
      id: "m1",
      role: "assistant",
      parts: [
        {
          type: "tool-bash",
          toolCallId: "call-1",
          state: "output-available",
          input: { command: "env | grep API" },
          output: {
            stdout:
              "some normal output\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx\nmore normal output",
            stderr: "Authorization: Bearer some-real-token-value-here",
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as {
      output: { stdout: string; stderr: string };
    };

    expect(part.output.stdout).toBe(
      "some normal output\n[line redacted from shared page -- looked like a secret]\nmore normal output",
    );
    expect(part.output.stderr).toBe(
      "[line redacted from shared page -- looked like a secret]",
    );
  });

  test("leaves ordinary bash output completely untouched", () => {
    const message: WebAgentUIMessage = {
      id: "m2",
      role: "assistant",
      parts: [
        {
          type: "tool-bash",
          toolCallId: "call-2",
          state: "output-available",
          input: { command: "npm test" },
          output: { stdout: "24 pass\n0 fail", stderr: "" },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as {
      output: { stdout: string; stderr: string };
    };

    expect(part.output.stdout).toBe("24 pass\n0 fail");
    expect(part.output.stderr).toBe("");
  });

  test("redacts secret-looking lines from a bash call nested inside a sub-agent task's final output", () => {
    const message: WebAgentUIMessage = {
      id: "m3",
      role: "assistant",
      parts: [
        {
          type: "tool-task",
          toolCallId: "call-task",
          state: "output-available",
          input: { task: "Check env", subagentType: "executor" },
          output: {
            final: [
              {
                role: "assistant",
                content: [
                  {
                    type: "tool-call",
                    toolCallId: "call-bash-nested",
                    toolName: "bash",
                    input: { command: "cat .env" },
                  },
                ],
              },
              {
                role: "tool",
                content: [
                  {
                    type: "tool-result",
                    toolCallId: "call-bash-nested",
                    output: {
                      stdout: "DATABASE_PASSWORD=super-secret-value",
                      stderr: "",
                    },
                  },
                ],
              },
            ],
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as {
      output: { final: Array<{ content: Array<Record<string, unknown>> }> };
    };
    const nestedToolResult = part.output.final[1]?.content[0] as {
      output: { stdout: string; stderr: string };
    };

    expect(nestedToolResult.output.stdout).toBe(
      "[line redacted from shared page -- looked like a secret]",
    );
  });
  // SECURITY REGRESSION TEST (2026-10-11): read/write/edit redaction was
  // gated on isEnvFilePath (basename starts with ".env") only, so a shared
  // chat where the agent read ~/.ssh/id_rsa, ~/.aws/credentials, ~/.npmrc,
  // secrets.yaml or a *.pem rendered that file in full on the public share
  // page. The 2026-08-27 fix line-scanned bash output but never extended
  // the same scan to the structured read/write/edit parts.
  test("redacts secret-looking lines from a read of a non-.env sensitive file", () => {
    const message: WebAgentUIMessage = {
      id: "m-read",
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          toolCallId: "call-read",
          state: "output-available",
          input: { filePath: "/home/user/.ssh/id_rsa" },
          output: {
            content: [
              "1: -----BEGIN OPENSSH PRIVATE KEY-----",
              "2: b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAAB",
              "3: -----END OPENSSH PRIVATE KEY-----",
            ].join("\n"),
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as {
      output: { content: string };
    };
    const lines = part.output.content.split("\n");

    expect(lines[0]).toBe(
      "1: [line redacted from shared page -- looked like a secret]",
    );
    expect(lines[2]).toBe(
      "3: [line redacted from shared page -- looked like a secret]",
    );
  });

  test("keeps ordinary read output of a non-.env file intact", () => {
    const message: WebAgentUIMessage = {
      id: "m-read-ok",
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          toolCallId: "call-read-ok",
          state: "output-available",
          input: { filePath: "/workspace/src/index.ts" },
          output: {
            content: [
              "1: export const hello = () => {",
              "2:   return 1;",
              "3: };",
            ].join("\n"),
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as {
      output: { content: string };
    };

    expect(part.output.content).toBe(
      ["1: export const hello = () => {", "2:   return 1;", "3: };"].join("\n"),
    );
  });

  test("redacts secret-looking lines from write content on a non-.env path", () => {
    const message: WebAgentUIMessage = {
      id: "m-write",
      role: "assistant",
      parts: [
        {
          type: "tool-write",
          toolCallId: "call-write",
          state: "input-available",
          input: {
            filePath: "/workspace/config/secrets.yaml",
            content: [
              "service: api",
              "database_url: postgres://admin:hunter2@db.internal:5432/prod",
              "replicas: 3",
            ].join("\n"),
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as { input: { content: string } };
    const lines = part.input.content.split("\n");

    expect(lines[0]).toBe("service: api");
    expect(lines[1]).toBe(
      "[line redacted from shared page -- looked like a secret]",
    );
    expect(lines[2]).toBe("replicas: 3");
  });

  test("still fully redacts .env reads regardless of content", () => {
    const message: WebAgentUIMessage = {
      id: "m-env",
      role: "assistant",
      parts: [
        {
          type: "tool-read",
          toolCallId: "call-env",
          state: "output-available",
          input: { filePath: "/workspace/.env.production" },
          output: {
            content: ["harmless looking line", "another harmless line"].join(
              "\n",
            ),
          },
        } as unknown as WebAgentUIMessage["parts"][number],
      ],
    };

    const redacted = redactSharedEnvContent(message);
    const part = redacted.parts[0] as unknown as {
      output: { content: string };
    };

    expect(part.output.content).toBe(
      ["[redacted from shared page]", "[redacted from shared page]"].join("\n"),
    );
  });
});
