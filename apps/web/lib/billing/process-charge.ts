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
  normalizeEntryWindowMode,
  normalizePlanId,
  resolvePlanForProductId,
  type EntryWindowMode,
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
  metadataWindowMode?: EntryWindowMode | string | null;
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
  const planId = planFromProduct ?? normalizePlanId(outcome.metadataPlanId);

  if (isTopup && (topupCents == null || topupCents <= 0)) {
    throw new Error(`Unpriced top-up charge ${outcome.reference}`);
  }
  if (!isTopup && !planId) {
    throw new Error(`Unresolved subscription plan for ${outcome.reference}`);
  }

  const result = await db.transaction(async (tx) => {
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
          creditBalanceCents: sql`greatest(0, ${users.creditBalanceCents} - ${users.planGrantBalanceCents}) + ${plan.creditGrantCents}`,
          planGrantBalanceCents: plan.creditGrantCents,
        })
        .where(eq(users.id, userId))
        .returning({ creditBalanceCents: users.creditBalanceCents });
      if (!updated)
        throw new Error(`User ${userId} not found for subscription`);

      if (plan.id === "entry") {
        // Lock the Entry window mode to this new 1-month billingCycleAnchor.
        // If metadata carried an explicit windowMode, apply it; otherwise
        // preserve the user's existing mode (checking legacy key too) and lock it.
        const [entryModeRow] = await tx
          .select({ titleModelId: platformSettings.titleModelId })
          .from(platformSettings)
          .where(eq(platformSettings.id, `entry_window_mode:${userId}`))
          .limit(1);
        const existingModeRow =
          entryModeRow ??
          (
            await tx
              .select({ titleModelId: platformSettings.titleModelId })
              .from(platformSettings)
              .where(eq(platformSettings.id, `goat_window_mode:${userId}`))
              .limit(1)
          )[0];
        const modeToLock = outcome.metadataWindowMode
          ? normalizeEntryWindowMode(outcome.metadataWindowMode)
          : normalizeEntryWindowMode(existingModeRow?.titleModelId);
        const anchorIso = newAnchor.toISOString();

        await tx
          .insert(platformSettings)
          .values({
            id: `entry_window_mode:${userId}`,
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

  if (result.credited && !isTopup && planId && planId !== "free") {
    const { reconcileUserSandboxesOnPlanUpgrade } =
      await import("@/lib/sandbox/upgrade-reconcile");
    await reconcileUserSandboxesOnPlanUpgrade(userId).catch((err) => {
      console.warn(
        "[billing] Best-effort reconcileUserSandboxesOnPlanUpgrade failed:",
        err,
      );
    });
  }

  if (result.credited) {
    if (isTopup && topupCents) {
      void import("@/lib/email/client")
        .then(({ sendCreditTopupReceiptEmail }) =>
          sendCreditTopupReceiptEmail({
            userId,
            reference: outcome.reference,
            amountCents: topupCents,
          }),
        )
        .catch(() => {});
    } else if (planId && planId !== "free") {
      const plan = getPlanDefinition(planId);
      void import("@/lib/email/client")
        .then(({ sendSubscriptionConfirmedEmail }) =>
          sendSubscriptionConfirmedEmail({
            userId,
            reference: outcome.reference,
            planName: plan.name,
            creditGrantCents: plan.creditGrantCents,
          }),
        )
        .catch(() => {});
    }
  }

  return result;
}
