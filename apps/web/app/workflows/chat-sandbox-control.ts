import { withoutUndefined } from "@/app/workflows/serialization";

async function connectRunningSessionSandbox(sessionId: string) {
  const [{ getSessionById }, { connectSandbox }, { canOperateOnSandbox }] =
    await Promise.all([
      import("@/lib/db/sessions"),
      import("@entry-agents/sandbox"),
      import("@/lib/sandbox/utils"),
    ]);

  const session = await getSessionById(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (session.status === "archived") {
    throw new Error("Session is archived");
  }
  if (!canOperateOnSandbox(session.sandboxState)) {
    throw new Error(
      "There is no active workspace. Start or reconnect the workspace first.",
    );
  }

  const sandbox = await connectSandbox(session.sandboxState);
  return { session, sandbox };
}

function shellEscapeArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function serveSandboxStep(params: {
  sessionId: string;
  port: number | null;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  const targetPort = params.port ?? 3000;
  const url = sandbox.domain
    ? sandbox.domain(targetPort)
    : `http://localhost:${targetPort}`;

  const probe = await sandbox.exec(
    `lsof -i :${targetPort} -sTCP:LISTEN -t 2>/dev/null || true`,
    sandbox.workingDirectory,
    5_000,
  );
  const pid = probe.stdout.trim();
  if (pid) {
    return withoutUndefined({
      running: true,
      port: targetPort,
      pid,
      url,
    });
  }

  if (!sandbox.execDetached) {
    return {
      running: false,
      port: targetPort,
      error: "Detached background execution is not supported.",
    };
  }

  const { commandId } = await sandbox.execDetached(
    `npm run dev -- -p ${targetPort}`,
    sandbox.workingDirectory,
  );
  return withoutUndefined({
    running: true,
    port: targetPort,
    commandId,
    url,
  });
}

export async function stopServeSandboxStep(params: {
  sessionId: string;
  port: number | null;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  const targetPort = params.port ?? 3000;
  await sandbox.exec(
    `fuser -k -9 ${targetPort}/tcp 2>/dev/null || (lsof -ti:${targetPort} 2>/dev/null | xargs kill -9 2>/dev/null) || true`,
    sandbox.workingDirectory,
    5_000,
  );
  return { stopped: true, port: targetPort };
}

export async function listSandboxProcessesStep(
  sessionId: string,
): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(sessionId);
  const res = await sandbox.exec(
    "ps aux --sort=-%cpu | head -n 30",
    sandbox.workingDirectory,
    10_000,
  );
  return { processes: res.stdout };
}

export async function killSandboxProcessStep(params: {
  sessionId: string;
  processNameOrPid: string | null;
  port: number | null;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  if (params.port !== null) {
    await sandbox.exec(
      `fuser -k -9 ${params.port}/tcp 2>/dev/null || (lsof -ti:${params.port} 2>/dev/null | xargs kill -9 2>/dev/null) || true`,
      sandbox.workingDirectory,
      5_000,
    );
    return { killed: true, port: params.port };
  }

  if (params.processNameOrPid) {
    const trimmed = params.processNameOrPid.trim();
    if (/^[1-9][0-9]*$/.test(trimmed) && sandbox.killCommand) {
      await sandbox.killCommand(trimmed);
      return { killed: true, target: trimmed };
    }
    await sandbox.exec(
      `pkill -9 -f ${shellEscapeArg(trimmed)} || kill -9 ${shellEscapeArg(trimmed)} 2>/dev/null || true`,
      sandbox.workingDirectory,
      5_000,
    );
    return { killed: true, target: trimmed };
  }

  return {
    killed: false,
    error: "Provide port or processNameOrPid to kill",
  };
}

export async function getSandboxEnvStep(params: {
  sessionId: string;
  key: string | null;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  const res = await sandbox.exec(
    `if [ -f "$HOME/.entry_session_env" ]; then cat "$HOME/.entry_session_env"; fi`,
    sandbox.workingDirectory,
    10_000,
  );
  if (params.key) {
    const safeKey = params.key.replace(/[^a-zA-Z0-9_]/g, "");
    const matchingLines = res.stdout
      .split("\n")
      .filter((line) => line.startsWith(`export ${safeKey}=`));
    return { key: safeKey, env: matchingLines.join("\n") };
  }
  return { env: res.stdout };
}

export async function setSandboxEnvStep(params: {
  sessionId: string;
  key: string;
  value: string;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  const safeKey = params.key.replace(/[^a-zA-Z0-9_]/g, "");
  if (!safeKey) {
    throw new Error(
      "envKey must contain alphanumeric or underscore characters",
    );
  }
  await sandbox.exec(
    `mkdir -p "$HOME" && echo "export ${safeKey}=${shellEscapeArg(params.value)}" >> "$HOME/.entry_session_env"`,
    sandbox.workingDirectory,
    10_000,
  );
  return { key: safeKey, set: true };
}

export async function createSandboxCheckpointStep(params: {
  sessionId: string;
  name: string | null;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  if (!sandbox.createCheckpoint) {
    throw new Error(
      "Workspace action 'checkpoint_create' is not supported by the current workspace provider.",
    );
  }
  const checkpoint = await sandbox.createCheckpoint(
    params.name ?? `cp-${Date.now()}`,
  );
  return withoutUndefined({ checkpoint });
}

export async function listSandboxCheckpointsStep(
  sessionId: string,
): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(sessionId);
  if (!sandbox.listCheckpoints) {
    throw new Error(
      "Workspace action 'checkpoint_list' is not supported by the current workspace provider.",
    );
  }
  const checkpoints = await sandbox.listCheckpoints();
  return withoutUndefined({ checkpoints });
}

export async function restoreSandboxCheckpointStep(params: {
  sessionId: string;
  name: string;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  if (!sandbox.restoreCheckpoint) {
    throw new Error(
      "Workspace action 'checkpoint_restore' is not supported by the current workspace provider.",
    );
  }
  await sandbox.restoreCheckpoint(params.name);
  return { restored: true, checkpointName: params.name };
}

export async function deleteSandboxCheckpointStep(params: {
  sessionId: string;
  name: string;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  if (!sandbox.deleteCheckpoint) {
    throw new Error(
      "Workspace action 'checkpoint_delete' is not supported by the current workspace provider.",
    );
  }
  await sandbox.deleteCheckpoint(params.name);
  return { deleted: true, checkpointName: params.name };
}

export async function getSandboxLogsStep(params: {
  sessionId: string;
  maxChars: number | null;
}): Promise<Record<string, unknown>> {
  "use step";

  const { sandbox } = await connectRunningSessionSandbox(params.sessionId);
  if (!sandbox.getLogs) {
    throw new Error(
      "Workspace action 'logs' is not supported by the current workspace provider.",
    );
  }
  const logs = await sandbox.getLogs(params.maxChars ?? 12_000);
  return { logs };
}
