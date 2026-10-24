import { getServerSession } from "@/lib/session/get-server-session";
import { createCustomerPortalSession } from "@/lib/billing/bachs";
import { getUserBillingState } from "@/lib/billing/credit-ledger";

export async function POST(_req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const billingState = await getUserBillingState(session.user.id);
  const customerId = billingState?.billingCustomerCode;

  if (!customerId) {
    return Response.json({ url: "/pricing" });
  }

  try {
    const portal = await createCustomerPortalSession(customerId);
    return Response.json({ url: portal.url });
  } catch (error) {
    console.error("[billing/portal] Failed to create portal session:", error);
    return Response.json({ url: "/pricing" });
  }
}
