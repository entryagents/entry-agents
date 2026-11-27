import { eq } from "drizzle-orm";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  createCustomerPortalSession,
  findCustomerByEmail,
} from "@/lib/billing/bachs";
import { getUserBillingState } from "@/lib/billing/credit-ledger";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const billingState = await getUserBillingState(session.user.id);
  let customerId = billingState?.billingCustomerCode ?? null;

  if (!customerId && session.user.email) {
    try {
      const matched = await findCustomerByEmail(session.user.email);
      if (matched?.customerId) {
        customerId = matched.customerId;
        await db
          .update(users)
          .set({ billingCustomerCode: customerId, updatedAt: new Date() })
          .where(eq(users.id, session.user.id));
      }
    } catch (lookupError) {
      console.error("[billing/portal] Customer lookup failed:", lookupError);
    }
  }

  if (!customerId) {
    return Response.json(
      {
        error:
          "No active Bachs billing profile is linked to this account yet. Subscribe through checkout to manage invoices and payment methods.",
      },
      { status: 404 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    new URL(req.url).origin;
  const returnUrl =
    origin.startsWith("https://") && !origin.includes("localhost")
      ? `${origin}/settings/billing`
      : undefined;

  try {
    const portal = await createCustomerPortalSession(customerId, returnUrl);
    return Response.json({ url: portal.url });
  } catch (error) {
    console.error("[billing/portal] Failed to create portal session:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not open Bachs billing portal right now. Please try again.",
      },
      { status: 502 },
    );
  }
}
