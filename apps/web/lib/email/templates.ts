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

interface DetailRow {
  label: string;
  value: string;
  mono?: boolean;
}

function renderDetailTable(rows: DetailRow[]): string {
  const renderedRows = rows
    .map((row, idx) => {
      const borderTop = idx === 0 ? "" : "border-top:1px solid #f0f0f3;";
      const valueFont = row.mono
        ? "font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:13px;"
        : "font-size:13px;";
      return `<tr>
        <td style="padding:10px 14px;${borderTop}font-size:13px;color:#71717a;width:44%;">
          ${escapeHtml(row.label)}
        </td>
        <td align="right" style="padding:10px 14px;${borderTop}${valueFont}font-weight:500;color:#18181b;font-variant-numeric:tabular-nums;">
          ${escapeHtml(row.value)}
        </td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;border-collapse:separate;overflow:hidden;">
    ${renderedRows}
  </table>`;
}

function renderStepList(
  items: Array<{ title: string; detail: string }>,
): string {
  const rows = items
    .map((item, idx) => {
      const paddingTop = idx === 0 ? "0" : "12px";
      return `<tr>
        <td valign="top" style="padding-top:${paddingTop};padding-right:12px;width:24px;">
          <div style="width:20px;height:20px;line-height:20px;text-align:center;border-radius:6px;background:#f4f4f5;border:1px solid #e4e4e7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:600;color:#3f3f46;">
            ${idx + 1}
          </div>
        </td>
        <td valign="top" style="padding-top:${paddingTop};">
          <div style="font-size:13.5px;font-weight:500;color:#18181b;line-height:1.4;">
            ${escapeHtml(item.title)}
          </div>
          <div style="margin-top:2px;font-size:13px;color:#52525b;line-height:1.5;">
            ${escapeHtml(item.detail)}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
    ${rows}
  </table>`;
}

function renderLayout(params: {
  previewText: string;
  category: string;
  heading: string;
  subheading?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  secondaryLinkLabel?: string;
  secondaryLinkUrl?: string;
  footerNote?: string;
}): string {
  const ctaBlock =
    params.ctaLabel && params.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
          <tr>
            <td>
              <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:13.5px;font-weight:500;padding:11px 20px;border-radius:8px;letter-spacing:-0.01em;">
                ${escapeHtml(params.ctaLabel)}
              </a>
            </td>
            ${
              params.secondaryLinkLabel && params.secondaryLinkUrl
                ? `<td style="padding-left:16px;">
                    <a href="${escapeHtml(params.secondaryLinkUrl)}" style="font-size:13px;font-weight:500;color:#52525b;text-decoration:none;">
                      ${escapeHtml(params.secondaryLinkLabel)} &rarr;
                    </a>
                  </td>`
                : ""
            }
          </tr>
        </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(params.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${escapeHtml(params.previewText)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <!-- Outer card -->
          <tr>
            <td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;">
              <!-- Header bar -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #f0f0f3;padding:18px 28px;">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width:20px;height:20px;background:#18181b;border-radius:5px;text-align:center;vertical-align:middle;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;color:#ffffff;">
                          E
                        </td>
                        <td style="padding-left:9px;font-size:14px;font-weight:600;color:#18181b;letter-spacing:-0.02em;">
                          Entry
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="font-size:12px;color:#71717a;font-weight:500;">
                    ${escapeHtml(params.category)}
                  </td>
                </tr>
              </table>

              <!-- Main content -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:28px;">
                <tr>
                  <td>
                    <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;color:#18181b;letter-spacing:-0.02em;">
                      ${escapeHtml(params.heading)}
                    </h1>
                    ${
                      params.subheading
                        ? `<p style="margin:8px 0 0;font-size:14.5px;line-height:1.55;color:#52525b;">
                            ${escapeHtml(params.subheading)}
                          </p>`
                        : ""
                    }
                    <div style="margin-top:18px;font-size:14px;line-height:1.65;color:#3f3f46;">
                      ${params.bodyHtml}
                    </div>
                    ${ctaBlock}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Quiet footer -->
          <tr>
            <td style="padding:20px 8px 0;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
                ${escapeHtml(params.footerNote ?? "Entry Agents · Cloud autonomous workspace")}
              </p>
              <p style="margin:4px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">
                <a href="${APP_URL}/chats" style="color:#71717a;text-decoration:none;">Workspace</a>
                &nbsp;&middot;&nbsp;
                <a href="${APP_URL}/settings/billing" style="color:#71717a;text-decoration:none;">Billing</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:support@entry-agents.dev" style="color:#71717a;text-decoration:none;">Support</a>
              </p>
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
  const firstName = params.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Welcome,";
  const ctaUrl = `${APP_URL}/chats`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0;">Your Entry workspace is ready. We added <strong>$1.00 in starter credit</strong> so you can run real tasks immediately—whether you are writing code in an isolated Linux sandbox or working across your connected apps.</p>
    ${renderStepList([
      {
        title: "Start a chat from any device",
        detail:
          "Describe a task or attach a GitHub repo. Entry plans, edits, runs tests, and verifies its own work.",
      },
      {
        title: "Close the tab and stay offline",
        detail:
          "Long tasks run on durable server workflows in the cloud, so they keep making progress even when your phone is locked.",
      },
      {
        title: "Connect your daily tools",
        detail:
          "Link GitHub, Gmail, Google Tasks, Slack, or Notion when you need Entry to act outside the repo.",
      },
    ])}
    ${renderDetailTable([
      { label: "Starter credit", value: "$1.00", mono: true },
      { label: "Workspace URL", value: "entry-agents.dev/chats", mono: true },
    ])}
  `;

  return {
    subject: "Welcome to Entry",
    html: renderLayout({
      previewText:
        "Your workspace is ready with $1.00 in starter credit. Start a task from any device.",
      category: "Account",
      heading: "Your workspace is ready",
      subheading:
        "Code, research, and run your tools in the cloud—even offline.",
      bodyHtml,
      ctaLabel: "Open workspace",
      ctaUrl,
      secondaryLinkLabel: "Connect apps",
      secondaryLinkUrl: `${APP_URL}/settings/connections`,
    }),
    text: `${greeting}\n\nYour Entry workspace is ready with $1.00 in starter credit.\n\n1. Start a chat from any device or attach a GitHub repo.\n2. Close the tab — long tasks keep running in the cloud while you're offline.\n3. Connect GitHub, Gmail, Tasks, Slack, or Notion from Settings.\n\nOpen workspace: ${ctaUrl}\n`,
  };
}

export function renderSubscriptionConfirmedEmail(params: {
  name?: string | null;
  planName: string;
  creditGrantUsd: string;
}): RenderedEmail {
  const firstName = params.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const ctaUrl = `${APP_URL}/chats`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0;">Your <strong>Entry ${escapeHtml(params.planName)}</strong> plan is now active. Your monthly usage credits have been added to your balance and are ready across all models.</p>
    ${renderDetailTable([
      { label: "Plan", value: `Entry ${params.planName}` },
      { label: "Usage credit added", value: params.creditGrantUsd, mono: true },
      { label: "Status", value: "Active" },
    ])}
  `;

  return {
    subject: `Your Entry ${params.planName} plan is active`,
    html: renderLayout({
      previewText: `Entry ${params.planName} is active with ${params.creditGrantUsd} in usage credits.`,
      category: "Billing",
      heading: `Entry ${params.planName} is active`,
      subheading: "Your credits are available immediately across all models.",
      bodyHtml,
      ctaLabel: "Open workspace",
      ctaUrl,
      secondaryLinkLabel: "Manage billing",
      secondaryLinkUrl: `${APP_URL}/settings/billing`,
    }),
    text: `${greeting}\n\nYour Entry ${params.planName} plan is now active and ${params.creditGrantUsd} in usage credits has been added to your balance.\n\nOpen workspace: ${ctaUrl}\nManage billing: ${APP_URL}/settings/billing\n`,
  };
}

export function renderSubscriptionCancelledEmail(params: {
  name?: string | null;
}): RenderedEmail {
  const firstName = params.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const ctaUrl = `${APP_URL}/pricing`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0;">Your paid Entry subscription has ended and your account has been moved back to the Free plan. All of your existing chats, history, and connected settings remain intact.</p>
    ${renderDetailTable([
      { label: "Current plan", value: "Free" },
      { label: "Chat history", value: "Preserved" },
    ])}
  `;

  return {
    subject: "Your Entry subscription has ended",
    html: renderLayout({
      previewText:
        "Your account has moved to the Free plan. Your chat history remains intact.",
      category: "Billing",
      heading: "Subscription ended",
      subheading: "Your account is now on the Free plan.",
      bodyHtml,
      ctaLabel: "View plans",
      ctaUrl,
      secondaryLinkLabel: "Open workspace",
      secondaryLinkUrl: `${APP_URL}/chats`,
    }),
    text: `${greeting}\n\nYour paid Entry subscription has ended and your account has moved back to the Free plan. Your chats and history remain preserved.\n\nView plans: ${ctaUrl}\n`,
  };
}

export function renderCreditTopupReceiptEmail(params: {
  name?: string | null;
  amountUsd: string;
}): RenderedEmail {
  const firstName = params.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const ctaUrl = `${APP_URL}/settings/billing`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0;">We received your payment and credited your Entry wallet. Your balance is available immediately for all models and background runs.</p>
    ${renderDetailTable([
      { label: "Credit added", value: params.amountUsd, mono: true },
      { label: "Availability", value: "Immediate" },
    ])}
  `;

  return {
    subject: `Receipt: ${params.amountUsd} Entry credit top-up`,
    html: renderLayout({
      previewText: `${params.amountUsd} in usage credits added to your Entry wallet.`,
      category: "Receipt",
      heading: "Credit top-up confirmed",
      subheading: `${params.amountUsd} has been added to your Entry balance.`,
      bodyHtml,
      ctaLabel: "View billing",
      ctaUrl,
      secondaryLinkLabel: "Open workspace",
      secondaryLinkUrl: `${APP_URL}/chats`,
    }),
    text: `${greeting}\n\nWe received your payment and added ${params.amountUsd} in usage credits to your Entry wallet.\n\nView billing: ${ctaUrl}\n`,
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
  const firstName = params.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const ctaUrl = `${APP_URL}/chats/${encodeURIComponent(params.chatId)}`;

  const detailRows: DetailRow[] = [
    { label: "Chat", value: params.chatTitle },
    { label: "Elapsed time", value: params.durationLabel, mono: true },
    { label: "Autonomous steps", value: `${params.stepsCount}`, mono: true },
  ];
  if (params.costUsd) {
    detailRows.push({ label: "Total cost", value: params.costUsd, mono: true });
  }

  const bodyHtml = `
    <p style="margin:0 0 12px;">${escapeHtml(greeting)}</p>
    <p style="margin:0;">Your background run completed while you were away. Open the chat to review the final summary, inspect changed files, or send a follow-up.</p>
    ${renderDetailTable(detailRows)}
  `;

  const costText = params.costUsd ? `\nTotal cost: ${params.costUsd}` : "";

  return {
    subject: `Task finished: ${params.chatTitle}`,
    html: renderLayout({
      previewText: `${params.chatTitle} finished in ${params.durationLabel} across ${params.stepsCount} steps.`,
      category: "Background run",
      heading: "Your background task finished",
      subheading: params.chatTitle,
      bodyHtml,
      ctaLabel: "Review results",
      ctaUrl,
    }),
    text: `${greeting}\n\nYour background task "${params.chatTitle}" finished while you were away.\n\nElapsed time: ${params.durationLabel}\nAutonomous steps: ${params.stepsCount}${costText}\n\nReview results: ${ctaUrl}\n`,
  };
}
