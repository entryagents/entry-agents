import { Boxd } from "@boxd-sh/sdk";
import type { ConnectOptions } from "../factory.ts";
import type { Sandbox } from "../interface.ts";
import {
  BOXD_DISK,
  BOXD_WORKING_DIRECTORY,
  isBoxdConfigured,
  resolveBoxdMachineSize,
} from "./config.ts";
import type { BoxdState } from "./state.ts";
import { BoxdSandbox } from "./sandbox.ts";
import { provisionBoxdMachineWithEviction } from "./eviction.ts";
import { buildToolchainBootstrapScript } from "../toolchain.ts";

function createBoxdMachine(
  client: Boxd,
  name: string,
  options?: ConnectOptions,
) {
  const size = resolveBoxdMachineSize(options?.vcpus);
  return client.machines.create({
    name,
    // Omit `image` by default so Boxd boots its full Linux VM with systemd
    // (/sbin/init as PID 1) and boxd-agentd. Passing a bare OCI image like
    // "ubuntu:24.04" runs every `exec` as PID 1 in an ephemeral PID namespace,
    // causing the kernel to SIGKILL all backgrounded dev servers on exec exit.
    ...(options?.image ? { image: options.image } : {}),
    isolated: true,
    restartPolicy: "never",
    config: {
      vcpu: size.vcpu,
      memory: size.memory,
      disk: BOXD_DISK,
      autoSuspendTimeout: options?.autoSuspendSeconds ?? 180,
      autoDestroyTimeout: options?.autoDestroySeconds ?? 14 * 24 * 3600,
      ssh: true,
    },
  });
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Wraps a git command so credentials travel via a short-lived, mode-0700
 * `GIT_ASKPASS` helper (cleaned up by an `EXIT` trap) rather than appearing
 * inside CLI URL arguments (`git clone https://x-access-token:...@...`) or
 * persisted `.git/config` remotes.
 */
function wrapWithGitAskPass(gitCommand: string, token: string): string {
  const b64Token = Buffer.from(token, "utf8").toString("base64");
  const askPassVar = 'ASKPASS_SCRIPT="/tmp/.entry_git_askpass_$$.sh"';
  const writeHelper = [
    "(umask 077 && cat > \"$ASKPASS_SCRIPT\" <<'EOF_ASKPASS'",
    "#!/bin/sh",
    'case "$1" in',
    '  *Username*|*username*) printf "%s\\n" "x-access-token" ;;',
    `  *) printf "%s" ${shellEscape(b64Token)} | base64 -d ;;`,
    "esac",
    "EOF_ASKPASS",
    ")",
    'chmod 700 "$ASKPASS_SCRIPT"',
  ].join("\n");
  return [
    askPassVar,
    writeHelper,
    `GIT_TERMINAL_PROMPT=0 GIT_ASKPASS="$ASKPASS_SCRIPT" ${gitCommand}`,
    "gitExit=$?",
    'rm -f "$ASKPASS_SCRIPT"',
    "(exit $gitExit)",
  ].join("\n");
}

async function bootstrapWorkspace(
  sandbox: BoxdSandbox,
  state: BoxdState,
  options?: ConnectOptions,
): Promise<void> {
  if (options?.skipGitWorkspaceBootstrap) {
    await sandbox
      .exec(buildToolchainBootstrapScript(), BOXD_WORKING_DIRECTORY, 60_000)
      .catch(() => undefined);
    return;
  }

  const workDir = sandbox.workingDirectory;
  const source = state.source;
  const git = "git";

  // The bare ubuntu image does not guarantee git. Provisioning failed in
  // production with a raw "git: command not found" from the clone below,
  // surfacing as a fatal provisioning error that wedged the session.
  // Probe order: boxd machines run as ROOT with no sudo binary, so the
  // plain apt-get path is the one that works (verified against the live
  // boxd API); sudo -n stays as the fallback for non-root images.
  const hasGit = await sandbox.exec("command -v git", workDir, 30_000);
  if (!hasGit.success) {
    const installPlain = await sandbox.exec(
      "apt-get update -qq && apt-get install -y -qq git",
      workDir,
      300_000,
    );
    if (!installPlain.success) {
      const installSudo = await sandbox.exec(
        "sudo -n apt-get update -qq && sudo -n apt-get install -y -qq git",
        BOXD_WORKING_DIRECTORY,
        300_000,
      );
      if (!installSudo.success) {
        throw new Error(
          "Failed to initialize workspace: git is not installed on the boxd " +
            "machine and could not be installed (no root/sudo access). " +
            "Install git in the machine image or grant the runtime user " +
            "package access.",
        );
      }
    }
    const verify = await sandbox.exec(
      "command -v git",
      BOXD_WORKING_DIRECTORY,
      30_000,
    );
    if (!verify.success) {
      throw new Error(
        "Failed to initialize workspace: git still missing after install attempt",
      );
    }
  }

  if (source?.repo) {
    // Do not send a compound if/then/else shell program to the provider. The
    // boxd command runner has historically parsed that form inconsistently,
    // producing `/bin/sh: then: unexpected` and wedging reconnects. Probe the
    // directory first, then issue one simple command per branch.
    const hasRepository = await sandbox.exec(
      `test -d ${shellEscape(`${BOXD_WORKING_DIRECTORY}/.git`)}`,
      BOXD_WORKING_DIRECTORY,
      30_000,
    );
    const branch = source.branch
      ? ` --branch ${shellEscape(source.branch)}`
      : "";
    if (hasRepository.success) {
      if (options?.githubToken) {
        const cleanRemoteCmd = `${git} -C ${shellEscape(BOXD_WORKING_DIRECTORY)} remote set-url origin ${shellEscape(source.repo)}`;
        await sandbox.exec(cleanRemoteCmd, BOXD_WORKING_DIRECTORY, 30_000);
        const fetchCmd =
          `${git} -C ${shellEscape(BOXD_WORKING_DIRECTORY)} fetch --all --prune` +
          (source.branch
            ? ` && ${git} -C ${shellEscape(BOXD_WORKING_DIRECTORY)} checkout ${shellEscape(source.branch)}`
            : "");
        const fetchRes = await sandbox.exec(
          wrapWithGitAskPass(fetchCmd, options.githubToken),
          BOXD_WORKING_DIRECTORY,
          60_000,
        );
        if (!fetchRes.success) {
          console.warn("[boxd] Workspace git fetch warning:", fetchRes.stderr);
        }
      }
    } else {
      const cloneCmd = `${git} clone${branch} ${shellEscape(source.repo)} ${shellEscape(BOXD_WORKING_DIRECTORY)}`;
      const command = options?.githubToken
        ? wrapWithGitAskPass(cloneCmd, options.githubToken)
        : cloneCmd;
      const result = await sandbox.exec(
        command,
        BOXD_WORKING_DIRECTORY,
        180_000,
      );
      if (!result.success) {
        throw new Error(`Failed to prepare workspace: ${result.stderr.trim()}`);
      }
    }

    if (source.newBranch) {
      const checkout = await sandbox.exec(
        `git checkout -B ${shellEscape(source.newBranch)}`,
        BOXD_WORKING_DIRECTORY,
        30_000,
      );
      if (!checkout.success) {
        throw new Error(`Failed to create branch: ${checkout.stderr.trim()}`);
      }
    }
  } else {
    const result = await sandbox.exec(
      `test -d ${shellEscape(`${BOXD_WORKING_DIRECTORY}/.git`)} || git init ${shellEscape(BOXD_WORKING_DIRECTORY)}`,
      BOXD_WORKING_DIRECTORY,
      30_000,
    );
    if (!result.success) {
      throw new Error(
        `Failed to initialize workspace: ${result.stderr.trim()}`,
      );
    }
  }

  if (options?.gitUser) {
    const result = await sandbox.exec(
      `git config user.name ${shellEscape(options.gitUser.name)} && ` +
        `git config user.email ${shellEscape(options.gitUser.email)}`,
      BOXD_WORKING_DIRECTORY,
      30_000,
    );
    if (!result.success) {
      throw new Error(
        `Failed to configure git identity: ${result.stderr.trim()}`,
      );
    }
  }

  // Best-effort modern CLI toolchain bootstrap (jq, rg, tmux, curl, python3, gh, vercel)
  await sandbox
    .exec(buildToolchainBootstrapScript(), BOXD_WORKING_DIRECTORY, 60_000)
    .catch(() => undefined);
}

export async function connectBoxd(
  state: BoxdState,
  options?: ConnectOptions,
): Promise<Sandbox> {
  if (!isBoxdConfigured())
    throw new Error("boxd is not configured: set BOXD_API_KEY or BOXD_TOKEN");
  const client = new Boxd();
  // Older sessions may have a durable machineId but no machineName because
  // they were created before deterministic naming was persisted. Resolve the
  // machine by id first and recover its provider name instead of forcing the
  // user into a manual reprovision flow.
  let name = state.machineName;
  let machine = state.machineId
    ? await client.machines.get(state.machineId).catch(() => null)
    : name
      ? await client.machines.get(name).catch(() => null)
      : null;

  if (!name && machine?.name) {
    name = machine.name;
  }
  if (!name || /^entry-undefined(?:-|$)/.test(name)) {
    throw new Error(
      "boxd workspace is missing a stable machine name; reprovision the session",
    );
  }

  if (!machine) {
    try {
      machine = await provisionBoxdMachineWithEviction({
        targetMachineName: name,
        createMachine: () => createBoxdMachine(client, name, options),
        listMachines: () => client.machines.list(),
        deleteMachine: (machineId) => client.machines.delete(machineId),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("already taken")) throw error;
      machine = await client.machines.get(name).catch(() => null);
      if (!machine) {
        const machines = await client.machines.list();
        machine = machines.find((candidate) => candidate.name === name) ?? null;
      }
      if (!machine) throw error;
    }
  } else if (machine.status === "stopped") {
    await client.machines.start(machine.id);
  } else if (machine.status === "hibernated") {
    await client.machines.wake(machine.id);
  } else if (machine.status === "suspended") {
    await client.machines.resume(machine.id);
  }

  const suspendSeconds = options?.autoSuspendSeconds ?? 180;
  const hibernateSeconds = options?.autoHibernateSeconds ?? 600;

  // Ensure every Boxd machine automatically suspends and hibernates on the plan's aggressive schedule.
  await Promise.allSettled([
    client.machines.setAutoSuspendTimeout(machine.id, suspendSeconds),
    client.machines.setAutoHibernateTimeout(machine.id, hibernateSeconds),
  ]);

  try {
    await client.machines.waitUntilReady(machine.id);
  } catch (readyError) {
    const errorMsg =
      readyError instanceof Error ? readyError.message : String(readyError);
    if (
      errorMsg.includes("exec did not succeed") ||
      errorMsg.includes("terminal state") ||
      errorMsg.includes("did not reach 'running'")
    ) {
      console.warn(
        `[boxd] Machine ${machine.id} (${machine.name}) is hung/unhealthy: ${errorMsg}. Evicting and provisioning fresh VM.`,
      );
      await client.machines.delete(machine.id).catch(() => {});
      machine = await createBoxdMachine(client, name, options);
      await Promise.allSettled([
        client.machines.setAutoSuspendTimeout(machine.id, suspendSeconds),
        client.machines.setAutoHibernateTimeout(machine.id, hibernateSeconds),
      ]);
      await client.machines.waitUntilReady(machine.id);
    } else {
      throw readyError;
    }
  }
  await client.machines
    .setBotProtection(machine.id, false)
    .catch(() => undefined);

  const targetPorts = Array.from(
    new Set(
      options?.ports && options.ports.length > 0
        ? options.ports
        : [3000, 5173, 4321, 8000, 8888],
    ),
  );
  const proxyPorts = new Set<number>();
  try {
    const existingProxies = await client.machines.proxies.list(machine.id);
    const byName = new Map(
      existingProxies
        .filter(
          (proxy): proxy is typeof proxy & { name: string } =>
            typeof proxy.name === "string" && proxy.name.length > 0,
        )
        .map((proxy) => [proxy.name, proxy]),
    );
    await Promise.all(
      targetPorts.map(async (port) => {
        const routeName = `p${port}`;
        const existing = byName.get(routeName);
        if (!existing) {
          await client.machines.proxies.create(machine.id, routeName, port);
        } else if (existing.port !== port) {
          await client.machines.proxies.setPort(machine.id, port, {
            name: routeName,
          });
        }
        proxyPorts.add(port);
      }),
    );
  } catch {
    // Named proxies are best-effort; BoxdSandbox.domain falls back to the machine's default HTTPS route.
  }

  const targetWorkDir = options?.workingDirectory ?? BOXD_WORKING_DIRECTORY;
  await client.machines.exec(machine.id, {
    command: ["mkdir", "-p", targetWorkDir],
  });
  const baseDomain = machine.access?.domain || "boxd.sh";
  const isLegacyContainerImage =
    typeof machine.imageRef === "string" && /^ubuntu:/i.test(machine.imageRef);
  const sandbox = new BoxdSandbox(
    client,
    machine.id,
    machine.name,
    options,
    baseDomain,
    proxyPorts,
    isLegacyContainerImage,
  );
  await sandbox.setGitHubAuthToken(options?.githubToken);
  try {
    await bootstrapWorkspace(sandbox, state, options);
  } finally {
    await sandbox.setGitHubAuthToken(undefined);
  }
  return sandbox;
}

export async function listAllBoxdMachines(): Promise<
  Array<{
    id: string;
    name: string;
    status: string;
    createdAt?: string;
  }>
> {
  const client = new Boxd();
  const machines = await client.machines.list();
  return machines.map((m) => ({
    id: m.id,
    name: m.name,
    status: m.status,
    createdAt: m.createdAt ? String(m.createdAt) : undefined,
  }));
}

export async function deleteAllBoxdMachines(): Promise<{
  deletedCount: number;
  remainingCount: number;
}> {
  const client = new Boxd();
  const machines = await client.machines.list();
  let deletedCount = 0;
  for (const m of machines) {
    try {
      await client.machines.delete(m.id);
      deletedCount++;
    } catch (err) {
      console.warn(`[boxd] Failed to delete machine ${m.id}:`, err);
    }
  }
  const remaining = await client.machines.list().catch(() => []);
  return {
    deletedCount,
    remainingCount: remaining.length,
  };
}
