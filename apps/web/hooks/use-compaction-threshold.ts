"use client";

import useSWR from "swr";

interface PreferencesResponse {
  compactionThreshold?: number;
  preferences?: {
    compactionThreshold?: number;
  };
}

const fetcher = async (url: string): Promise<PreferencesResponse | null> => {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as PreferencesResponse;
};

/**
 * Returns the user's configured compaction threshold as a ratio in (0, 1]
 * (e.g. 80 -> 0.80), or undefined while loading / unavailable.
 */
export function useCompactionThreshold(): number | undefined {
  const { data } = useSWR<PreferencesResponse | null>(
    "/api/settings/preferences",
    fetcher,
    {
      revalidateOnFocus: true,
      dedupingInterval: 10_000,
    },
  );

  const pct =
    data?.preferences?.compactionThreshold ?? data?.compactionThreshold;
  if (
    typeof pct === "number" &&
    Number.isFinite(pct) &&
    pct >= 5 &&
    pct <= 98
  ) {
    return pct / 100;
  }
  return undefined;
}
