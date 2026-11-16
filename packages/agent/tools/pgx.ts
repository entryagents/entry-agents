import { tool as createAiTool } from "ai";
import { z } from "zod";
import type { Sandbox } from "@entry-agents/sandbox";

const pgxInputSchema = z.object({
  action: z
    .enum(["mint", "query", "schema", "reset", "drop", "status"])
    .describe(
      "PGX database lifecycle action: 'mint' creates an isolated Postgres branch for this agent, 'query' runs SQL against it, 'schema' inspects tables/columns, 'reset' recreates the branch from template, 'drop' deletes it, 'status' lists active branches.",
    ),
  branchName: z
    .string()
    .optional()
    .describe(
      "Isolated database branch name (defaults to agent-scoped branch ID).",
    ),
  template: z
    .string()
    .optional()
    .default("app")
    .describe("Template database name to branch from (default: 'app')."),
  sql: z
    .string()
    .optional()
    .describe("SQL statement(s) to execute when action is 'query'."),
  ttl: z
    .string()
    .optional()
    .default("2h")
    .describe("Auto-expiry TTL for minted branch (e.g. '30m', '2h')."),
});

export type PgxToolInput = z.infer<typeof pgxInputSchema>;

function sanitizeBranchIdentifier(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "agent_db";
}

export function createPgxTool(options: { sandbox: Sandbox; agentId?: string }) {
  const defaultBranch = sanitizeBranchIdentifier(
    options.agentId ? `agent_${options.agentId}` : "agent_main",
  );

  return createAiTool({
    description:
      "Lightweight per-agent Postgres database (PGX). Each agent and subagent gets its own isolated, copy-on-write Postgres database branch in milliseconds for schema migrations, SQL testing, and data verification without touching production.",
    inputSchema: pgxInputSchema,
    execute: async (rawArgs) => {
      const args = pgxInputSchema.parse(rawArgs);
      const branch = sanitizeBranchIdentifier(args.branchName ?? defaultBranch);
      const template = sanitizeBranchIdentifier(args.template ?? "app");

      const runCmd = async (cmd: string) => {
        const res = await options.sandbox.exec(cmd, "/workspace", 30_000);
        return {
          exitCode: res.exitCode,
          stdout: res.stdout.trim(),
          stderr: res.stderr.trim(),
        };
      };

      if (args.action === "status") {
        const res = await runCmd("pgx --json ls 2>/dev/null || echo '[]'");
        return {
          action: "status",
          branch,
          available: res.exitCode === 0,
          output: res.stdout || res.stderr,
        };
      }

      if (args.action === "mint") {
        const res = await runCmd(
          `pgx branch ${template} ${branch} --ttl ${args.ttl ?? "2h"} 2>&1 || npx --yes pgxdb@latest branch ${template} ${branch} --ttl ${args.ttl ?? "2h"} 2>&1`,
        );
        const lines = res.stdout.split("\n").filter(Boolean);
        const databaseUrl =
          lines.find((l) => l.startsWith("postgres://")) ??
          lines[lines.length - 1] ??
          null;
        return {
          action: "mint",
          branch,
          template,
          databaseUrl,
          exitCode: res.exitCode,
          output: res.stdout || res.stderr,
        };
      }

      if (args.action === "drop") {
        const res = await runCmd(`pgx rm ${branch} 2>&1 || true`);
        return {
          action: "drop",
          branch,
          exitCode: res.exitCode,
          output: res.stdout || "Dropped",
        };
      }

      if (args.action === "reset") {
        await runCmd(`pgx rm ${branch} 2>&1 || true`);
        const res = await runCmd(
          `pgx branch ${template} ${branch} --ttl ${args.ttl ?? "2h"} 2>&1`,
        );
        return {
          action: "reset",
          branch,
          exitCode: res.exitCode,
          output: res.stdout || res.stderr,
        };
      }

      if (args.action === "schema") {
        const res = await runCmd(
          `DB_URL=$(pgx url ${branch} 2>/dev/null) && psql "$DB_URL" -c "\\dt+" 2>&1`,
        );
        return {
          action: "schema",
          branch,
          exitCode: res.exitCode,
          output: res.stdout || res.stderr,
        };
      }

      // action === "query"
      if (!args.sql?.trim()) {
        return {
          action: "query",
          branch,
          exitCode: 1,
          error: "sql parameter is required for action='query'",
        };
      }

      const encodedSql = Buffer.from(args.sql, "utf8").toString("base64");
      const res = await runCmd(
        `DB_URL=$(pgx url ${branch} 2>/dev/null) && echo "${encodedSql}" | base64 -d | psql "$DB_URL" -v ON_ERROR_STOP=1 2>&1`,
      );
      return {
        action: "query",
        branch,
        exitCode: res.exitCode,
        output: res.stdout || res.stderr,
      };
    },
  });
}
