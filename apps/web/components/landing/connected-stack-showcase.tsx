"use client";

import { ArrowRight, CheckCircle2, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ToolkitPresetIcon } from "@/components/toolkit-icons";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type StackInvocation = {
  readonly slug: string;
  readonly name: string;
  readonly label: string;
  readonly role: string;
  readonly prompt: string;
  readonly invocation: string;
  readonly target: string;
  readonly duration: string;
  readonly resultSummary: string;
  readonly artifactLine: string;
};

const STACK_INVOCATIONS: readonly StackInvocation[] = [
  {
    slug: "github",
    name: "GitHub",
    label: "GitHub",
    role: "Branches, diffs, and pull requests",
    prompt:
      "Address the four review comments on PR #109, verify lint and tests inside the sandbox, and push updated commits",
    invocation: "github.list_review_comments -> file.edit -> github.push",
    target: "origin/feat/durable-streams",
    duration: "1.3s",
    resultSummary:
      "Applied every requested edge-case fix, ran checks locally in the Ubuntu VM, and pushed clean commits to the pull request.",
    artifactLine: "4 review threads resolved · checks green",
  },
  {
    slug: "vercel",
    name: "Vercel",
    label: "Vercel",
    role: "Preview builds and production verification",
    prompt:
      "Run a full Next.js build check inside the workspace, publish a preview deployment, and confirm all routes return HTTP 200",
    invocation: "bash.build -> vercel.deploy -> curl.verify",
    target: "entry-agents-preview.vercel.app",
    duration: "1.8s",
    resultSummary:
      "Compiled production bundles cleanly, deployed an isolated preview URL, and verified core routes end to end.",
    artifactLine: "Preview deployment READY · 200 OK across routes",
  },
  {
    slug: "linear",
    name: "Linear",
    label: "Linear",
    role: "Turn issues into verified PRs",
    prompt:
      "Pick up ENG-418, implement contract validation across both modules, verify tests pass, and move the ticket to In Review",
    invocation: "linear.get_issue -> file.edit -> linear.update_issue",
    target: "ENG-418 · team-board.ts",
    duration: "1.1s",
    resultSummary:
      "Read acceptance criteria from ENG-418, implemented the fix with regression coverage, and attached commit 8a3f92c back to Linear.",
    artifactLine: "ENG-418 moved to In Review",
  },
  {
    slug: "slack",
    name: "Slack",
    label: "Slack",
    role: "Incident traces and release updates",
    prompt:
      "Check #eng-alerts for the latency spike, isolate the slow query in the workspace, and post the patch summary to #deployments",
    invocation: "slack.read_channel -> bash.run -> slack.post_message",
    target: "#eng-alerts -> #deployments",
    duration: "0.9s",
    resultSummary:
      "Found an unindexed lookup under concurrent reconnects, wrote a Drizzle migration, and posted the verified before/after timings.",
    artifactLine: "Query p95 dropped 410ms -> 18ms",
  },
  {
    slug: "gmail",
    name: "Gmail",
    label: "Gmail",
    role: "Bug reports and reply drafts",
    prompt:
      "Read this morning's customer bug threads, reproduce the webhook retry timeout in tests, and draft replies with the PR link",
    invocation: "gmail.search_threads -> bash.run -> gmail.create_draft",
    target: "3 threads · webhook-retry.test.ts",
    duration: "1.4s",
    resultSummary:
      "Reproduced the 504 timeout on signature replay, added an idempotency guard, and saved three customer reply drafts for review.",
    artifactLine: "PR #142 opened · 3 drafts ready in Gmail",
  },
  {
    slug: "notion",
    name: "Notion",
    label: "Notion",
    role: "Specs and release notes",
    prompt:
      "Read the Auth API spec in Notion, compare route schemas against the codebase, and sync the updated changelog table",
    invocation: "notion.fetch_page -> grep.search -> notion.append_blocks",
    target: "Engineering / Auth Spec",
    duration: "1.2s",
    resultSummary:
      "Checked all six route schemas against implementation, fixed one missing header check, and updated the Notion spec table.",
    artifactLine: "Spec synced · 1 route mismatch fixed",
  },
  {
    slug: "figma",
    name: "Figma",
    label: "Figma",
    role: "Spacing and token parity",
    prompt:
      "Inspect spacing, border hairlines, and type tokens from the Pricing frame and verify responsive parity at 375px and 1440px",
    invocation: "figma.get_styles -> file.edit -> browser.verify",
    target: "plans-catalog.tsx · 375px / 1440px",
    duration: "1.5s",
    resultSummary:
      "Matched card radii, neutral ramp, and tabular columns from the Figma frame and confirmed zero overflow on mobile.",
    artifactLine: "Token diff applied · mobile layout verified",
  },
  {
    slug: "jira",
    name: "Jira",
    label: "Jira",
    role: "Sprint blockers and QA logs",
    prompt:
      "Pull assigned blockers from the active sprint, run regression suites for each fix, and attach verification output to Jira",
    invocation: "jira.search_issues -> bash.test -> jira.add_comment",
    target: "CORE-204 · CORE-209",
    duration: "1.3s",
    resultSummary:
      "Verified both regression fixes in isolated test runs and attached commit SHAs and pass counts directly to the Jira issues.",
    artifactLine: "2 blockers verified · 38 tests passing",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    label: "Calendar",
    role: "Release windows and scheduling",
    prompt:
      "Find an open 30-minute launch window tomorrow for everyone on the release thread and attach the preview checklist",
    invocation: "calendar.freebusy -> calendar.create_event",
    target: "Release Readiness · 14:00 UTC",
    duration: "0.8s",
    resultSummary:
      "Checked availability across three time zones and booked the walkthrough with links to the verified PR and preview build.",
    artifactLine: "Calendar hold sent · 4 attendees",
  },
];

