import "server-only";

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  billingWebhookEvents,
  creditTransactions,
  platformSettings,
  users,
} from "@/lib/db/schema";
import {
  getPlanDefinition,
  isPlanId,
  normalizeGoatWindowMode,
  resolvePlanForProductId,
  type GoatWindowMode,
} from "@/lib/billing/plans";
import { findUserIdByBillingCustomerCode } from "@/lib/billing/credit-ledger";

export interface ChargeOutcome {
  reference: string;
  customerId: string | null;
  subscriptionId?: string | null;
  metadataUserId: string | null;
  metadataKind: string | null;
  metadataPlanId: string | null;
  metadataUsdAmountCents: number | null;
  metadataWindowMode?: GoatWindowMode | string | null;
  productId: string | null;
  fallbackAmountCents: number | null;
}

/** Credits a successful charge atomically with its idempotency marker. */
export async function processChargeSuccess(
  outcome: ChargeOutcome,
): Promise<{ credited: boolean; alreadyProcessed: boolean }> {
  const eventKey = `collection.succeeded:${outcome.reference}`;
  const userId =
    outcome.metadataUserId ??
    (outcome.customerId
      ? await findUserIdByBillingCustomerCode(outcome.customerId)
      : null);

  if (!userId) {
    console.warn("[billing] collection.succeeded: no matching user", {
      customerId: outcome.customerId,
      reference: outcome.reference,
    });
    return { credited: false, alreadyProcessed: false };
  }

  const isTopup = outcome.metadataKind === "topup";
  const topupCents =
    outcome.metadataUsdAmountCents ?? outcome.fallbackAmountCents;
  // Prefer resolving from the live productId first so an in-place subscription
  // upgrade (PATCH /v1/subscriptions/{id}) never reverts to a stale
  // metadata.planId copied from the original subscription creation.
  const planFromProduct = resolvePlanForProductId(outcome.productId);
  const planId =
    planFromProduct ??
    (outcome.metadataPlanId && isPlanId(outcome.metadataPlanId)
      ? outcome.metadataPlanId
      : null);

  if (isTopup && (topupCents == null || topupCents <= 0)) {
    throw new Error(`Unpriced top-up charge ${outcome.reference}`);
  }
  if (!isTopup && !planId) {
    throw new Error(`Unresolved subscription plan for ${outcome.reference}`);
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: billingWebhookEvents.id })
      .from(billingWebhookEvents)
      .where(eq(billingWebhookEvents.eventKey, eventKey))
      .limit(1);
    if (existing) {
      return { credited: false, alreadyProcessed: true };
    }

    if (isTopup) {
      const [updated] = await tx
        .update(users)
        .set({
          billingCustomerCode: outcome.customerId ?? undefined,
          creditBalanceCents: sql`${users.creditBalanceCents} + ${topupCents}`,
        })
        .where(eq(users.id, userId))
        .returning({ creditBalanceCents: users.creditBalanceCents });
      if (!updated) throw new Error(`User ${userId} not found for top-up`);

      await tx.insert(creditTransactions).values({
        id: nanoid(),
        userId,
        type: "topup",
        amountCents: topupCents!,
        balanceAfterCents: updated.creditBalanceCents,
        description: "Wallet top-up",
        billingReference: outcome.reference,
      });
    } else {
      const plan = getPlanDefinition(planId!);
      const newAnchor = new Date();
      const [updated] = await tx
        .update(users)
        .set({
          billingCustomerCode: outcome.customerId ?? undefined,
          billingSubscriptionCode: outcome.subscriptionId ?? undefined,
          plan: planId!,
          billingCycleAnchor: newAnchor,
          creditBalanceCents: sql`${users.creditBalanceCents} + ${plan.creditGrantCents}`,
          planGrantBalanceCents: sql`${users.planGrantBalanceCents} + ${plan.creditGrantCents}`,
        })
        .where(eq(users.id, userId))
        .returning({ creditBalanceCents: users.creditBalanceCents });
      if (!updated)
        throw new Error(`User ${userId} not found for subscription`);

      if (plan.id === "goat") {
        // Lock the GOAT window mode to this new 1-month billingCycleAnchor.
        // If metadata carried an explicit windowMode, apply it; otherwise
        // preserve the user's existing mode and lock it to the new anchor.
        const [existingModeRow] = await tx
          .select({ titleModelId: platformSettings.titleModelId })
          .from(platformSettings)
          .where(eq(platformSettings.id, `goat_window_mode:${userId}`))
          .limit(1);
        const modeToLock = outcome.metadataWindowMode
          ? normalizeGoatWindowMode(outcome.metadataWindowMode)
          : normalizeGoatWindowMode(existingModeRow?.titleModelId);
        const anchorIso = newAnchor.toISOString();

        await tx
          .insert(platformSettings)
          .values({
            id: `goat_window_mode:${userId}`,
            titleModelId: modeToLock,
            disabledReason: anchorIso,
            updatedAt: newAnchor,
          })
          .onConflictDoUpdate({
            target: platformSettings.id,
            set: {
              titleModelId: modeToLock,
              disabledReason: anchorIso,
              updatedAt: newAnchor,
            },
          });
      }

      await tx.insert(creditTransactions).values({
        id: nanoid(),
        userId,
        type: "subscription_grant",
        amountCents: plan.creditGrantCents,
        balanceAfterCents: updated.creditBalanceCents,
        description: `${plan.name} plan renewal`,
        billingReference: outcome.reference,
      });
    }

    await tx.insert(billingWebhookEvents).values({
      id: nanoid(),
      eventKey,
      eventType: "collection.succeeded",
      payload: outcome as unknown as Record<string, unknown>,
    });

    return { credited: true, alreadyProcessed: false };
  });
}
