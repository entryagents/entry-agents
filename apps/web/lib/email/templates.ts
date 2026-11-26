const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://entry-agents.dev";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLayout(params: {
  previewText: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const ctaBlock =
    params.ctaLabel && params.ctaUrl
      ? `<div style="margin-top:24px;">
           <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 18px;border-radius:8px;">
             ${escapeHtml(params.ctaLabel)}
           </a>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(params.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(params.previewText)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;">
          <tr>
            <td>
              <div style="font-size:13px;font-weight:600;color:#52525b;letter-spacing:-0.01em;">Entry</div>
              <h1 style="margin:12px 0 0;font-size:20px;line-height:1.35;font-weight:600;color:#111111;">
                ${escapeHtml(params.heading)}
              </h1>
              <div style="margin-top:14px;font-size:14px;line-height:1.6;color:#3f3f46;">
                ${params.bodyHtml}
              </div>
              ${ctaBlock}
              <div style="margin-top:28px;padding-top:16px;border-top:1px solid #f0f0f2;font-size:12px;line-height:1.5;color:#71717a;">
                ${escapeHtml(params.footerNote ?? "Sent by Entry Agents · entry-agents.dev")}
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderWelcomeEmail(params: {
  name?: string | null;
}): RenderedEmail {
  const greeting = params.name?.trim()
    ? `Hi ${params.name.trim()},`
    : "Welcome,";
  const ctaUrl = `${APP_URL}/chats`;
  return {
    subject: "Welcome to Entry",
    html: renderLayout({
      previewText:
        "Your cloud autonomous workspace is ready with $1.00 in starter credit.",
      heading: "Welcome to Entry",
      bodyHtml: `
        <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 12px;">Your account is live with <strong>$1.00 in welcome credit</strong>. You can start a chat, attach a GitHub repository, or connect Gmail, Tasks, and other tools right from your workspace.</p>
        <p style="margin:0;">Long tasks keep running in the background even when you close your browser or lock your phone.</p>
      `,
      ctaLabel: "Open Entry",
      ctaUrl,
    }),
    text: `${greeting}\n\nYour Entry account is live with $1.00 in welcome credit. Start a chat, attach a GitHub repo, or connect your apps at ${ctaUrl}.\n`,
  };
}

export function renderSubscriptionConfirmedEmail(params: {
  name?: string | null;
  planName: string;
  creditGrantUsd: string;
}): RenderedEmail {
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : "Hello,";
  const ctaUrl = `${APP_URL}/chats`;
  return {
    subject: `Your Entry ${params.planName} plan is active`,
    html: renderLayout({
      previewText: `${params.planName} plan activated with ${params.creditGrantUsd} in usage credits.`,
      heading: `${params.planName} plan active`,
      bodyHtml: `
        <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 12px;">Your <strong>Entry ${escapeHtml(params.planName)}</strong> subscription is now active and <strong>${escapeHtml(params.creditGrantUsd)}</strong> in usage credits has been added to your balance.</p>
        <p style="margin:0;">You can manage your billing and usage anytime from Settings.</p>
      `,
      ctaLabel: "Start a chat",
      ctaUrl,
    }),
    text: `${greeting}\n\nYour Entry ${params.planName} plan is active and ${params.creditGrantUsd} in usage credits has been added to your balance.\n\nOpen Entry: ${ctaUrl}\n`,
  };
}

export function renderSubscriptionCancelledEmail(params: {
  name?: string | null;
}): RenderedEmail {
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : "Hello,";
  const ctaUrl = `${APP_URL}/pricing`;
  return {
    subject: "Your Entry subscription has ended",
    html: renderLayout({
      previewText: "Your account has moved back to the Free plan.",
      heading: "Subscription ended",
      bodyHtml: `
        <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 12px;">Your paid Entry subscription has ended and your account is now on the Free plan. Your existing chats and files remain accessible.</p>
        <p style="margin:0;">You can resubscribe anytime if you need higher limits or dedicated sandboxes.</p>
      `,
      ctaLabel: "View plans",
      ctaUrl,
    }),
    text: `${greeting}\n\nYour paid Entry subscription has ended and your account is now on the Free plan. View plans anytime at ${ctaUrl}.\n`,
  };
}

export function renderCreditTopupReceiptEmail(params: {
  name?: string | null;
  amountUsd: string;
}): RenderedEmail {
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : "Hello,";
  const ctaUrl = `${APP_URL}/settings/billing`;
  return {
    subject: `Receipt: ${params.amountUsd} Entry credit top-up`,
    html: renderLayout({
      previewText: `${params.amountUsd} in usage credits added to your Entry balance.`,
      heading: "Credit top-up confirmed",
      bodyHtml: `
        <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 12px;">We received your payment and added <strong>${escapeHtml(params.amountUsd)}</strong> in usage credits to your Entry account.</p>
        <p style="margin:0;">Credits are available immediately across all models.</p>
      `,
      ctaLabel: "View billing",
      ctaUrl,
    }),
    text: `${greeting}\n\nWe received your payment and added ${params.amountUsd} in usage credits to your Entry account.\n\nBilling: ${ctaUrl}\n`,
  };
}

export function renderBackgroundTaskCompletedEmail(params: {
  name?: string | null;
  chatId: string;
  chatTitle: string;
  durationLabel: string;
  stepsCount: number;
  costUsd?: string;
}): RenderedEmail {
  const greeting = params.name?.trim() ? `Hi ${params.name.trim()},` : "Hello,";
  const ctaUrl = `${APP_URL}/chats/${encodeURIComponent(params.chatId)}`;
  const costLine = params.costUsd ? ` · ${params.costUsd}` : "";
  return {
    subject: `Background task finished: ${params.chatTitle}`,
    html: renderLayout({
      previewText: `${params.chatTitle} finished after ${params.durationLabel} (${params.stepsCount} steps).`,
      heading: "Background task finished",
      bodyHtml: `
        <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 12px;">Your background task <strong>${escapeHtml(params.chatTitle)}</strong> has finished running.</p>
        <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#111111;background:#f4f4f5;padding:10px 12px;border-radius:8px;">
          Duration: ${escapeHtml(params.durationLabel)} · ${params.stepsCount} steps${escapeHtml(costLine)}
        </p>
      `,
      ctaLabel: "Open chat",
      ctaUrl,
    }),
    text: `${greeting}\n\nYour background task "${params.chatTitle}" finished.\nDuration: ${params.durationLabel} | ${params.stepsCount} steps${costLine}\n\nOpen chat: ${ctaUrl}\n`,
  };
}
