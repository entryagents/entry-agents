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

export function useSessionSkills(
  sessionId: string,
  sandboxConnected: boolean,
): UseSessionSkillsReturn {
  const endpoint = sandboxConnected
    ? `/api/sessions/${sessionId}/skills`
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
    const skillList = data?.skills ?? [];
    const pluginCmds = pluginCmdData?.commands ?? [];
    if (skillList.length === 0 && pluginCmds.length === 0) {
      return data ? [] : null;
    }

    const seen = new Set<string>();
    const combined: SkillSuggestion[] = [];

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

    for (const skill of skillList) {
      const key = skill.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({
        ...skill,
        source: "skill",
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
