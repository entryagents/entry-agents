export type InspectorTab = "diff" | "preview" | "context";

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

export interface PreviewSidebarProject {
  readonly name: string;
  readonly expanded: boolean;
  readonly chats: readonly {
    readonly title: string;
    readonly active?: boolean;
  }[];
}

export const SIDEBAR_PROJECTS: readonly PreviewSidebarProject[] = [
  {
    name: "entry-agents",
    expanded: true,
    chats: [
      { title: "Ship Resend transactional emails", active: true },
      { title: "Fix OAuth callback redirect" },
    ],
  },
  {
    name: "billing-api",
    expanded: false,
    chats: [],
  },
];

export const SIDEBAR_CHATS: readonly {
  readonly title: string;
  readonly unread?: boolean;
}[] = [
  { title: "Audit mobile checkout layout", unread: true },
  { title: "Migrate Neon branch schema" },
  { title: "Stream terminal output over SSE" },
];

export const USAGE_WINDOWS: readonly {
  readonly label: string;
  readonly pct: number;
}[] = [
  { label: "5h", pct: 24 },
  { label: "7d", pct: 38 },
  { label: "30d", pct: 24 },
];

export const WORK_STEPS: readonly PreviewStep[] = [
  {
    id: "step-1",
    tool: "edit",
    detail: "apps/web/lib/email/send.ts",
    duration: "1.2s",
  },
  {
    id: "step-2",
    tool: "bash",
    detail: "bun test apps/web/lib/email",
    duration: "3.4s",
  },
  {
    id: "step-3",
    tool: "sandbox",
    detail: "expose_port 3000 -> p3000.entry-vm.boxd.sh",
    duration: "0.8s",
  },
  {
    id: "step-4",
    tool: "github",
    detail: "open_pr feat/resend-emails (#324)",
    duration: "1.1s",
  },
];

export const DIFF_FILES: readonly {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
}[] = [
  { path: "apps/web/lib/email/send.ts", added: 84, removed: 11 },
  { path: "apps/web/lib/email/templates/welcome.tsx", added: 92, removed: 0 },
  { path: "apps/web/app/api/webhooks/billing/route.ts", added: 41, removed: 8 },
  { path: "apps/web/lib/email/send.test.ts", added: 31, removed: 0 },
];

export const DIFF_LINES: readonly PreviewDiffLine[] = [
  {
    kind: "context",
    lineNo: "14",
    text: "export async function sendWelcome(user: User) {",
  },
  {
    kind: "del",
    lineNo: "15",
    text: '  return { skipped: true, reason: "no_key" };',
  },
  {
    kind: "add",
    lineNo: "15",
    text: "  const html = renderWelcome(user.name);",
  },
  {
    kind: "add",
    lineNo: "16",
    text: "  const { data, error } = await resend.send({",
  },
  {
    kind: "add",
    lineNo: "17",
    text: '    from: "Entry <noreply@entry-agents.dev>",',
  },
  {
    kind: "add",
    lineNo: "18",
    text: "    to: user.email,",
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
    text: "  if (error) throw new DeliveryError(error);",
  },
  {
    kind: "add",
    lineNo: "23",
    text: "  return { id: data?.id, delivered: true };",
  },
  {
    kind: "context",
    lineNo: "24",
    text: "}",
  },
];

export const CONTEXT_STATS: readonly {
  readonly value: string;
  readonly label: string;
}[] = [
  { value: "453.2k", label: "Total input" },
  { value: "18.4k", label: "Output" },
  { value: "14", label: "Steps" },
  { value: "96%", label: "Context reused" },
  { value: "2", label: "Turns" },
  { value: "$0.18", label: "Session cost" },
];
