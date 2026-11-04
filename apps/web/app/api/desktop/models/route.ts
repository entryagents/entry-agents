import { type NextRequest, NextResponse } from "next/server";
import { getUserBillingState } from "@/lib/billing/credit-ledger";
import { FREE_PLAN_MODEL_ID, getPlanDefinition } from "@/lib/billing/plans";
import {
  getFreeTierGateStatus,
  getFreeTierModelId,
} from "@/lib/db/platform-settings";
import { isUserAdmin } from "@/lib/db/users";
import { requireDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { fetchAvailableLanguageModelsWithContext } from "@/lib/models-with-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/desktop/models — returns live available models from Entry's gateway
 * (`fetchAvailableLanguageModelsWithContext()`), plus user plan/credit status.
 * Strictly zero hardcoded or demo models.
 */
export async function GET(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }

  try {
    const models = await fetchAvailableLanguageModelsWithContext();
    const isAdminUser = await isUserAdmin(user.id).catch(() => false);
    const freeTierGate = isAdminUser ? null : await getFreeTierGateStatus();
    const billingState = await getUserBillingState(user.id).catch(() => null);
    const configuredFreeModelId = await getFreeTierModelId();
    const plan = getPlanDefinition(billingState?.plan);
    const balanceCents = billingState?.creditBalanceCents ?? 0;
    const effectiveModelAccess =
      configuredFreeModelId === "__all__" ? "all" : plan.modelAccess;

    const userPlan = {
      id: plan.id,
      modelAccess: effectiveModelAccess,
    };

    const creditGate =
      !isAdminUser && balanceCents <= 0
        ? {
            blocked: true,
            reason:
              plan.modelAccess === "luna-only"
                ? "Free tier ended — upgrade your account to use Entry"
                : "You're out of credit — top up to keep chatting",
            kind: plan.modelAccess === "luna-only" ? "free" : "paid",
          }
        : null;

    return NextResponse.json(
      {
        models,
        freeTierGate:
          freeTierGate && !freeTierGate.enabled
            ? { enabled: false, reason: freeTierGate.reason }
            : null,
        creditGate,
        userPlan,
        freePlanModelId:
          configuredFreeModelId && configuredFreeModelId !== "__all__"
            ? configuredFreeModelId
            : FREE_PLAN_MODEL_ID,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to fetch desktop models:", error);
    return NextResponse.json({ error: "Catalog unavailable" }, { status: 502 });
  }
}
