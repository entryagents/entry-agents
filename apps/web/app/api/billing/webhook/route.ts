import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { billingWebhookEvents, users } from "@/lib/db/schema";
import { verifyBachsSignature } from "@/lib/billing/bachs";
import { processChargeSuccess } from "@/lib/billing/process-charge";
import { resolvePlanForProductId } from "@/lib/billing/plans";
import {
  setBillingSubscriptionCode,
  findUserIdByBillingCustomerCode,
  downgradeToFreeOnSubscriptionEnd,
} from "@/lib/billing/credit-ledger";
import { isUniqueConstraintViolation } from "./is-unique-constraint";

interface BachsCollectionSucceededData {
  checkout_id: string | null;
  reference: string | null;
  status: string;
  amount: string;
  currency: string;
  customer: { id: string | null; email?: string | null } | null;
  metadata: Record<string, unknown> | null;
}

interface BachsSubscriptionEventData {
  subscription_id: string;
  customer: { customer_id?: string | null } | null;
  status?: string;
}

async function claimEventOnce(
  eventKey: string,
  eventType: string,
  payload: unknown,
): Promise<boolean> {
  try {
    await db.insert(billingWebhookEvents).values({
      id: nanoid(),
      eventKey,
      eventType,
      payload,
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return false;
    }
    throw error;
  }
}

/** Decimal string -> USD integer cents. Null for anything not USD. */
function usdDecimalToCents(
  amount: string | null,
  currency: string | null,
): number | null {
  if (currency !== "USD" || !amount) return null;
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * Bachs webhook endpoint.
 *
 * Verifies X-Bachs-Signature-V2 over `{timestamp}.{rawBody}` (HMAC-SHA256)
 * with replay tolerance, then switches on `event.type`. Webhooks are the
 * source of truth for fulfilment; the callback page only paints a faster
 * result and races on the same idempotency claim.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();

  const signatureV2 = req.headers.get("x-bachs-signature-v2");
  const signatureV1 = req.headers.get("x-bachs-signature");
  const timestamp = req.headers.get("x-bachs-timestamp");

  const verified = verifyBachsSignature({
    rawBody,
    timestampHeader: timestamp,
    signatureV2Header: signatureV2,
    signatureHeader: signatureV1,
  });

  if (!verified) {
    console.error("[billing/webhook] Invalid Bachs signature");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { id?: string; type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const type = event.type;
  if (!type || !event.data) {
    return Response.json({ received: true });
  }

  try {
    switch (type) {
      case "collection.succeeded": {
        const data = event.data as unknown as BachsCollectionSucceededData;
        const metadata = data.metadata ?? {};

        const metadataUserId =
          typeof metadata.userId === "string" ? metadata.userId : null;
        const metadataKind =
          typeof metadata.kind === "string" ? metadata.kind : null;
        const metadataPlanId =
          typeof metadata.planId === "string" ? metadata.planId : null;
        const metadataUsdAmountCents =
          typeof metadata.usdAmountCents === "number"
            ? metadata.usdAmountCents
            : typeof metadata.usdAmountCents === "string" &&
                Number.isFinite(Number(metadata.usdAmountCents))
              ? Number(metadata.usdAmountCents)
              : null;

        const reference =
          data.reference ?? data.checkout_id ?? `evt_${event.id ?? "unknown"}`;

        await processChargeSuccess({
          reference,
          customerId: data.customer?.id ?? null,
          metadataUserId,
          metadataKind,
          metadataPlanId,
          metadataUsdAmountCents,
          productId: null,
          fallbackAmountCents: usdDecimalToCents(data.amount, data.currency),
        });
        break;
      }

      case "customer.subscription.created": {
        const data = event.data as unknown as BachsSubscriptionEventData;
        const eventKey = `customer.subscription.created:${data.subscription_id}`;
        const isNew = await claimEventOnce(eventKey, type, event.data);
        if (!isNew) break;

        const customerId = data.customer?.customer_id;
        if (customerId) {
          const userId = await findUserIdByBillingCustomerCode(customerId);
          if (userId) {
            await setBillingSubscriptionCode(userId, data.subscription_id);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const data = event.data as unknown as BachsSubscriptionEventData;
        const eventKey = `customer.subscription.deleted:${data.subscription_id}`;
        const isNew = await claimEventOnce(eventKey, type, event.data);
        if (!isNew) break;

        const customerId = data.customer?.customer_id;
        if (customerId) {
          const result = await downgradeToFreeOnSubscriptionEnd(
            customerId,
            data.subscription_id,
          );
          if (!result.downgraded && result.userId) {
            console.log(
              "[billing/webhook] subscription.deleted for user:",
              result.userId,
              "-- code mismatch or already free, no downgrade",
            );
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const data = event.data as unknown as {
          subscription_id?: string;
          product_id?: string | null;
          product?: { id?: string } | null;
          customer?: { customer_id?: string | null } | null;
          status?: string;
        };

        const subscriptionId = data.subscription_id;
        if (!subscriptionId) break;

        const eventKey = event.id
          ? `${type}:${event.id}`
          : `${type}:${subscriptionId}:${data.status ?? "unknown"}`;

        const planId = resolvePlanForProductId(
          data.product_id ?? data.product?.id ?? null,
        );
        const customerId = data.customer?.customer_id;
        const isTerminal =
          data.status === "canceled" || data.status === "paused";

        if (!isTerminal && (!planId || !customerId)) {
          await claimEventOnce(eventKey, type, event.data);
          break;
        }

        if (isTerminal && customerId) {
          const isNew = await claimEventOnce(eventKey, type, event.data);
          if (isNew) {
            await downgradeToFreeOnSubscriptionEnd(customerId, subscriptionId);
          }
          break;
        }

        await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: billingWebhookEvents.id })
            .from(billingWebhookEvents)
            .where(eq(billingWebhookEvents.eventKey, eventKey))
            .limit(1);

          if (existing) {
            return;
          }

          const [user] = await tx
            .select({ id: users.id })
            .from(users)
            .where(eq(users.billingCustomerCode, customerId!));

          if (user && planId) {
            await tx
              .update(users)
              .set({ plan: planId, billingSubscriptionCode: subscriptionId })
              .where(eq(users.id, user.id));
          }

          await tx.insert(billingWebhookEvents).values({
            id: nanoid(),
            eventKey,
            eventType: type,
            payload: event.data,
          });
        });
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("[billing/webhook] Failed to process event:", error);
    return Response.json(
      { error: "Internal processing error, please retry" },
      { status: 500 },
    );
  }

  return Response.json({ received: true });
}
