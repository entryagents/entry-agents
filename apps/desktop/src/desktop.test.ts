import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AGENTS, buildPlanModeReminder } from "./agent/agents";
import {
  BUILD_PERMISSION_RULESET,
  evaluatePermission,
  PLAN_PERMISSION_RULESET,
} from "./permission/permission";
import { type RunningSidecarServer, startSidecarServer } from "./server/server";

describe("Entry Agents Core & Entry Agents Architecture Parity", () => {
  let server: RunningSidecarServer;

  beforeEach(() => {
    server = startSidecarServer({
      port: 0,
      dbPath: ":memory:",
      entryBaseUrl: "https://entry-agents.dev",
    });
  });

  afterEach(() => {
    server.stop();
  });

  test("Health probe (/global/health) returns healthy status", async () => {
    const res = await fetch(`${server.url}/global/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { healthy: boolean; service: string };
    expect(data.healthy).toBe(true);
    expect(data.service).toBe("entry-agent-sidecar");
  });

  test("Entry Agents permission evaluator enforces Plan mode read-only + .entry/plan/*.md exception", () => {
    expect(
      evaluatePermission(PLAN_PERMISSION_RULESET, "read", "src/index.ts"),
    ).toBe("allow");
    expect(evaluatePermission(PLAN_PERMISSION_RULESET, "read", ".env")).toBe(
      "ask",
    );
    expect(
      evaluatePermission(PLAN_PERMISSION_RULESET, "read", ".env.example"),
    ).toBe("allow");
    expect(
      evaluatePermission(PLAN_PERMISSION_RULESET, "edit", "src/index.ts"),
    ).toBe("deny");
    expect(
      evaluatePermission(PLAN_PERMISSION_RULESET, "bash", "rm -rf /"),
    ).toBe("deny");
    expect(
      evaluatePermission(
        PLAN_PERMISSION_RULESET,
        "write",
        "/workspace/.entry/plan/arch.md",
      ),
    ).toBe("allow");
    expect(
      evaluatePermission(BUILD_PERMISSION_RULESET, "edit", "src/index.ts"),
    ).toBe("allow");
    expect(evaluatePermission(BUILD_PERMISSION_RULESET, "edit", ".env")).toBe(
      "ask",
    );
  });

  test("Plan mode injects <system-reminder> with .entry/plan/<slug>.md path", () => {
    const reminder = buildPlanModeReminder("/workspace/app", "my-feature");
    expect(reminder).toContain("<system-reminder>");
    expect(reminder).toContain("/workspace/app/.entry/plan/my-feature.md");
    expect(AGENTS.plan.name).toBe("plan");
    expect(AGENTS.build.name).toBe("build");
  });

  test("Session creation, Plan mode blueprint generation, and Build mode verification gate work end-to-end", async () => {
    const createRes = await fetch(`${server.url}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Multi-Agent Blueprint",
        agent: "plan",
        modelId: "anthropic/claude-sonnet-4.5",
      }),
    });
    expect(createRes.status).toBe(200);
    const { session } = (await createRes.json()) as {
      session: { id: string; agent: string };
    };
    expect(session.agent).toBe("plan");

    // Send prompt in Plan mode
    const msgRes = await fetch(`${server.url}/session/${session.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Design the 3-column Entry Agents architecture",
        agent: "plan",
        modelId: "anthropic/claude-sonnet-4.5",
      }),
    });
    expect(msgRes.status).toBe(200);
    const turnData = (await msgRes.json()) as {
      assistantText: string;
      artifacts: Array<{ kind: string }>;
    };
    expect(turnData.assistantText).toContain("Architectural Blueprint");
    expect(turnData.artifacts.length).toBeGreaterThan(0);

    // Switch to Build mode and verify Verification Gate runs
    const buildRes = await fetch(
      `${server.url}/session/${session.id}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Implement and verify the changes",
          agent: "build",
          modelId: "anthropic/claude-sonnet-4.5",
        }),
      },
    );
    expect(buildRes.status).toBe(200);
    const buildData = (await buildRes.json()) as {
      verified: boolean;
      verificationSummary: string;
    };
    expect(typeof buildData.verified).toBe("boolean");
    expect(buildData.verificationSummary).toBeTruthy();
  });

  test("Live models endpoint (/models) fetches real models from https://entry-agents.dev with zero hardcoded models", async () => {
    const res = await fetch(`${server.url}/models`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      models: Array<{ id: string; name: string }>;
      sourceUrl: string;
    };
    expect(data.sourceUrl).toContain("https://entry-agents.dev/api/");
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models.length).toBeGreaterThan(0);
  }, 15_000);

  test("All 12 built-in entryagents.* plugins and /mcp endpoints are registered and functional", async () => {
    const plugRes = await fetch(`${server.url}/plugin`);
    expect(plugRes.status).toBe(200);
    const { plugins } = (await plugRes.json()) as {
      plugins: Array<{ id: string; enabled: boolean }>;
    };
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("entryagents.agent");
    expect(ids).toContain("entryagents.plan");
    expect(ids).toContain("entryagents.goal");
    expect(ids).toContain("entryagents.command");
    expect(ids).toContain("entryagents.skill");
    expect(ids).toContain("entryagents.prompt.optimize");
    expect(ids).toContain("entryagents.prompt.identity");
    expect(ids).toContain("entryagents.prompt.verbosity");
    expect(ids).toContain("entryagents.tool.input.repair");
    expect(ids).toContain("entryagents.mcp");
    expect(ids).toContain("entryagents.warming");
    expect(ids).toContain("entryagents.verification");

    const mcpPost = await fetch(`${server.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "docs",
        transport: "http",
        url: "https://mcp.entry-agents.dev/mcp",
      }),
    });
    expect(mcpPost.status).toBe(200);

    const mcpGet = await fetch(`${server.url}/mcp`);
    expect(mcpGet.status).toBe(200);
    const { servers } = (await mcpGet.json()) as {
      servers: Array<{ name: string; url: string }>;
    };
    expect(servers.some((s) => s.name === "docs")).toBe(true);
  });
});
