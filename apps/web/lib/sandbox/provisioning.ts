import "server-only";

import {
  connectSandbox,
  DEFAULT_SANDBOX_PROVIDER,
  requireSandboxProvider,
  type Sandbox,
  type SandboxProvider,
  type SandboxState,
  type Source,
} from "@entry-agents/sandbox";
import {
  getSessionById,
  getSessionsByUserId,
  updateSession,
  updateSessionIfNotArchived,
  type SessionRecord,
} from "@/lib/db/sessions";
import { getUserBillingState } from "@/lib/billing/credit-ledger";
import { getPlanDefinition } from "@/lib/billing/plans";
import {
  FREE_USER_SANDBOX_INACTIVITY_TIMEOUT_MS,
  getSandboxPlanPolicy,
  resolveFreeTierSandboxReuse,
  resolveSandboxVcpusForPlan,
} from "@/lib/billing/sandbox-limits";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { isUserAdmin } from "@/lib/db/users";
import { isHobbyResourceProfile } from "@/lib/deployment/resource-profile";
import {
  verifyRepoAccess,
  getRepoAccessErrorMessage,
} from "@/lib/github/access";
import {
  mintInstallationToken,
  revokeInstallationToken,
  type ScopedInstallationToken,
} from "@/lib/github/app";
import { getGitHubUserProfile } from "@/lib/github/users";
import {
  DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
  DEFAULT_SANDBOX_PORTS,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  getSandboxDriveConfig,
} from "@/lib/sandbox/config";
import {
  buildActiveLifecycleUpdate,
  getNextLifecycleVersion,
} from "@/lib/sandbox/lifecycle";
import { kickSandboxLifecycleWorkflow } from "@/lib/sandbox/lifecycle-kick";
import {
  clearSandboxState,
  isSandboxActive,
  isSandboxState,
} from "@/lib/sandbox/utils";
import { installGlobalSkills } from "@/lib/skills/global-skill-installer";
import { eq } from "drizzle-orm";

type UserRecord = {
  id: string;
  username: string;
  name: string | null;
  email: string | null;
};

export type ProvisionSessionSandboxResult = {
  sandbox: Sandbox;
  sandboxState: SandboxState;
  workingDirectory: string;
  currentBranch?: string;
  environmentDetails?: string;
  didSetupWorkspace: boolean;
  session: SessionRecord;
};

