"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type {
  SkillSuggestion,
  SkillsResponse,
} from "@/app/api/sessions/[sessionId]/skills/route";
import type { PluginSlashCommandEntry } from "@/lib/db/plugins";
import { fetcher } from "@/lib/swr";

export interface UseSessionSkillsReturn {
  skills: SkillsResponse["skills"] | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<SkillsResponse | undefined>;
}

const TEAM_SPECIALIST_COMMANDS: SkillSuggestion[] = [
  {
    name: "architect",
    description:
      "Dispatch the Architect subagent to decompose system design, contracts, and file boundaries",
    source: "team",
  },
  {
    name: "explorer",
    description:
      "Dispatch the Explorer subagent for fast read-only codebase search and dependency tracing",
    source: "team",
  },
  {
    name: "executor",
    description:
      "Dispatch the Executor subagent to implement scoped code changes and run verification",
    source: "team",
  },
  {
    name: "reviewer",
    description:
      "Dispatch the Reviewer subagent for pre-merge correctness, security, and regression audit",
    source: "team",
  },
  {
    name: "design",
    description:
      "Dispatch the UI Craft subagent for layout, typography, responsive polish, and visual QA",
    source: "team",
  },
  {
    name: "team-plan",
    description:
      "Coordinate the multi-agent specialist team via the shared team board for complex features",
    source: "team",
  },
];

const FEATURED_SKILL_ORDER = [
  "unslop",
  "frontend-design",
  "code-review",
  "plan-mode",
  "baseline-ui",
  "web-animation-design",
  "composio",
  "workflow",
];

export function useSessionSkills(
  sessionId: string,
  sandboxConnected: boolean,
): UseSessionSkillsReturn {
  const endpoint = sessionId
    ? `/api/sessions/${sessionId}/skills?connected=${sandboxConnected ? "1" : "0"}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<SkillsResponse>(
    endpoint,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );

  const { data: pluginCmdData } = useSWR<{
    commands: PluginSlashCommandEntry[];
  }>("/api/plugins/commands", fetcher, {
    revalidateOnFocus: false,
  });

  const mergedSkills = useMemo<SkillSuggestion[] | null>(() => {
    const skillList = [...(data?.skills ?? [])].sort((a, b) => {
      const aFeatured = FEATURED_SKILL_ORDER.indexOf(a.name.toLowerCase());
      const bFeatured = FEATURED_SKILL_ORDER.indexOf(b.name.toLowerCase());
      if (aFeatured !== -1 || bFeatured !== -1) {
        if (aFeatured === -1) return 1;
        if (bFeatured === -1) return -1;
        return aFeatured - bFeatured;
      }
      return a.name.localeCompare(b.name);
    });
    const pluginCmds = pluginCmdData?.commands ?? [];

    const seen = new Set<string>();
    const combined: SkillSuggestion[] = [];

    for (const skill of skillList) {
      const key = skill.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({
        ...skill,
        source: "skill",
      });
    }

    for (const teamCmd of TEAM_SPECIALIST_COMMANDS) {
      const key = teamCmd.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(teamCmd);
    }

    for (const cmd of pluginCmds) {
      const key = cmd.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({
        name: cmd.name,
        description: cmd.description,
        source: "plugin",
        pluginName: cmd.pluginName,
      });
    }

    return combined;
  }, [data, pluginCmdData]);

  return {
    skills: mergedSkills,
    isLoading,
    error: error?.message ?? null,
    refresh: async () => {
      if (!endpoint) {
        return undefined;
      }

      const freshSkills = await fetcher<SkillsResponse>(
        `${endpoint}?refresh=1`,
      );
      await mutate(freshSkills, { revalidate: false });
      return freshSkills;
    },
  };
}
