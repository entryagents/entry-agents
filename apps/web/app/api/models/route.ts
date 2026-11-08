import { filterModelsForSession } from "@/lib/model-access";
import { fetchAvailableLanguageModelsWithContext } from "@/lib/models-with-context";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  getFreeTierGateStatus,
  getFreeTierModelId,
  parseAdminFreeTierModels,
} from "@/lib/db/platform-settings";
import { isUserAdmin } from "@/lib/db/users";
import { getUserBillingState } from "@/lib/billing/credit-ledger";
import { getPlanDefinition } from "@/lib/billing/plans";

const CACHE_CONTROL = "private, no-store";

export interface CreditGateStatus {
  blocked: boolean;
  reason: string | null;
  /** "free" once the one-time trial credit is spent; "paid" once a
   * paid plan's balance hits zero mid-cycle. Lets the client show a
   * different CTA (upgrade vs. top up) without re-deriving it. */
  kind: "free" | "paid" | null;
}

export async function GET(req: Request) {
  try {
    const [session, models] = await Promise.all([
      getServerSession(),
      fetchAvailableLanguageModelsWithContext(),
    ]);

    const isAdminUser = session?.user?.id
      ? await isUserAdmin(session.user.id).catch(() => false)
      : false;
    const [freeTierGate, configuredFreeModelId] = await Promise.all([
      isAdminUser ? Promise.resolve(null) : getFreeTierGateStatus(),
      getFreeTierModelId(),
    ]);
    const freeModelConfig = parseAdminFreeTierModels(configuredFreeModelId);

    let creditGate: CreditGateStatus | null = null;
    let userPlan: { id: string; modelAccess: "luna-only" | "all" } | null =
      null;
    if (session?.user?.id && !isAdminUser) {
      const billingState = await getUserBillingState(session.user.id).catch(
        () => null,
      );
      const plan = getPlanDefinition(billingState?.plan);
      const balanceCents = billingState?.creditBalanceCents ?? 0;
      const effectiveModelAccess = freeModelConfig.allowAll
        ? "all"
        : plan.modelAccess;
      userPlan = { id: plan.id, modelAccess: effectiveModelAccess };
      if (balanceCents <= 0) {
        creditGate = {
          blocked: true,
          reason:
            plan.modelAccess === "luna-only"
              ? "Free tier ended — upgrade your account to use Entry"
              : "You're out of credit — top up to keep chatting",
          kind: plan.modelAccess === "luna-only" ? "free" : "paid",
        };
      }
    }

    const isPaidUser = Boolean(userPlan?.id && userPlan.id !== "free");
    const effectiveFreeTierGate =
      !isAdminUser && !isPaidUser && freeTierGate && !freeTierGate.enabled
        ? { enabled: false, reason: freeTierGate.reason }
        : null;

    return Response.json(
      {
        models: filterModelsForSession(models, session, req.url),
        freeTierGate: effectiveFreeTierGate,
        creditGate,
        userPlan,
        freePlanModelId: freeModelConfig.primaryModelId,
        freeTierAllowedModelIds: freeModelConfig.allowedModelIds,
      },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch available models:", error);
    return Response.json(
      { error: "Failed to fetch available models" },
      { status: 500 },
    );
  }
}
