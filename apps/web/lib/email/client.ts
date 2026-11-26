import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailLogs, users } from "@/lib/db/schema";
import {
  renderBackgroundTaskCompletedEmail,
  renderCreditTopupReceiptEmail,
  renderSubscriptionCancelledEmail,
  renderSubscriptionConfirmedEmail,
  renderWelcomeEmail,
} from "./templates";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_EMAIL_FROM = "Entry <hello@entry-agents.dev>";
const DEFAULT_EMAIL_REPLY_TO = "support@entry-agents.dev";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  template: string;
  idempotencyKey: string;
  userId?: string | null;
}

export interface SendEmailResult {
  status: "sent" | "failed" | "skipped";
  messageId?: string;
  error?: string;
}

/**
 * Sends a transactional email via Resend with DB-backed idempotency (`email_logs`).
 * Never throws — safe to call from signup hooks, billing webhooks, and workflows.
 */
export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const to = input.to.trim();
  if (!to || !to.includes("@")) {
    return { status: "skipped", error: "invalid_email" };
  }

  // Idempotency guard: if this exact email event was already recorded, skip.
  try {
    const existing = await db
      .select({ id: emailLogs.id, status: emailLogs.status })
      .from(emailLogs)
      .where(eq(emailLogs.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      return { status: "skipped" };
    }
  } catch (err) {
    console.warn("[email] Failed to check idempotency key:", err);
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.log(
      `[email] RESEND_API_KEY unset; skipping "${input.template}" to ${to}`,
    );
    await recordEmailLog({
      userId: input.userId ?? null,
      toEmail: to,
      template: input.template,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
      status: "skipped",
      errorMessage: "RESEND_API_KEY not configured",
    });
    return { status: "skipped", error: "RESEND_API_KEY not configured" };
  }

  const from = process.env.EMAIL_FROM?.trim() || DEFAULT_EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || DEFAULT_EMAIL_REPLY_TO;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok) {
      const errorMsg = data.message ?? data.error ?? `HTTP ${res.status}`;
      console.error(
        `[email] Resend failed (${input.template} -> ${to}): ${errorMsg}`,
      );
      await recordEmailLog({
        userId: input.userId ?? null,
        toEmail: to,
        template: input.template,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
        status: "failed",
        errorMessage: errorMsg,
      });
      return { status: "failed", error: errorMsg };
    }

    await recordEmailLog({
      userId: input.userId ?? null,
      toEmail: to,
      template: input.template,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
      providerMessageId: data.id ?? null,
      status: "sent",
    });
    return { status: "sent", messageId: data.id };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[email] Network error (${input.template} -> ${to}):`, err);
    await recordEmailLog({
      userId: input.userId ?? null,
      toEmail: to,
      template: input.template,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
      status: "failed",
      errorMessage: errorMsg,
    });
    return { status: "failed", error: errorMsg };
  }
}

async function recordEmailLog(params: {
  userId: string | null;
  toEmail: string;
  template: string;
  subject: string;
  idempotencyKey: string;
  providerMessageId?: string | null;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string | null;
}): Promise<void> {
  try {
    await db
      .insert(emailLogs)
      .values({
        id: crypto.randomUUID(),
        userId: params.userId,
        toEmail: params.toEmail,
        template: params.template,
        subject: params.subject,
        idempotencyKey: params.idempotencyKey,
        providerMessageId: params.providerMessageId ?? null,
        status: params.status,
        errorMessage: params.errorMessage ?? null,
      })
      .onConflictDoNothing({ target: emailLogs.idempotencyKey });
  } catch (err) {
    console.warn("[email] Failed to insert email_logs row:", err);
  }
}

async function lookupUserContact(
  userId: string,
): Promise<{ email: string; name: string | null } | null> {
  const rows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row?.email) return null;
  return { email: row.email, name: row.name ?? null };
}

export async function sendWelcomeEmail(params: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<SendEmailResult> {
  const rendered = renderWelcomeEmail({ name: params.name });
  return sendTransactionalEmail({
    to: params.email,
    userId: params.userId,
    template: "welcome",
    idempotencyKey: `welcome:${params.userId}`,
    ...rendered,
  });
}

export async function sendSubscriptionConfirmedEmail(params: {
  userId: string;
  reference: string;
  planName: string;
  creditGrantCents: number;
}): Promise<SendEmailResult> {
  const contact = await lookupUserContact(params.userId);
  if (!contact) return { status: "skipped", error: "user_not_found" };
  const creditGrantUsd = `$${(params.creditGrantCents / 100).toFixed(2)}`;
  const rendered = renderSubscriptionConfirmedEmail({
    name: contact.name,
    planName: params.planName,
    creditGrantUsd,
  });
  return sendTransactionalEmail({
    to: contact.email,
    userId: params.userId,
    template: "subscription-confirmed",
    idempotencyKey: `billing:sub:${params.reference}`,
    ...rendered,
  });
}

export async function sendSubscriptionCancelledEmail(params: {
  userId: string;
  subscriptionId: string;
}): Promise<SendEmailResult> {
  const contact = await lookupUserContact(params.userId);
  if (!contact) return { status: "skipped", error: "user_not_found" };
  const rendered = renderSubscriptionCancelledEmail({ name: contact.name });
  return sendTransactionalEmail({
    to: contact.email,
    userId: params.userId,
    template: "subscription-cancelled",
    idempotencyKey: `billing:cancel:${params.subscriptionId}`,
    ...rendered,
  });
}

export async function sendCreditTopupReceiptEmail(params: {
  userId: string;
  reference: string;
  amountCents: number;
}): Promise<SendEmailResult> {
  const contact = await lookupUserContact(params.userId);
  if (!contact) return { status: "skipped", error: "user_not_found" };
  const amountUsd = `$${(params.amountCents / 100).toFixed(2)}`;
  const rendered = renderCreditTopupReceiptEmail({
    name: contact.name,
    amountUsd,
  });
  return sendTransactionalEmail({
    to: contact.email,
    userId: params.userId,
    template: "credit-topup-receipt",
    idempotencyKey: `billing:topup:${params.reference}`,
    ...rendered,
  });
}

export async function sendBackgroundTaskCompletedEmail(params: {
  userId: string;
  workflowRunId: string;
  chatId: string;
  chatTitle: string;
  durationMs: number;
  stepsCount: number;
  costUsd?: number;
}): Promise<SendEmailResult> {
  const contact = await lookupUserContact(params.userId);
  if (!contact) return { status: "skipped", error: "user_not_found" };

  const totalSec = Math.round(params.durationMs / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const durationLabel =
    hrs > 0 ? `${hrs}h ${mins}m` : mins > 0 ? `${mins}m` : `${totalSec}s`;

  const rendered = renderBackgroundTaskCompletedEmail({
    name: contact.name,
    chatId: params.chatId,
    chatTitle: params.chatTitle || "Entry Chat",
    durationLabel,
    stepsCount: params.stepsCount,
    ...(typeof params.costUsd === "number" && Number.isFinite(params.costUsd)
      ? { costUsd: `$${params.costUsd.toFixed(4)}` }
      : {}),
  });
  return sendTransactionalEmail({
    to: contact.email,
    userId: params.userId,
    template: "background-task-completed",
    idempotencyKey: `task-done:${params.workflowRunId}`,
    ...rendered,
  });
}
