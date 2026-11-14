import {
  createSecretRedactor,
  type McpServerConfig,
  resolveSecretRecordTemplates,
  resolveSecretTemplates,
  type RuntimeSecret,
} from "@entry-agents/agent";
import { resolveAndAssertPublic } from "./url-safety";

export interface ResolveMcpServersResult {
  resolvedServers: McpServerConfig[];
  failures: Array<{ id?: string; name: string; error: string }>;
}

export async function resolveSingleMcpServerConfig(
  server: McpServerConfig,
  secrets: readonly RuntimeSecret[],
  onSecretUsed?: (names: string[]) => void,
): Promise<McpServerConfig> {
  if (server.transport === "stdio") {
    const resolvedEnv = resolveSecretRecordTemplates(server.env, secrets, {
      onSecretUsed,
    });
    return {
      ...server,
      env: resolvedEnv,
    };
  }

  const initialHost = (() => {
    try {
      return new URL(server.url).hostname;
    } catch {
      return undefined;
    }
  })();

  const resolvedUrl = resolveSecretTemplates(server.url, secrets, {
    targetHost: initialHost,
    onSecretUsed,
  });

  await resolveAndAssertPublic(resolvedUrl);

  const finalHost = new URL(resolvedUrl).hostname;
  const resolvedHeaders = resolveSecretRecordTemplates(
    server.headers,
    secrets,
    {
      targetHost: finalHost,
      onSecretUsed,
    },
  );

  return {
    ...server,
    url: resolvedUrl,
    headers: resolvedHeaders,
  };
}

export async function prepareMcpServersForExecution(
  servers: Array<McpServerConfig & { id?: string }>,
  secrets: readonly RuntimeSecret[],
  onSecretUsed?: (names: string[]) => void,
): Promise<ResolveMcpServersResult> {
  const redactor = createSecretRedactor(secrets);
  const resolvedServers: McpServerConfig[] = [];
  const failures: Array<{ id?: string; name: string; error: string }> = [];

  for (const server of servers) {
    try {
      const resolved = await resolveSingleMcpServerConfig(
        server,
        secrets,
        onSecretUsed,
      );
      resolvedServers.push(resolved);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      failures.push({
        id: server.id,
        name: server.name,
        error: redactor.hasSecrets() ? redactor.redact(msg) : msg,
      });
    }
  }

  return { resolvedServers, failures };
}
