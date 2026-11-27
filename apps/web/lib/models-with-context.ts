import "server-only";

import { fetch as workflowFetch } from "workflow";
import { z } from "zod";
import { filterDisabledModels } from "./model-availability";
import {
  selectLatestGatewayModelId,
  type AvailableModel,
  type GatewayAvailableModel,
} from "./models";

/** Legacy test hook kept as a no-op now that all model metadata comes directly from the live gateway. */
type GatewayModel = GatewayAvailableModel;

export function __resetModelsDevCacheForTests(): void {
  // No-op: models.dev lookup removed; live gateway is the sole source of truth.
}

/**
 * Mirrors the CACHE_RATE_MULTIPLIERS_BY_PREFIX fallback in the gateway's
 * server.js (added 2026-08-17, see that file for the full rationale and
 * pricing-ratio sourcing) -- purely so the UI's cost pill/estimate
 * matches what the gateway will actually bill. gpt-5.6-sol/terra/luna's
 * routes don't have cost.cache_read/cache_write set in the gateway's own
 * config, so without this the picker/composer would display an inflated
 * estimate (full input rate on cached tokens) even though the gateway
 * itself already applies the discount when computing the real charge.
 * Only fills in the two fields when they're genuinely absent -- any
 * route with real configured rates (e.g. Claude's) passes through
 * unchanged.
 *
 * Ratios sourced from OpenAI's own published gpt-5.6-sol pricing ($5.00
 * input / $0.50 cached input / $6.25 cache write / $30.00 output --
 * 0.50/5.00 = 0.1x, 6.25/5.00 = 1.25x), independently corroborated on
 * the OpenAI community forum for gpt-5.6-luna post price-cut ("1.25x for
 * write cache and 0.1x for read cache"). See gateway server.js for the
 * matching fallback used for real billing.
 */
const CACHE_RATE_MULTIPLIERS_BY_PREFIX: Array<
  [string, { cacheRead: number; cacheWrite: number }]
> = [["gpt-5.6-", { cacheRead: 0.1, cacheWrite: 1.25 }]];

function applyFallbackCachePricing(model: AvailableModel): AvailableModel {
  const cost = model.cost;
  if (!cost || typeof cost.input !== "number") {
    return model;
  }
  if (
    typeof cost.cache_read === "number" &&
    typeof cost.cache_write === "number"
  ) {
    return model;
  }

  const multipliers = CACHE_RATE_MULTIPLIERS_BY_PREFIX.find(([prefix]) =>
    model.id.startsWith(prefix),
  )?.[1];
  if (!multipliers) {
    return model;
  }

  return {
    ...model,
    cost: {
      ...cost,
      cache_read: cost.cache_read ?? cost.input * multipliers.cacheRead,
      cache_write: cost.cache_write ?? cost.input * multipliers.cacheWrite,
    },
  };
}

const gatewayReasoningEffortItemSchema = z.union([
  z.string(),
  z.object({
    value: z.string(),
    label: z.string().optional(),
  }),
]);

function formatGatewayEffortLabel(value: string): string {
  return value.trim();
}

function normalizeGatewayReasoningLevels(
  raw: unknown,
): Array<{ value: string; label: string }> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const levels: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      const value = item.trim();
      if (!seen.has(value)) {
        seen.add(value);
        levels.push({ value, label: formatGatewayEffortLabel(value) });
      }
    } else if (
      item &&
      typeof item === "object" &&
      "value" in item &&
      typeof (item as { value?: unknown }).value === "string"
    ) {
      const value = (item as { value: string }).value.trim();
      const rawLabel = (item as { label?: unknown }).label;
      const label =
        typeof rawLabel === "string" && rawLabel.trim()
          ? rawLabel.trim()
          : formatGatewayEffortLabel(value);
      if (value && !seen.has(value)) {
        seen.add(value);
        levels.push({ value, label });
      }
    }
  }
  return levels;
}

const gatewayModelsResponseSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().nullish(),
        modelType: z.string().nullish(),
        capabilities: z.array(z.string()).optional(),
        created: z.number().finite().optional(),
        released_at: z.string().optional(),
        releasedAt: z.string().optional(),
        is_latest: z.boolean().optional(),
        isLatest: z.boolean().optional(),
        is_default: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        reasoning_efforts: z.array(gatewayReasoningEffortItemSchema).optional(),
        reasoning_levels: z.array(gatewayReasoningEffortItemSchema).optional(),
        supported_reasoning_efforts: z
          .array(gatewayReasoningEffortItemSchema)
          .optional(),
        reasoningEffortLevels: z
          .array(gatewayReasoningEffortItemSchema)
          .optional(),
        default_reasoning_effort: z.string().nullish(),
        defaultReasoningEffort: z.string().nullish(),
        reasoning: z
          .union([
            z.boolean(),
            z
              .object({
                supported: z.boolean().optional(),
                efforts: z.array(gatewayReasoningEffortItemSchema).optional(),
                levels: z.array(gatewayReasoningEffortItemSchema).optional(),
                default_effort: z.string().nullish(),
                defaultEffort: z.string().nullish(),
              })
              .passthrough(),
          ])
          .optional(),
        context_window: z.number().finite().positive().optional(),
        contextWindow: z.number().finite().positive().optional(),
        max_output_tokens: z.number().finite().positive().optional(),
        maxOutputTokens: z.number().finite().positive().optional(),
        compaction_threshold: z.number().finite().positive().optional(),
        compactionThreshold: z.number().finite().positive().optional(),
        limit: z
          .object({
            context: z.number().finite().positive().optional(),
            output: z.number().finite().positive().optional(),
          })
          .passthrough()
          .optional(),
        cost: z
          .object({
            input: z.number().finite().optional(),
            output: z.number().finite().optional(),
            cache_read: z.number().finite().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  ),
});

/**
 * Fetches the live model list from Entry's managed model gateway
 * (entry-gateway, deployed on Vercel). This is intentionally a live network call, not a
 * hardcoded catalog -- adding/removing a model is a config change on the
 * gateway (GATEWAY env vars in its own dashboard), and this app picks it
 * up automatically on the next fetch, no redeploy needed.
 */
// PERF 2026-09-15: the gateway model list used to be fetched live on
// EVERY chat turn (per-turn cost catalog, chat.ts fetchModelCostCatalogStep)
// and on every /api/models picker load. That put a gateway HTTP
// round-trip on the critical path of every turn, before the model even
// started. The list only changes when someone edits GATEWAY env vars on
// the gateway's own dashboard, so a 60s in-process TTL cache makes the
// first call per serverless instance pay the round-trip and everyone
// else in the window reuse it. Note this caches the RAW list only --
// filterDisabledModels (the admin kill-switch) runs after the cache on
// every call, so disabling a model stays immediate for pickers, and
// cost-catalog consumers deliberately skip the filter anyway (see
// fetchModelCostCatalog's 2026-08-17 comment).
const GATEWAY_MODELS_CACHE_TTL_MS = 60_000;
let gatewayModelsCache: {
  promise: Promise<GatewayModel[]>;
  expiresAt: number;
} | null = null;

/**
 * Test-only hook: drops the gateway-models TTL cache. Tests re-mock
 * globalThis.fetch per case (see app/api/models/route.test.ts) and
 * need each call to see the fresh mock, not a cached earlier response.
 * Production code must never call this.
 */
export function __resetGatewayModelsCacheForTests(): void {
  gatewayModelsCache = null;
}

async function fetchGatewayModels(): Promise<GatewayModel[]> {
  const now = Date.now();
  if (gatewayModelsCache && gatewayModelsCache.expiresAt > now) {
    return gatewayModelsCache.promise;
  }
  const promise = fetchGatewayModelsUncached();
  gatewayModelsCache = {
    promise,
    expiresAt: now + GATEWAY_MODELS_CACHE_TTL_MS,
  };
  // A failed fetch must not be cached for the full TTL -- drop the
  // entry so the next call retries immediately (callers all have
  // .catch fallbacks, so this only controls retry timing).
  promise.catch(() => {
    if (gatewayModelsCache?.promise === promise) {
      gatewayModelsCache = null;
    }
  });
  return promise;
}

