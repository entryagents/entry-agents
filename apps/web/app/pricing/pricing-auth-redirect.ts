export type PricingWindowMode = "rolling" | "fixed";

export interface PricingSubscribeIntent {
  planId: "plus" | "entry" | null;
  windowMode: PricingWindowMode | null;
}

/**
 * Builds the `/login?next=...` redirect URL when a signed-out visitor clicks
 * Subscribe on `/pricing`, preserving their selected plan so post-auth
 * navigation lands back on `/pricing` ready to complete subscription.
 */
export function buildPricingLoginRedirectUrl(
  planId: string,
  windowMode?: PricingWindowMode,
): string {
  const params = new URLSearchParams();
  if (planId === "plus" || planId === "entry") {
    params.set("subscribe", planId);
  }
  if (windowMode === "rolling" || windowMode === "fixed") {
    params.set("windowMode", windowMode);
  }
  const query = params.toString();
  const nextPath = query ? `/pricing?${query}` : "/pricing";
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

/**
 * Parses `?subscribe=...&windowMode=...` from `window.location.search` when
 * returning to `/pricing` after authenticating.
 */
export function parsePricingSubscribeIntent(
  search: string,
): PricingSubscribeIntent {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const rawPlan = params.get("subscribe");
  const planId = rawPlan === "plus" || rawPlan === "entry" ? rawPlan : null;
  const rawMode = params.get("windowMode");
  const windowMode =
    rawMode === "rolling" || rawMode === "fixed" ? rawMode : null;

  return {
    planId,
    windowMode,
  };
}
