/**
 * Live Model Catalog Loader for Entry Agents
 *
 * CRITICAL REQUIREMENT:
 * Strictly ZERO hardcoded or demo models! Every model displayed in Entry Agents
 * is fetched live from Entry's backend (`https://entry-agents.dev/api/desktop/models`
 * or `https://entry-agents.dev/api/models`).
 */

export interface LiveDesktopModel {
  id: string;
  name: string;
  chef: string;
  chefSlug: string;
  providers: string[];
  contextWindow?: number;
  maxOutputTokens?: number;
  defaultReasoningEffort?: string;
}

export interface LiveModelsCatalogResponse {
  models: LiveDesktopModel[];
  freePlanModelId?: string | null;
  userPlan?: { id: string; modelAccess: string } | null;
  creditGate?: {
    blocked: boolean;
    reason: string | null;
    kind: string | null;
  } | null;
  sourceUrl: string;
}

export async function fetchLiveEntryModels(options: {
  baseUrl: string;
  sessionToken?: string | null;
}): Promise<LiveModelsCatalogResponse> {
  const base = options.baseUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.sessionToken) {
    headers.Authorization = `Bearer ${options.sessionToken}`;
  }

  // 1. If authenticated, try /api/desktop/models first, then /api/models
  const urls = options.sessionToken
    ? [`${base}/api/desktop/models`, `${base}/api/models`]
    : [`${base}/api/models`, `${base}/api/desktop/models`];

  let lastStatus = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
      });
      lastStatus = res.status;
      if (!res.ok) continue;

      const data = (await res.json()) as {
        models?: unknown[];
        data?: unknown[];
        freePlanModelId?: string | null;
        userPlan?: { id: string; modelAccess: string } | null;
        creditGate?: {
          blocked: boolean;
          reason: string | null;
          kind: string | null;
        } | null;
      };

      const rawList = Array.isArray(data.models)
        ? data.models
        : Array.isArray(data.data)
          ? data.data
          : [];

      const models: LiveDesktopModel[] = rawList
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"),
        )
        .map((item) => {
          const id = String(item.id ?? "");
          const providerPrefix = id.includes("/")
            ? (id.split("/")[0] ?? "entry")
            : "entry";
          return {
            id,
            name: String(item.name ?? id),
            chef: String(item.chef ?? providerPrefix),
            chefSlug: String(item.chefSlug ?? providerPrefix.toLowerCase()),
            providers: Array.isArray(item.providers)
              ? item.providers.map(String)
              : [providerPrefix],
            contextWindow:
              typeof item.contextWindow === "number"
                ? item.contextWindow
                : undefined,
            maxOutputTokens:
              typeof item.maxOutputTokens === "number"
                ? item.maxOutputTokens
                : undefined,
            defaultReasoningEffort:
              typeof item.defaultReasoningEffort === "string"
                ? item.defaultReasoningEffort
                : undefined,
          };
        })
        .filter((m) => m.id.length > 0);

      return {
        models,
        freePlanModelId: data.freePlanModelId ?? null,
        userPlan: data.userPlan ?? null,
        creditGate: data.creditGate ?? null,
        sourceUrl: url,
      };
    } catch {
      // try next url
    }
  }

  throw new Error(
    `Unable to fetch live models from ${base} (last HTTP status: ${lastStatus || "unreachable"})`,
  );
}
