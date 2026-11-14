import { describe, expect, it } from "bun:test";
import { BUILTIN_PLUGIN_CATALOG } from "@entry-agents/agent";
import {
  ADMIN_TELEMETRY_WINDOW_LABELS,
  ADMIN_TELEMETRY_WINDOWS,
  parseAdminTelemetryWindow,
  resolveProviderCacheMeta,
} from "./admin-telemetry";
import * as schema from "./schema";

describe("admin-telemetry", () => {
  it("parses all 17 telemetry windows (1h, 24h, 7d, 30d, 2m..11m, 1y, 2y, all) and defaults to 24h", () => {
    for (const w of ADMIN_TELEMETRY_WINDOWS) {
      expect(parseAdminTelemetryWindow(w)).toBe(w);
      expect(ADMIN_TELEMETRY_WINDOW_LABELS[w]).toBeTruthy();
    }
    expect(ADMIN_TELEMETRY_WINDOWS).toContain("2m");
    expect(ADMIN_TELEMETRY_WINDOWS).toContain("6m");
    expect(ADMIN_TELEMETRY_WINDOWS).toContain("11m");
    expect(ADMIN_TELEMETRY_WINDOWS).toContain("1y");
    expect(ADMIN_TELEMETRY_WINDOWS).toContain("2y");
    expect(ADMIN_TELEMETRY_WINDOWS).toContain("all");
    expect(parseAdminTelemetryWindow("invalid")).toBe("24h");
    expect(parseAdminTelemetryWindow(null)).toBe("24h");
    expect(parseAdminTelemetryWindow(undefined)).toBe("24h");
  });

  it("resolves provider cache strategies across Anthropic, OpenAI, Google, DeepSeek, and xAI", () => {
    expect(
      resolveProviderCacheMeta("anthropic/claude-sonnet-4.6", "anthropic")
        .providerKey,
    ).toBe("anthropic");
    expect(
      resolveProviderCacheMeta("openai/gpt-5.4", "openai").providerKey,
    ).toBe("openai");
    expect(
      resolveProviderCacheMeta("google/gemini-3.1-pro", "google").providerKey,
    ).toBe("google");
    expect(
      resolveProviderCacheMeta("deepseek/deepseek-v3.2", "deepseek")
        .providerKey,
    ).toBe("deepseek");
    expect(resolveProviderCacheMeta("xai/grok-4", "xai").providerKey).toBe(
      "xai",
    );
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