export class SessionArchivedDuringProvisioningError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} was archived during sandbox provisioning`);
    this.name = "SessionArchivedDuringProvisioningError";
  }
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

function buildSandboxSource(session: SessionRecord): Source | undefined {
  if (!session.cloneUrl) {
    return undefined;
  }

  const branchExistsOnOrigin = session.prNumber != null;
  const shouldCreateNewBranch = session.isNewBranch && !branchExistsOnOrigin;

  return {
    repo: session.cloneUrl,
    ...(shouldCreateNewBranch
      ? { newBranch: session.branch ?? undefined }
      : { branch: session.branch ?? "main" }),
  };
}

/**
 * Resolve the provider that owns this session.
 *
 * The session's persisted `sandboxState.type` IS the user's choice (it is
 * written at session-create from the registry-driven selector), so
 * provisioning reads it here instead of asserting a vendor. A persisted
 * type that is not registered throws rather than defaulting: silently
 * provisioning Vercel for a session that asked for Boat would defeat the
 * entire selector.
 */
function resolveSessionProvider(session: SessionRecord): SandboxProvider {
  const rawType = session.sandboxState?.type;
  if (rawType === undefined || rawType === null) {
    return requireSandboxProvider(DEFAULT_SANDBOX_PROVIDER);
  }
  return requireSandboxProvider(String(rawType));
}

async function buildSandboxState(
  session: SessionRecord,
  overrideExistingState?: SandboxState | null,
): Promise<SandboxState> {
  const provider = resolveSessionProvider(session);
  const existingState =
    overrideExistingState === undefined
      ? session.sandboxState
      : overrideExistingState;
  const source = buildSandboxSource(session);

  return await provider.buildProvisionState({
    existing: isSandboxState(existingState) ? existingState : undefined,
    sessionId: session.id,
    source,
  });
}

async function getGitUser(user: UserRecord) {
  const profile = await getGitHubUserProfile(user.id);
  const githubNoreplyEmail =
    profile?.externalUserId && profile.username
      ? `${profile.externalUserId}+${profile.username}@users.noreply.github.com`
      : undefined;

  return {
    name: user.name ?? profile?.username ?? user.username,
    email:
      githubNoreplyEmail ??
      user.email ??
      `${user.username}@users.noreply.github.com`,
  };
}

async function getSetupToken(params: {
  userId: string;
  session: SessionRecord;
}): Promise<ScopedInstallationToken | undefined> {
  if (!params.session.cloneUrl) {
    return undefined;
  }
  if (!params.session.repoOwner || !params.session.repoName) {
    throw new Error("Session is missing repository metadata");
  }

  const access = await verifyRepoAccess({
    userId: params.userId,
    owner: params.session.repoOwner,
    repo: params.session.repoName,
  });
  if (!access.ok) {
    throw new Error(getRepoAccessErrorMessage(access.reason));
  }

  return mintInstallationToken({
    installationId: access.installationId,
    repositoryIds: [access.repositoryId],
    permissions: { contents: "read" },
  });
}

async function installSessionGlobalSkills(params: {
  session: SessionRecord;
  sandbox: Sandbox;
  didSetupWorkspace: boolean;
}): Promise<void> {
  if (!params.didSetupWorkspace) {
    return;
  }

  const globalSkillRefs = params.session.globalSkillRefs ?? [];
  if (globalSkillRefs.length === 0) {
    return;
  }

  try {
    await installGlobalSkills({
      sandbox: params.sandbox,
      globalSkillRefs,
    });
  } catch (error) {
    console.error(
      `Failed to install global skills for session ${params.session.id}:`,
      error,
    );
  }
}

async function stopSandboxAfterArchiveRace(params: {
  sessionId: string;
  sandbox: Sandbox;
}): Promise<never> {
  try {
    await params.sandbox.stop();
  } catch (error) {
    console.error(
      `Failed to stop sandbox after session ${params.sessionId} was archived during provisioning:`,
      error,
    );
  }

  throw new SessionArchivedDuringProvisioningError(params.sessionId);
}

export async function provisionSessionSandbox(params: {
  sessionId: string;
  userId?: string;
}): Promise<ProvisionSessionSandboxResult> {
  const session = await getSessionById(params.sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (params.userId && session.userId !== params.userId) {
    throw new Error("Unauthorized");
  }
  if (session.status === "archived") {
    throw new Error("Session is archived");
  }

  const didSetupWorkspace = !isSandboxActive(session.sandboxState);
  const [user, isAdmin, userSessions] = await Promise.all([
    getUserById(session.userId),
    isUserAdmin(session.userId).catch(() => false),
    getSessionsByUserId(session.userId).catch(() => []),
  ]);
  if (!user) {
    throw new Error("User not found");
  }
  const billingState = await getUserBillingState(session.userId, {
    isAdmin,
  }).catch(() => null);
  const plan = getPlanDefinition(billingState?.plan);
  const isFreeUser = !isAdmin && plan.id === "free";

  const provider = resolveSessionProvider(session);
  const reuseDecision = resolveFreeTierSandboxReuse({
    currentSessionId: session.id,
    currentSandboxState: session.sandboxState,
    currentProjectId: session.projectId,
    currentRepoOwner: session.repoOwner,
    currentRepoName: session.repoName,
    requestedProviderType: provider.id,
    userPlan: plan.id,
    isAdmin,
    userSessions,
  });

  const gitUser = await getGitUser(user);
  const setupToken = await getSetupToken({
    userId: session.userId,
    session,
  });

  const sandboxPolicy = getSandboxPlanPolicy(plan.id, isAdmin);
  const sandboxVcpus = resolveSandboxVcpusForPlan({
    planId: plan.id,
    isAdmin,
    providerType: provider.id,
    isHobbyProfile: isHobbyResourceProfile(),
  });

  const connectWithOptions = async (
    stateOverride: SandboxState | null | undefined,
    createIfMissing: boolean,
  ) =>
    connectSandbox({
      state: await buildSandboxState(session, stateOverride),
      options: {
        githubToken: setupToken?.token,
        gitUser,
        timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
        vcpus: sandboxVcpus,
        autoSuspendSeconds: sandboxPolicy.autoSuspendSeconds,
        autoHibernateSeconds: sandboxPolicy.autoHibernateSeconds,
        autoDestroySeconds: sandboxPolicy.autoDestroySeconds,
        ...(provider.id === "boxd" && {
          workingDirectory: `/tmp/entry-workspace/sessions/${session.id}`,
        }),
        ports: DEFAULT_SANDBOX_PORTS,
        baseSnapshotId: DEFAULT_SANDBOX_BASE_SNAPSHOT_ID,
        persistent: false,
        resume: true,
        ...(getSandboxDriveConfig(session.id) && {
          drives: getSandboxDriveConfig(session.id),
        }),
        createIfMissing,
      },
    });

  let sandbox: Sandbox;
  let stateOverrideForFallback: SandboxState | null | undefined =
    reuseDecision.mode === "detach-and-provision-fresh" ? null : undefined;
  try {
    if (reuseDecision.mode === "attach-existing") {
      try {
        sandbox = await connectWithOptions(reuseDecision.targetState, false);
        stateOverrideForFallback = reuseDecision.targetState;
      } catch (attachError) {
        console.warn(
          `[sandbox] Failed to attach reusable sandbox from session ${reuseDecision.sourceSessionId}; clearing stale state and provisioning fresh:`,
          attachError instanceof Error ? attachError.message : attachError,
        );
        await updateSession(reuseDecision.sourceSessionId, {
          sandboxState: clearSandboxState(reuseDecision.targetState),
        }).catch(() => {});
        stateOverrideForFallback = null;
        sandbox = await connectWithOptions(null, true);
      }
    } else if (reuseDecision.mode === "detach-and-provision-fresh") {
      sandbox = await connectWithOptions(null, true);
    } else {
      sandbox = await connectWithOptions(undefined, true);
    }
  } finally {
    if (setupToken) {
      await revokeInstallationToken(setupToken.token);
    }
  }

  const rawSandboxState = sandbox.getState?.();
  const sandboxState = isSandboxState(rawSandboxState)
    ? rawSandboxState
    : await buildSandboxState(session, stateOverrideForFallback);

  const updatedSession = await updateSessionIfNotArchived(params.sessionId, {
    sandboxState,
    snapshotUrl: null,
    snapshotCreatedAt: null,
    lifecycleVersion: getNextLifecycleVersion(session.lifecycleVersion),
    lifecycleError: null,
    ...buildActiveLifecycleUpdate(sandboxState, {
      inactivityTimeoutMs: isFreeUser
        ? FREE_USER_SANDBOX_INACTIVITY_TIMEOUT_MS
        : undefined,
    }),
  });

  if (!updatedSession) {
    await stopSandboxAfterArchiveRace({
      sessionId: params.sessionId,
      sandbox,
    });
  }

  await installSessionGlobalSkills({
    session,
    sandbox,
    didSetupWorkspace,
  });

  kickSandboxLifecycleWorkflow({
    sessionId: params.sessionId,
    reason: "sandbox-created",
  });

  return {
    sandbox,
    sandboxState,
    workingDirectory: sandbox.workingDirectory,
    currentBranch: sandbox.currentBranch,
    environmentDetails: sandbox.environmentDetails,
    didSetupWorkspace,
    session: updatedSession ?? session,
  };
}