async function fetchGatewayModelsUncached(): Promise<GatewayModel[]> {
  const baseURL = process.env.GATEWAY_BASE_URL;
  const apiKey = process.env.GATEWAY_API_KEY;

  if (!baseURL || !apiKey) {
    throw new Error(
      "GATEWAY_BASE_URL / GATEWAY_API_KEY must be set to fetch the model list from Entry's managed model gateway.",
    );
  }

  // NOTE: deliberately no `next: { revalidate }` cache option here. That
  // Next.js-specific fetch directive only works inside a request-scoped
  // Next.js execution context (route handlers). The Vercel Workflow SDK's
  // "use workflow"/"use step" durable-execution context is NOT a normal
  // per-request Next.js context, so passing it there causes this fetch to
  // throw -- which upstream callers (chat.ts) caught with a bare
  // `.catch(() => [])`, silently emptying the pricing catalog on every
  // real chat turn while the same function worked fine when called from
  // /api/models (a plain route handler). That was the root cause of the
  // per-turn cost pill never showing anything in production. Model list
  // changes rarely enough that fetching it fresh each call is fine.
  // Use the Workflow SDK's hoisted `fetch` step, not global `fetch` --
  // this function is called from inside `runAgentWorkflow` ("use workflow"),
  // where global fetch throws ("Global fetch is unavailable in workflow
  // functions"). The workflow-step fetch is a safe drop-in outside of a
  // workflow context too (it's a no-op wrapper around globalThis.fetch when
  // there's no active workflow run), so this one import works for both the
  // plain /api/models route handler and the workflow call site.
  const fetchImpl =
    typeof globalThis.fetch === "function" ? globalThis.fetch : workflowFetch;
  const response = await fetchImpl(`${baseURL.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models from gateway (${response.status}): ${await response.text()}`,
    );
  }

  const parsed = gatewayModelsResponseSchema.parse(await response.json());
  return parsed.data.map((model) => {
    const context_window =
      model.context_window ?? model.contextWindow ?? model.limit?.context;
    const max_output_tokens =
      model.max_output_tokens ?? model.maxOutputTokens ?? model.limit?.output;
    const compaction_threshold =
      model.compaction_threshold ?? model.compactionThreshold;

    const reasoningObject =
      model.reasoning && typeof model.reasoning === "object"
        ? model.reasoning
        : undefined;
    const rawReasoningLevels =
      model.reasoning_efforts ??
      model.reasoning_levels ??
      model.supported_reasoning_efforts ??
      model.reasoningEffortLevels ??
      reasoningObject?.efforts ??
      reasoningObject?.levels;
    const reasoningEffortLevels =
      normalizeGatewayReasoningLevels(rawReasoningLevels);
    const rawDefaultEffort =
      reasoningObject?.default_effort ??
      reasoningObject?.defaultEffort ??
      model.default_reasoning_effort ??
      model.defaultReasoningEffort;
    const defaultReasoningEffort =
      typeof rawDefaultEffort === "string" && rawDefaultEffort.trim()
        ? rawDefaultEffort.trim()
        : undefined;
    const supportsReasoningEffort =
      typeof model.reasoning === "boolean"
        ? model.reasoning
        : typeof reasoningObject?.supported === "boolean"
          ? reasoningObject.supported
          : reasoningEffortLevels !== undefined
            ? reasoningEffortLevels.length > 0
            : undefined;

    const releasedAt = model.releasedAt ?? model.released_at;
    const isLatest = model.isLatest ?? model.is_latest;
    const isDefault = model.isDefault ?? model.is_default;

    const {
      reasoningEffortLevels: _rawEffortLevels,
      defaultReasoningEffort: _rawDefaultReasoningEffort,
      released_at: _rawReleasedAt,
      is_latest: _rawIsLatest,
      is_default: _rawIsDefault,
      ...modelRest
    } = model;

    return {
      ...modelRest,
      ...(typeof context_window === "number" && context_window > 0
        ? { context_window }
        : {}),
      ...(typeof max_output_tokens === "number" && max_output_tokens > 0
        ? { max_output_tokens }
        : {}),
      ...(typeof compaction_threshold === "number" && compaction_threshold > 0
        ? { compaction_threshold }
        : {}),
      ...(reasoningEffortLevels ? { reasoningEffortLevels } : {}),
      ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
      ...(supportsReasoningEffort !== undefined
        ? { supportsReasoningEffort }
        : {}),
      ...(releasedAt ? { releasedAt } : {}),
      ...(isLatest !== undefined ? { isLatest } : {}),
      ...(isDefault !== undefined ? { isDefault } : {}),
      modelType: model.modelType ?? "language",
      name: model.name ?? model.id,
      // Workspace access is provided by Entry's agent runtime for every
      // language model. Preserve gateway-advertised capabilities and make
      // this capability explicit for plugins and model-aware clients.
      capabilities: Array.from(
        new Set([...(model.capabilities ?? []), "workspace"]),
      ),
    };
  });
}

