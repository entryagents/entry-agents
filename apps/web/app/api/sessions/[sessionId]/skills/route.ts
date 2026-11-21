import {
  discoverSkills,
  getBuiltinSkillsMetadata,
  type SkillMetadata,
} from "@entry-agents/agent";
import { connectSandbox } from "@entry-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSession,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { getSandboxSkillDirectories } from "@/lib/skills/directories";
import { getCachedSkills, setCachedSkills } from "@/lib/skills-cache";
import { buildHibernatedLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import {
  clearUnavailableSandboxState,
  hasRuntimeSandboxState,
  isSandboxUnavailableError,
} from "@/lib/sandbox/utils";

export type SkillSuggestion = {
  name: string;
  description: string;
  source?: "skill" | "plugin" | "team" | "command";
  pluginName?: string;
};

export type SkillsResponse = {
  skills: SkillSuggestion[];
};

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

function mergeWithBuiltinSkills(discovered: SkillMetadata[]): SkillMetadata[] {
  const seen = new Set(discovered.map((s) => s.name.toLowerCase()));
  const merged = [...discovered];
  for (const builtin of getBuiltinSkillsMetadata()) {
    if (!seen.has(builtin.name.toLowerCase())) {
      seen.add(builtin.name.toLowerCase());
      merged.push(builtin);
    }
  }
  return merged;
}

function toSkillSuggestions(skills: SkillMetadata[]): SkillSuggestion[] {
  return mergeWithBuiltinSkills(skills)
    .filter((skill) => skill.options.userInvocable !== false)
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
}

export async function GET(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;

  const sessionContext = await requireOwnedSession({
    userId: authResult.userId,
    sessionId,
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState) {
    return Response.json({
      skills: toSkillSuggestions(getBuiltinSkillsMetadata()),
    });
  }

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";

  if (!refresh) {
    const cachedSkills = await getCachedSkills(sessionId, sandboxState);
    if (cachedSkills !== null) {
      return Response.json({ skills: toSkillSuggestions(cachedSkills) });
    }
  }

  if (!hasRuntimeSandboxState(sandboxState)) {
    return Response.json({
      skills: toSkillSuggestions(getBuiltinSkillsMetadata()),
    });
  }

  try {
    const sandbox = await connectSandbox(sandboxState);
    const skillDirs = await getSandboxSkillDirectories(sandbox);

    const skills = await discoverSkills(sandbox, skillDirs);
    await setCachedSkills(sessionId, sandboxState, skills);

    const response: SkillsResponse = { skills: toSkillSuggestions(skills) };
    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSandboxUnavailableError(message)) {
      await updateSession(sessionId, {
        sandboxState: clearUnavailableSandboxState(
          sessionRecord.sandboxState,
          message,
        ),
        ...buildHibernatedLifecycleUpdate(),
      });
    } else {
      console.error("Failed to discover skills:", error);
    }
    return Response.json({
      skills: toSkillSuggestions(getBuiltinSkillsMetadata()),
    });
  }
}
