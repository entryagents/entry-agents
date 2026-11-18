import "server-only";

import { getUserBillingState } from "@/lib/billing/credit-ledger";
import { isUserAdmin } from "@/lib/db/users";
import {
  evaluateExternalIntegrationAccess,
  type ExternalIntegrationAccessResult,
} from "./integration-access";

export async function getUserExternalIntegrationAccess(
  userId: string,
): Promise<ExternalIntegrationAccessResult> {
  const isAdmin = await isUserAdmin(userId).catch(() => false);
  const billingState = await getUserBillingState(userId, { isAdmin }).catch(
    () => null,
  );
  return evaluateExternalIntegrationAccess({
    plan: billingState?.plan ?? "free",
    isAdmin,
  });
}
