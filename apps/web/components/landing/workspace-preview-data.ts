export type InspectorTab = "diff" | "preview" | "context";

export type ScenarioId = "resend" | "oauth" | "checkout";

export interface PreviewStep {
  readonly id: string;
  readonly tool: string;
  readonly detail: string;
  readonly duration: string;
}

export interface PreviewDiffLine {
  readonly kind: "context" | "add" | "del";
  readonly lineNo: string;
  readonly text: string;
}

export interface PreviewScenario {
  readonly id: ScenarioId;
  readonly title: string;
  readonly project: string | null;
  readonly branch: string;
  readonly prTag: string;
  readonly prevSteps: string;
  readonly prompt: string;
  readonly workedLabel: string;
  readonly replyBeforeCode: string;
  readonly replyCode: string;
  readonly replyAfterCode: string;
  readonly timestamp: string;
  readonly model: string;
  readonly cost: string;
  readonly filesChangedCount: number;
  readonly totalAdded: number;
  readonly totalRemoved: number;
  readonly activeDiffPath: string;
  readonly diffLines: readonly PreviewDiffLine[];
  readonly diffFiles: readonly {
    readonly path: string;
    readonly added: number;
    readonly removed: number;
  }[];
  readonly steps: readonly PreviewStep[];
  readonly previewUrl: string;
  readonly previewTag: string;
  readonly previewHeading: string;
  readonly previewBody: string;
  readonly previewCta: string;
  readonly previewMeta: string;
  readonly previewLatency: string;
  readonly contextPct: number;
  readonly contextUsed: string;
  readonly contextLeft: string;
  readonly contextFreePct: string;
  readonly contextStats: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export const SIDEBAR_PROJECTS: readonly {
  readonly name: string;
  readonly expanded: boolean;
  readonly chats: readonly {
    readonly id: ScenarioId;
    readonly title: string;
  }[];
}[] = [
  {
    name: "entry-agents",
    expanded: true,
    chats: [
      { id: "resend", title: "Ship Resend transactional emails" },
      { id: "oauth", title: "Fix OAuth callback redirect" },
    ],
  },
  {
    name: "billing-api",
    expanded: false,
    chats: [],
  },
];

export const SIDEBAR_CHATS: readonly {
  readonly id?: ScenarioId;
  readonly title: string;
  readonly unread?: boolean;
}[] = [
  { id: "checkout", title: "Audit mobile checkout layout", unread: true },
  { title: "Migrate Neon branch schema" },
  { title: "Stream terminal output over SSE" },
];

export const USAGE_WINDOWS: readonly {
  readonly label: string;
  readonly pct: number;
  readonly segments: number;
}[] = [
  { label: "5h", pct: 24, segments: 2 },
  { label: "7d", pct: 38, segments: 4 },
  { label: "30d", pct: 24, segments: 2 },
];

export const PREVIEW_SCENARIOS: Record<ScenarioId, PreviewScenario> = {
  resend: {
    id: "resend",
    title: "Ship Resend transactional emails",
    project: "entry-agents",
    branch: "feat/resend-emails",
    prTag: "#324",
    prevSteps: "Previous turn · 11 steps",
    prompt:
      "Wire up welcome and billing emails with Resend, preview the template on port 3000, and open a PR once tests pass.",
    workedLabel: "Worked 4m 18s · 14 steps",
    replyBeforeCode: "Added the welcome and renewal templates in ",
    replyCode: "apps/web/lib/email",
    replyAfterCode:
      ", wired Resend webhook delivery, verified the live preview on port 3000, and opened PR #324 with all 12 unit tests passing.",
    timestamp: "14:22",
    model: "Opus 4.6",
    cost: "$0.184",
    filesChangedCount: 4,
    totalAdded: 248,
    totalRemoved: 19,
    activeDiffPath: "apps/web/lib/email/send.ts",
    diffLines: [
      {
        kind: "context",
        lineNo: "14",
        text: "export async function sendWelcome(u: User) {",
      },
      {
        kind: "del",
        lineNo: "15",
        text: '  return { skipped: true, reason: "off" };',
      },
      {
        kind: "add",
        lineNo: "15",
        text: "  const html = renderWelcome(u.name);",
      },
      {
        kind: "add",
        lineNo: "16",
        text: "  const res = await resend.emails.send({",
      },
      {
        kind: "add",
        lineNo: "17",
        text: '    from: "Entry <hi@entry-agents.dev>",',
      },
      {
        kind: "add",
        lineNo: "18",
        text: "    to: u.email,",
      },
      {
        kind: "add",
        lineNo: "19",
        text: '    subject: "Your workspace is ready",',
      },
      {
        kind: "add",
        lineNo: "20",
        text: "    html,",
      },
      {
        kind: "add",
        lineNo: "21",
        text: "  });",
      },
      {
        kind: "add",
        lineNo: "22",
        text: "  if (res.error) throw res.error;",
      },
      {
        kind: "add",
        lineNo: "23",
        text: "  return { id: res.data?.id, ok: true };",
      },
      {
        kind: "context",
        lineNo: "24",
        text: "}",
      },
    ],
    diffFiles: [
      { path: "apps/web/lib/email/send.ts", added: 84, removed: 11 },
      {
        path: "apps/web/lib/email/templates/welcome.tsx",
        added: 92,
        removed: 0,
      },
      {
        path: "apps/web/app/api/webhooks/billing/route.ts",
        added: 41,
        removed: 8,
      },
      { path: "apps/web/lib/email/send.test.ts", added: 31, removed: 0 },
    ],
    steps: [
      {
        id: "r-1",
        tool: "edit",
        detail: "apps/web/lib/email/send.ts",
        duration: "1.2s",
      },
      {
        id: "r-2",
        tool: "bash",
        detail: "bun test apps/web/lib/email",
        duration: "3.4s",
      },
      {
        id: "r-3",
        tool: "sandbox",
        detail: "expose_port 3000 -> p3000.entry-vm.boxd.sh",
        duration: "0.8s",
      },
      {
        id: "r-4",
        tool: "github",
        detail: "open_pr feat/resend-emails (#324)",
        duration: "1.1s",
      },
    ],
    previewUrl: "https://p3000.entry-vm.boxd.sh/emails/preview",
    previewTag: "Template · Welcome",
    previewHeading: "Your cloud workspace is ready",
    previewBody:
      "Connect a repository or start in a clean Ubuntu VM. Your sessions keep running on the server after you close the tab.",
    previewCta: "Open workspace",
    previewMeta: "Rendered inside isolated VM · port 3000",
    previewLatency: "18ms",
    contextPct: 45,
    contextUsed: "453.2k of 1.0m tokens",
    contextLeft: "526.8k left before autocompact",
    contextFreePct: "526.8k · 53%",
    contextStats: [
      { value: "453.2k", label: "Total input" },
      { value: "18.4k", label: "Output" },
      { value: "14", label: "Steps" },
      { value: "96%", label: "Context reused" },
      { value: "2", label: "Turns" },
      { value: "$0.18", label: "Session cost" },
    ],
  },
  oauth: {
    id: "oauth",
    title: "Fix OAuth callback redirect",
    project: "entry-agents",
    branch: "fix/oauth-callback",
    prTag: "#319",
    prevSteps: "Previous turn · 6 steps",
    prompt:
      "Vercel and Google sign-in are rejecting the callback URL on preview deploys. Trace the redirect origin and add a regression test.",
    workedLabel: "Worked 2m 42s · 9 steps",
    replyBeforeCode: "Fixed trusted origin resolution in ",
    replyCode: "apps/web/lib/auth/config.ts",
    replyAfterCode:
      " so OAuth callbacks always normalize to the canonical production host when proxy headers vary, verified all 3 provider callbacks, and merged PR #319.",
    timestamp: "11:08",
    model: "Opus 4.6",
    cost: "$0.112",
    filesChangedCount: 2,
    totalAdded: 46,
    totalRemoved: 12,
    activeDiffPath: "apps/web/lib/auth/config.ts",
    diffLines: [
      {
        kind: "context",
        lineNo: "28",
        text: "export function resolveAuthBaseUrl(req: Request) {",
      },
      {
        kind: "del",
        lineNo: "29",
        text: "  return new URL(req.url).origin;",
      },
      {
        kind: "add",
        lineNo: "29",
        text: "  const canonical = process.env.BETTER_AUTH_URL;",
      },
      {
        kind: "add",
        lineNo: "30",
        text: '  if (canonical) return canonical.replace(/\\/$/, "");',
      },
      {
        kind: "add",
        lineNo: "31",
        text: '  const host = req.headers.get("x-forwarded-host");',
      },
      {
        kind: "add",
        lineNo: "32",
        text: '  if (host) return "https://" + host;',
      },
      {
        kind: "add",
        lineNo: "33",
        text: "  return new URL(req.url).origin;",
      },
      {
        kind: "context",
        lineNo: "34",
        text: "}",
      },
    ],
    diffFiles: [
      { path: "apps/web/lib/auth/config.ts", added: 18, removed: 6 },
      { path: "apps/web/lib/auth/config.test.ts", added: 28, removed: 6 },
    ],
    steps: [
      {
        id: "o-1",
        tool: "grep",
        detail: "callbackURL apps/web/lib/auth",
        duration: "0.4s",
      },
      {
        id: "o-2",
        tool: "edit",
        detail: "apps/web/lib/auth/config.ts",
        duration: "0.9s",
      },
      {
        id: "o-3",
        tool: "bash",
        detail: "bun test apps/web/lib/auth/config.test.ts",
        duration: "1.6s",
      },
      {
        id: "o-4",
        tool: "github",
        detail: "push fix/oauth-callback -> PR #319",
        duration: "1.0s",
      },
    ],
    previewUrl: "https://p3000.entry-vm.boxd.sh/login",
    previewTag: "Auth · Callback Check",
    previewHeading: "Sign in to Entry Agents",
    previewBody:
      "Vercel, Google, and GitHub OAuth callbacks verified against https://entry-agents.dev/api/auth/callback/* with HTTP 302 state handoff.",
    previewCta: "Continue with Vercel",
    previewMeta: "Callback probe passed · 3 providers",
    previewLatency: "14ms",
    contextPct: 28,
    contextUsed: "284.1k of 1.0m tokens",
    contextLeft: "695.9k left before autocompact",
    contextFreePct: "695.9k · 70%",
    contextStats: [
      { value: "284.1k", label: "Total input" },
      { value: "9.2k", label: "Output" },
      { value: "9", label: "Steps" },
      { value: "98%", label: "Context reused" },
      { value: "2", label: "Turns" },
      { value: "$0.11", label: "Session cost" },
    ],
  },
  checkout: {
    id: "checkout",
    title: "Audit mobile checkout layout",
    project: null,
    branch: "feat/mobile-pricing",
    prTag: "#322",
    prevSteps: "Previous turn · 8 steps",
    prompt:
      "Audit the pricing checkout modal at 375px and 1440px, eliminate horizontal overflow, and verify every interactive state in headless Chrome.",
    workedLabel: "Worked 3m 05s · 11 steps",
    replyBeforeCode: "Tightened card padding and stacked the window toggle in ",
    replyCode: "apps/web/app/pricing/plans-catalog.tsx",
    replyAfterCode:
      ". Verified scrollWidth === 375 on iPhone SE and 1440 on desktop with zero clipped controls.",
    timestamp: "09:47",
    model: "Opus 4.6",
    cost: "$0.146",
    filesChangedCount: 3,
    totalAdded: 74,
    totalRemoved: 38,
    activeDiffPath: "apps/web/app/pricing/plans-catalog.tsx",
    diffLines: [
      {
        kind: "context",
        lineNo: "312",
        text: '<div className="grid gap-3 sm:grid-cols-2">',
      },
      {
        kind: "del",
        lineNo: "313",
        text: '  <button className="min-w-[220px] p-4">',
      },
      {
        kind: "add",
        lineNo: "313",
        text: '  <button className="min-w-0 w-full p-3.5">',
      },
      {
        kind: "context",
        lineNo: "314",
        text: '    <div className="text-sm font-medium">',
      },
      {
        kind: "context",
        lineNo: "315",
        text: "      Sliding windows",
      },
      {
        kind: "context",
        lineNo: "316",
        text: "    </div>",
      },
      {
        kind: "add",
        lineNo: "317",
        text: '    <p className="mt-1 text-xs text-muted-foreground">',
      },
      {
        kind: "add",
        lineNo: "318",
        text: "      Refills continuously as usage ages out",
      },
      {
        kind: "add",
        lineNo: "319",
        text: "    </p>",
      },
      {
        kind: "context",
        lineNo: "320",
        text: "  </button>",
      },
    ],
    diffFiles: [
      {
        path: "apps/web/app/pricing/plans-catalog.tsx",
        added: 42,
        removed: 24,
      },
      {
        path: "apps/web/components/landing/pricing-strip.tsx",
        added: 22,
        removed: 10,
      },
      { path: "apps/web/app/pricing/pricing.test.ts", added: 10, removed: 4 },
    ],
    steps: [
      {
        id: "c-1",
        tool: "bash",
        detail: "playwright screenshot --viewport 375x812",
        duration: "2.8s",
      },
      {
        id: "c-2",
        tool: "edit",
        detail: "apps/web/app/pricing/plans-catalog.tsx",
        duration: "1.1s",
      },
      {
        id: "c-3",
        tool: "bash",
        detail: "pnpm check && pnpm --dir apps/web typecheck",
        duration: "4.2s",
      },
      {
        id: "c-4",
        tool: "github",
        detail: "open_pr feat/mobile-pricing (#322)",
        duration: "0.9s",
      },
    ],
    previewUrl: "https://p3000.entry-vm.boxd.sh/pricing",
    previewTag: "Viewport · 375px OK",
    previewHeading: "Builder — $10 / month",
    previewBody:
      "$28 monthly AI credit (2.8x), dedicated 2 vCPU / 8 GiB cloud VMs, and 50 active hours per month. Zero horizontal overflow verified.",
    previewCta: "Choose Builder",
    previewMeta: "Verified 375px & 1440px · 0 console errors",
    previewLatency: "21ms",
    contextPct: 34,
    contextUsed: "341.8k of 1.0m tokens",
    contextLeft: "638.2k left before autocompact",
    contextFreePct: "638.2k · 64%",
    contextStats: [
      { value: "341.8k", label: "Total input" },
      { value: "12.9k", label: "Output" },
      { value: "11", label: "Steps" },
      { value: "95%", label: "Context reused" },
      { value: "2", label: "Turns" },
      { value: "$0.15", label: "Session cost" },
    ],
  },
};
