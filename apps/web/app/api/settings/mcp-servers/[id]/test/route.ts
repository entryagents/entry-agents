import {
  createSecretRedactor,
  discoverMcpServerTools,
} from "@entry-agents/agent";
import {
  connectSandbox,
  isKnownSandboxType,
  type Sandbox,
  type SandboxState,
} from "@entry-agents/sandbox";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  getMcpServerByIdForExecution,
  recordMcpServerConnectionResult,
} from "@/lib/db/mcp-servers";
import { sessions } from "@/lib/db/schema";
import {
  getDecryptedUserSecretsForExecution,
  recordUserSecretsUsed,
} from "@/lib/db/secrets";
import { resolveSingleMcpServerConfig } from "@/lib/mcp/resolve-server-config";
import { getServerSession } from "@/lib/session/get-server-session";

function hasSandboxState(value: unknown): value is SandboxState {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string" &&
    isKnownSandboxType((value as { type: string }).type),
  );
}

async function findActiveSandboxForUser(
  userId: string,
): Promise<Sandbox | undefined> {
  const rows = await db
    .select({
      sandboxState: sessions.sandboxState,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNotNull(sessions.sandboxState)))
    .orderBy(desc(sessions.updatedAt))
    .limit(5);

  const preferred = rows.find((r) => hasSandboxState(r.sandboxState));
  if (!preferred || !hasSandboxState(preferred.sandboxState)) {
    return undefined;
  }

  return connectSandbox(preferred.sandboxState);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const server = await getMcpServerByIdForExecution(session.user.id, id);
  if (!server) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { secrets } = await getDecryptedUserSecretsForExecution(
    session.user.id,
  );
  const redactor = createSecretRedactor(secrets);
  const usedSecrets = new Set<string>();

  try {
    const resolved = await resolveSingleMcpServerConfig(
      server,
      secrets,
      (names) => {
        for (const name of names) usedSecrets.add(name);
      },
    );

    let sandbox: Sandbox | undefined;
    if (resolved.transport === "stdio") {
      sandbox = await findActiveSandboxForUser(session.user.id);
      if (!sandbox) {
        const message =
          "Stdio MCP servers run inside your session sandbox. Open or start any workspace session first, then click Test.";
        await recordMcpServerConnectionResult(server.id, message).catch(
          () => {},
        );
        return Response.json({
          ok: false,
          latencyMs: 0,
          tools: [],
          error: message,
        });
      }
    }

    const result = await discoverMcpServerTools(resolved, {
      sandbox,
      secretRedactor: redactor,
      connectTimeoutMs: 20_000,
    });

    if (usedSecrets.size > 0) {
      await recordUserSecretsUsed(session.user.id, [...usedSecrets]).catch(
        () => {},
      );
    }

    await recordMcpServerConnectionResult(
      server.id,
      result.ok ? null : (result.error ?? "Connection failed"),
      result.ok
        ? result.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
          }))
        : undefined,
    ).catch(() => {});

    return Response.json(result);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const safeError = redactor.hasSecrets() ? redactor.redact(raw) : raw;
    await recordMcpServerConnectionResult(server.id, safeError).catch(() => {});
    return Response.json({
      ok: false,
      latencyMs: 0,
      tools: [],
      error: safeError,
    });
  }
}