export async function fetchAvailableLanguageModels(): Promise<
  AvailableModel[]
> {
  const models = await fetchGatewayModels();
  return filterDisabledModels(
    models.filter((model) => model.modelType === "language"),
  );
}

/**
 * Resolves the latest live language model directly from entry-gateway with no
 * hardcoded fallback ID.
 */
export async function resolveLatestGatewayModelId(): Promise<string | null> {
  const liveModels = await fetchAvailableLanguageModels().catch(() => []);
  return selectLatestGatewayModelId(liveModels);
}

/**
 * Pricing-only catalog: every language model the gateway knows about,
 * INCLUDING ones an admin has disabled (or that are hard-blocked in
 * code). Deliberately skips filterDisabledModels.
 *
 * FIXED 2026-08-17: usage/spend reporting (admin platform overview, admin
 * user profile, and the user-facing /settings/profile usage page) was
 * pricing already-recorded usage_events rows against
 * fetchAvailableLanguageModels()'s filtered catalog. That catalog drops
 * any model an admin has since disabled -- so costForModel() returned
 * undefined for that model's historical rows, and those dollars silently
 * vanished from the displayed total (hasUnpricedUsage flips true instead
 * of the real cost being summed). Reported case: a user's real all-time
 * spend was ~$600 across qwen3.8-max, an Opus model, and others; once an
 * admin disabled a couple of those models the same profile page dropped
 * to ~$200, because usage against the now-disabled models stopped being
 * priced -- even though it had already happened and was already billed
 * (the credit ledger's debitUsage was never touched, only this read-time
 * display estimate). Disabling a model should only stop *new* usage; it
 * must never retroactively re-price or hide usage that already
 * happened. Every cost-lookup call site should use this function, not
 * fetchAvailableLanguageModels(), which stays reserved for
 * picker/availability checks (what a user is allowed to select *now*).
 */
export async function fetchModelCostCatalog(): Promise<AvailableModel[]> {
  const models = await fetchGatewayModels();
  return models.filter((model) => model.modelType === "language");
}

export async function fetchAvailableLanguageModelsWithContext(): Promise<
  AvailableModel[]
> {
  return fetchAvailableLanguageModelsWithCachedContext();
}

/**
 * Navigation-path variant for SSR chat pages & /api/models: serves live
 * gateway models immediately without blocking on a cold/slow models.dev HTTP
 * fetch (up to 750ms). Uses the resolved in-memory models.dev map synchronously
 * only as a fallback when a gateway model omits context_window or cost.
 */
export async function fetchAvailableLanguageModelsWithCachedContext(): Promise<
  AvailableModel[]
> {
  const models = await fetchAvailableLanguageModels();
  return models.map((model) => applyFallbackCachePricing(model));
}

/**
 * Every language model the gateway knows about (unfiltered by disabled status)
 * for the ADMIN models page and public /model pricing page. Uses live gateway
 * context_window and cost directly — no external models.dev lookup.
 */
export async function fetchAllLanguageModelsWithContext(): Promise<
  AvailableModel[]
> {
  const models = (await fetchGatewayModels()).filter(
    (model) => model.modelType === "language",
  );
  return models.map((model) => applyFallbackCachePricing(model));
}

/** Backwards-compatible alias -- the admin models page's original name
 *  for fetchAllLanguageModelsWithContext(). */
export const fetchAllLanguageModelsForAdmin = fetchAllLanguageModelsWithContext;
