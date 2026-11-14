import { describe, expect, it } from "bun:test";
import { BUILTIN_PLUGIN_CATALOG } from "@entry-agents/agent";
import { parseAdminTelemetryWindow } from "./admin-telemetry";
import * as schema from "./schema";

describe("admin-telemetry", () => {
  it("parses valid telemetry windows and defaults to 24h", () => {
    expect(parseAdminTelemetryWindow("1h")).toBe("1h");
    expect(parseAdminTelemetryWindow("24h")).toBe("24h");
    expect(parseAdminTelemetryWindow("7d")).toBe("7d");
    expect(parseAdminTelemetryWindow("30d")).toBe("30d");
    expect(parseAdminTelemetryWindow("invalid")).toBe("24h");
    expect(parseAdminTelemetryWindow(null)).toBe("24h");
    expect(parseAdminTelemetryWindow(undefined)).toBe("24h");
  });

  it("verifies all 30 database tables exist in schema and built-in plugins catalog is populated", () => {
    const expectedTables = [
      "users",
      "accounts",
      "authSessions",
      "verification",
      "githubInstallations",
      "githubRepoIndex",
      "vercelProjectLinks",
      "sessions",
      "chats",
      "chatMessages",
      "chatSteeringInbox",
      "chatReads",
      "shares",
      "userPreferences",
      "modelOverrides",
      "platformSettings",
      "usageEvents",
      "billingUsageEvents",
      "creditTransactions",
      "billingWebhookEvents",
      "mcpServers",
      "composioSessions",
      "userSecrets",
      "userPlugins",
      "compactionEvents",
      "workflowRuns",
      "workflowRunSteps",
      "benchmarkRuns",
      "benchmarkResults",
      "feedback",
    ] as const;

    for (const tableName of expectedTables) {
      expect(schema[tableName]).toBeDefined();
    }
    expect(expectedTables.length).toBe(30);
    expect(BUILTIN_PLUGIN_CATALOG.length).toBeGreaterThanOrEqual(5);
  });
});