export function ConnectedStackShowcase() {
  const [selectedSlug, setSelectedSlug] = useState<string>("github");
  const activeItem =
    STACK_INVOCATIONS.find((item) => item.slug === selectedSlug) ??
    STACK_INVOCATIONS[0];

  return (
    <section aria-label="Connected tools and integrations">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left column: headline + clean 3x3 real brand icon selector */}
            <div className="min-w-0 lg:col-span-5">
              <h2 className="font-display text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-4xl">
                Connected where the work starts
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Read tickets, inspect threads, edit the codebase in your Linux
                VM, and write verified updates back without switching windows.
              </p>

              <div
                role="tablist"
                aria-label="Connected apps"
                className="mt-6 grid grid-cols-3 gap-2"
              >
                {STACK_INVOCATIONS.map((app) => {
                  const isSelected = app.slug === activeItem.slug;
                  return (
                    <button
                      key={app.slug}
                      type="button"
                      role="tab"
                      aria-label={app.name}
                      aria-selected={isSelected}
                      onClick={() => setSelectedSlug(app.slug)}
                      className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[border-color,background-color,color] duration-150 ${
                        isSelected
                          ? "border-(--l-fg)/40 bg-(--l-surface-2) text-(--l-fg)"
                          : "border-(--l-border) bg-(--l-surface) text-(--l-fg-2) hover:border-(--l-fg-4) hover:text-(--l-fg)"
                      }`}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        <ToolkitPresetIcon slug={app.slug} className="size-4" />
                      </span>
                      <span className="truncate text-xs font-medium">
                        {app.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <Link
                  href="/settings/connections"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  <span>Explore app connections and custom MCP</span>
                  <ArrowRight className="size-3.5" strokeWidth={1.5} />
                </Link>
              </div>
            </div>

            {/* Right column: single quiet trace inspector */}
            <div className="min-w-0 lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-panel)">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeItem.slug}
                    initial={{ opacity: 0, transform: "translateY(4px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0, transform: "translateY(-4px)" }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                    className="space-y-4 p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) pb-4">
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-lg border border-(--l-panel-border) bg-(--l-surface)">
                          <ToolkitPresetIcon
                            slug={activeItem.slug}
                            className="size-4"
                          />
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-(--l-panel-fg)">
                            {activeItem.name}
                          </div>
                          <div className="text-xs text-(--l-panel-fg-3)">
                            {activeItem.role}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-(--l-panel-fg-3)">
                        {activeItem.duration}
                      </span>
                    </div>

                    <div className="rounded-xl border border-(--l-panel-border) bg-(--l-panel-surface) px-4 py-3 text-sm leading-relaxed text-(--l-panel-fg)">
                      “{activeItem.prompt}”
                    </div>

                    <div className="flex flex-col gap-1 rounded-lg bg-(--l-code-bg) px-3.5 py-2.5 font-mono text-xs text-(--l-panel-fg-2) sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Terminal
                          className="size-3.5 shrink-0 text-(--l-accent)"
                          strokeWidth={1.5}
                        />
                        <span className="truncate">
                          {activeItem.invocation}
                        </span>
                      </span>
                      <span className="shrink-0 pl-5 text-[11px] text-(--l-panel-fg-3) sm:pl-0">
                        {activeItem.target}
                      </span>
                    </div>

                    <p className="text-sm leading-relaxed text-(--l-panel-fg-2)">
                      {activeItem.resultSummary}
                    </p>

                    <div className="flex items-center gap-2 border-t border-(--l-panel-border) pt-3.5 font-mono text-xs text-(--l-panel-fg)">
                      <CheckCircle2
                        className="size-3.5 shrink-0 text-emerald-500"
                        strokeWidth={1.5}
                      />
                      <span>{activeItem.artifactLine}</span>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
