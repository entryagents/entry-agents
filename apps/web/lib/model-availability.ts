import { getDisabledModelIdSet } from "@/lib/db/model-overrides";

interface GatewayHealthResponse {
  ok?: boolean;
  status?: string;
  routedModels?: string[];
  circuitBreakers?: Record<string, string>;
}

let gatewayHealthCache: {
  promise: Promise<GatewayHealthResponse | null>;
  expiresAt: number;
} | null = null;

const GATEWAY_HEALTH_CACHE_TTL_MS = 30_000;

export async function fetchGatewayHealth(): Promise<GatewayHealthResponse | null> {
  const now = Date.now();
  if (gatewayHealthCache && gatewayHealthCache.expiresAt > now) {
    return gatewayHealthCache.promise;
  }

  const promise = (async () => {
    const rawBaseUrl = process.env.GATEWAY_BASE_URL || "";
    if (!rawBaseUrl) return null;
    const baseUrl = rawBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
    try {
      const res = await fetch(`${baseUrl}/health`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      return (await res.json()) as GatewayHealthResponse;
    } catch {
      return null;
    }
  })();

  gatewayHealthCache = {
    promise,
    expiresAt: now + GATEWAY_HEALTH_CACHE_TTL_MS,
  };

  promise.catch(() => {
    if (gatewayHealthCache?.promise === promise) {
      gatewayHealthCache = null;
    }
  });

  return promise;
}

export async function isModelGatewayRoutable(modelId: string): Promise<boolean> {
  const health = await fetchGatewayHealth();
  if (!health) {
    return true;
  }

  const breakers = health.circuitBreakers || {};
  if (
    breakers[`model:${modelId}`] === "open" ||
    breakers[modelId] === "open" ||
    breakers[`freemodel:${modelId}`] === "open"
  ) {
    return false;
  }

  if (Array.isArray(health.routedModels) && health.routedModels.length > 0) {
    return health.routedModels.includes(modelId);
  }

  return true;
}


const DISABLED_OPENAI_GPT_PREFIX = "openai/gpt-";
const DISABLED_OPENAI_PRO_SUFFIX = "-pro";

// Owner standing instruction: hide any "Mythos" model entirely from the
// picker, regardless of which upstream provider routes it. This is a
// hard, code-level block -- NOT exposed as a toggle on the admin models
// page, since the owner wants it always hidden regardless of who's
// looking at the admin page.
const DISABLED_NAME_SUBSTRINGS = ["mythos"];

// kimi-k3 and grok-4.5 are routed via Opencode Zen but that workspace has
// no payment method on file, so real requests to either one fail with a
// CreditsError. Hidden from the picker until billing is fixed upstream --
// remove from this list (or just delete the list) once that's resolved.
// (Both are correctly priced in entry-gateway's MODEL_ROUTES_JSON already,
// using Zen's own published rate card, so no further pricing work is
// needed once billing is fixed -- just delete them from this list.)
const DISABLED_MODEL_IDS = ["kimi-k3", "grok-4.5"];

/**
 * True if a model is hard-blocked in code (billing issue, banned brand
 * name, etc.) -- these are NOT admin-togglable, they need a code change
 * to lift. See isModelAdminDisabled for the DB-backed, instantly
 * togglable kill switch (the admin models page).
 */
export function isModelHardBlocked(modelId: string): boolean {
  const lowerId = modelId.toLowerCase();

  if (
    modelId.startsWith(DISABLED_OPENAI_GPT_PREFIX) &&
    modelId.endsWith(DISABLED_OPENAI_PRO_SUFFIX)
  ) {
    return true;
  }

  if (DISABLED_MODEL_IDS.includes(modelId)) {
    return true;
  }

  return DISABLED_NAME_SUBSTRINGS.some((substring) =>
    lowerId.includes(substring),
  );
}

/**
 * True if a model is disabled for any reason -- either hard-blocked in
 * code, or turned off by an admin via the DB-backed override table (the
 * /settings/admin/models page). This is the check every real call site
 * should use.
 *
 * NOTE: this is the ONLY thing call sites should do with the result --
 * surface a clear error to the user. Do NOT silently substitute a
 * different model when this returns true (see model-selection.ts's
 * docstring for why: a previous version of resolveChatModelSelection did
 * exactly that -- silently swapped a disabled model for
 * APP_DEFAULT_MODEL_ID with just a console.warn -- and it went unnoticed
 * for days while the fallback target itself was also disabled, so users
 * just saw generic failed-response errors with no explanation. Removed
 * 2026-08-17 per owner instruction to eliminate every silent model
 * fallback, not just the credit-based soft-cutoff.)
 */
export async function isModelDisabled(modelId: string): Promise<boolean> {
  if (isModelHardBlocked(modelId)) {
    return true;
  }

  const disabledIds = await getDisabledModelIdSet();
  if (disabledIds.has(modelId)) {
    return true;
  }

  const routable = await isModelGatewayRoutable(modelId);
  return !routable;
}

export async function filterDisabledModels<T extends { id: string }>(
  models: T[],
): Promise<T[]> {
  const [disabledIds, health] = await Promise.all([
    getDisabledModelIdSet(),
    fetchGatewayHealth(),
  ]);

  const routedModelsSet =
    health && Array.isArray(health.routedModels) && health.routedModels.length > 0
      ? new Set(health.routedModels)
      : null;
  const breakers = health?.circuitBreakers || {};

  return models.filter((model) => {
    if (isModelHardBlocked(model.id)) return false;
    if (disabledIds.has(model.id)) return false;

    if (
      breakers[`model:${model.id}`] === "open" ||
      breakers[model.id] === "open" ||
      breakers[`freemodel:${model.id}`] === "open"
    ) {
      return false;
    }

    if (routedModelsSet && !routedModelsSet.has(model.id)) {
      return false;
    }

    return true;
  });
}
