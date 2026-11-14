import { describe, expect, test } from "bun:test";
import type { RuntimeSecret } from "@entry-agents/agent";
import {
  prepareMcpServersForExecution,
  resolveSingleMcpServerConfig,
} from "./resolve-server-config";

const SECRETS: RuntimeSecret[] = [
  {
    name: "LINEAR_API_KEY",
    value: "lin_api_secret_987654",
    allowedHosts: ["93.184.216.34"],
  },
  {
    name: "GITHUB_PAT",
    value: "ghp_secret_abc123456",
  },
];

describe("resolve-server-config", () => {
  test("resolves stdio env secret templates without hitting network/DNS", async () => {
    const used: string[] = [];
    const resolved = await resolveSingleMcpServerConfig(
      {
        name: "github",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "{{SECRET:GITHUB_PAT}}" },
      },
      SECRETS,
      (names) => used.push(...names),
    );

    expect(resolved).toEqual({
      name: "github",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_secret_abc123456" },
    });
    expect(used).toEqual(["GITHUB_PAT"]);
  });

  test("resolves HTTP headers when host matches secret allowedHosts and rejects disallowed/private URLs", async () => {
    const resolved = await resolveSingleMcpServerConfig(
      {
        name: "linear",
        transport: "http",
        url: "https://93.184.216.34/mcp",
        headers: { Authorization: "Bearer {{SECRET:LINEAR_API_KEY}}" },
      },
      SECRETS,
    );

    expect(resolved.transport).toBe("http");
    if (resolved.transport === "http") {
      expect(resolved.headers?.Authorization).toBe(
        "Bearer lin_api_secret_987654",
      );
    }

    const batch = await prepareMcpServersForExecution(
      [
        {
          id: "s1",
          name: "bad-host",
          transport: "http",
          url: "https://1.1.1.1/mcp",
          headers: { Authorization: "Bearer {{SECRET:LINEAR_API_KEY}}" },
        },
        {
          id: "s2",
          name: "private-ip",
          transport: "http",
          url: "http://127.0.0.1:8080/mcp",
        },
      ],
      SECRETS,
    );

    expect(batch.resolvedServers).toHaveLength(0);
    expect(batch.failures).toHaveLength(2);
    expect(batch.failures[0]?.name).toBe("bad-host");
    expect(batch.failures[0]?.error).not.toContain("lin_api_secret_987654");
    expect(batch.failures[1]?.name).toBe("private-ip");
  });
});
