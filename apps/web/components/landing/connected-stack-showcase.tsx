"use client";

import { ArrowRight, CheckCircle2, Layers, Terminal } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ToolkitPresetIcon } from "@/components/toolkit-icons";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type StackInvocation = {
  readonly slug: string;
  readonly name: string;
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
    slug: "gmail",
    name: "Gmail",
    role: "Triage bug reports & mail threads",
    prompt:
      "Read the three customer bug emails from this morning, reproduce the webhook retry timeout in our test suite, and draft replies with the PR link",
    invocation: "gmail.search_threads -> bash.run -> gmail.create_draft",
    target: "3 threads · webhook-retry.test.ts",
    duration: "1.4s",
    resultSummary:
      "Reproduced the 504 timeout on signature replay, added idempotency guard, and saved three customer reply drafts for review",
    artifactLine: "PR #142 opened · 3 drafts ready in Gmail",
  },
  {
    slug: "linear",
    name: "Linear",
    role: "Turn issues into verified PRs",
    prompt:
      "Pick up ENG-418, implement team wave contract locks, verify tests pass, and move the ticket to In Review with the diff summary",
    invocation: "linear.get_issue -> file.edit -> linear.update_issue",
    target: "ENG-418 · team-board.ts",
    duration: "1.1s",
    resultSummary:
      "Loaded acceptance criteria from ENG-418, wired contract validation across two modules, and linked commit 8a3f92c back to Linear",
    artifactLine: "ENG-418 moved to In Review",
  },
  {
    slug: "slack",
    name: "Slack",
    role: "Coordinate deploys & incident updates",
    prompt:
      "Check #eng-alerts for the staging spike, trace the slow query in the workspace sandbox, and post the root-cause patch to #deployments",
    invocation: "slack.read_channel -> bash.run -> slack.post_message",
    target: "#eng-alerts -> #deployments",
    duration: "0.9s",
    resultSummary:
      "Isolated an unindexed chat lookup under concurrent reconnects, added a partial index migration, and posted diff metrics to Slack",
    artifactLine: "Query p95 dropped 410ms -> 18ms",
  },
  {
    slug: "github",
    name: "GitHub",
    role: "Branches, diffs & pull requests",
    prompt:
      "Review open comments on PR #109, apply requested edge-case fixes on the feature branch, and push verified commits",
    invocation: "github.list_review_comments -> file.edit -> github.push",
    target: "origin/feat/durable-streams",
    duration: "1.3s",
    resultSummary:
      "Resolved four review suggestions, verified oxlint and bun test locally in the Linux sandbox, and updated the pull request cleanly",
    artifactLine: "4 review threads resolved · checks green",
  },
  {
    slug: "vercel",
    name: "Vercel",
    role: "Preview builds & production checks",
    prompt:
      "Run a full Next.js production build check inside the workspace, deploy a preview, and verify all routes return HTTP 200",
    invocation: "bash.build -> vercel.deploy -> curl.verify",
    target: "entry-agents-preview.vercel.app",
    duration: "1.8s",
    resultSummary:
      "Compiled production chunks without warnings, published an isolated preview URL, and verified home, guide, pricing, and session routes",
    artifactLine: "Preview deployment READY · 200 OK across routes",
  },
  {
    slug: "notion",
    name: "Notion",
    role: "Sync specs & release notes",
    prompt:
      "Read our Q4 API Authentication spec in Notion, compare endpoints against the app routes, and update the changelog page",
    invocation: "notion.fetch_page -> grep.search -> notion.append_blocks",
    target: "Engineering / Auth Spec",
    duration: "1.2s",
    resultSummary:
      "Cross-checked all six route schemas against the workspace code, flagged one missing header check, and updated the spec table",
    artifactLine: "Spec synced · 1 route mismatch fixed",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    role: "Release windows & schedules",
    prompt:
      "Find an open 30-minute launch window tomorrow for everyone on the release thread and attach the preview checklist",
    invocation: "calendar.freebusy -> calendar.create_event",
    target: "Release Readiness · 14:00 UTC",
    duration: "0.8s",
    resultSummary:
      "Checked team availability across three time zones and scheduled the release walkthrough with links to the verified PR and build report",
    artifactLine: "Calendar hold sent · 4 attendees",
  },
  {
    slug: "figma",
    name: "Figma",
    role: "Inspect spacing & component tokens",
    prompt:
      "Extract spacing, hairline borders, and typography tokens from the Pricing frame and update the React layout on 375px and 1440px",
    invocation: "figma.get_styles -> file.edit -> playwright.check",
    target: "plans-catalog.tsx · 375px / 1440px",
    duration: "1.5s",
    resultSummary:
      "Matched card radii, neutral ramp, and tabular pricing columns from the Figma frame and confirmed zero overflow on mobile viewports",
    artifactLine: "Token diff applied · mobile layout verified",
  },
  {
    slug: "jira",
    name: "Jira",
    role: "Sprint tickets & QA verification",
    prompt:
      "Pull assigned blockers from the active sprint, run regression suites for each fix, and attach verification logs to Jira",
    invocation: "jira.search_issues -> bash.test -> jira.add_comment",
    target: "CORE-204 · CORE-209",
    duration: "1.3s",
    resultSummary:
      "Verified both regression fixes in isolated test runs and attached exact commit SHAs and pass counts directly to the Jira issues",
    artifactLine: "2 blockers verified · 38 tests passing",
  },
];

export function ConnectedStackShowcase() {
  const [selectedSlug, setSelectedSlug] = useState<string>("gmail");
  const activeItem =
    STACK_INVOCATIONS.find((item) => item.slug === selectedSlug) ??
    STACK_INVOCATIONS[0];

  return (
    <section aria-label="Connected stack and pricing economics">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-12 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
            {/* Interactive Connected Stack Invocations */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
              className="min-w-0 rounded-2xl border border-(--l-border) bg-(--l-surface) p-5 sm:p-7 lg:col-span-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                    One workspace connected to your entire stack
                  </h2>
                  <p className="mt-2 max-w-[56ch] text-sm leading-relaxed text-(--l-fg-2)">
                    Pick an app to inspect how Entry reads context, invokes
                    tools in your sandbox, and writes verified changes back
                  </p>
                </div>
                <Link
                  href="/settings/connections"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-(--l-border) bg-(--l-surface-2) px-3 py-1.5 text-xs font-medium text-(--l-fg-2) transition-[border-color,color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                >
                  <span>Explore connections</span>
                  <ArrowRight className="size-3.5" strokeWidth={1.5} />
                </Link>
              </div>

              {/* Clickable App Grid with real brand icons */}
              <div
                role="tablist"
                aria-label="Connected apps"
                className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5"
              >
                {STACK_INVOCATIONS.map((app) => {
                  const isSelected = app.slug === activeItem?.slug;
                  const tabLabel =
                    app.slug === "googlecalendar" ? "Calendar" : app.name;
                  return (
                    <button
                      key={app.slug}
                      type="button"
                      role="tab"
                      aria-label={app.name}
                      aria-selected={isSelected}
                      onClick={() => setSelectedSlug(app.slug)}
                      className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-2 text-left transition-[border-color,background-color,color] duration-150 sm:gap-2 sm:px-2.5 ${
                        isSelected
                          ? "border-(--l-accent) bg-(--l-surface-2) text-(--l-fg)"
                          : "border-(--l-border) bg-(--l-surface) text-(--l-fg-2) hover:border-(--l-fg-4) hover:text-(--l-fg)"
                      }`}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        <ToolkitPresetIcon slug={app.slug} className="size-4" />
                      </span>
                      <span className="truncate text-xs font-medium">
                        {tabLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Animated Live Invocation Inspector */}
              {activeItem && (
                <div className="mt-4 overflow-hidden rounded-xl border border-(--l-border) bg-(--l-code-bg)">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeItem.slug}
                      initial={{ opacity: 0, transform: "translateY(6px)" }}
                      animate={{ opacity: 1, transform: "translateY(0px)" }}
                      exit={{ opacity: 0, transform: "translateY(-4px)" }}
                      transition={{ duration: 0.18, ease: EASE_OUT }}
                      className="space-y-3 p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-border-subtle) pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 items-center justify-center rounded-lg border border-(--l-border) bg-(--l-surface)">
                            <ToolkitPresetIcon
                              slug={activeItem.slug}
                              className="size-4"
                            />
                          </span>
                          <div>
                            <div className="text-sm font-medium text-(--l-panel-fg)">
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

                      <div className="rounded-lg border border-(--l-panel-border) bg-(--l-panel) px-3.5 py-2.5 text-xs leading-relaxed text-(--l-panel-fg)">
                        “{activeItem.prompt}”
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-(--l-panel-fg-2)">
                        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                          <Terminal
                            className="size-3.5 shrink-0 text-(--l-accent)"
                            strokeWidth={1.5}
                          />
                          <span className="truncate">
                            {activeItem.invocation}
                          </span>
                        </span>
                        <span className="shrink-0 text-(--l-panel-fg-3)">
                          {activeItem.target}
                        </span>
                      </div>

                      <p className="text-xs leading-relaxed text-(--l-panel-fg-2)">
                        {activeItem.resultSummary}
                      </p>

                      <div className="flex items-center gap-2 border-t border-(--l-border-subtle) pt-2.5 font-mono text-xs text-(--l-panel-fg)">
                        <CheckCircle2
                          className="size-3.5 shrink-0 text-emerald-500"
                          strokeWidth={1.5}
                        />
                        <span>{activeItem.artifactLine}</span>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </motion.div>

            {/* Prompt Caching & $5 Plan Card */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.38, delay: 0.06, ease: EASE_OUT }}
              className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-5 sm:p-7 lg:col-span-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                    <Layers
                      className="size-4 text-(--l-fg)"
                      strokeWidth={1.5}
                    />
                    <span>Prompt caching</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    99% cache hit rate
                  </span>
                </div>

                <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight">
                  99% cache hit rate across all models
                </h2>
                <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                  Repository context, tool definitions, and multi-turn history
                  stay cached across every model so your credits go much
                  further.
                </p>

                {/* Caching Bar Visual */}
                <div className="mt-5 rounded-xl border border-(--l-border) bg-(--l-surface-2) p-4">
                  <div className="flex items-baseline justify-between font-mono text-xs tabular-nums">
                    <span className="text-(--l-fg-2)">
                      Multi-turn context reuse
                    </span>
                    <span className="font-semibold text-(--l-fg)">
                      99% hit rate
                    </span>
                  </div>
                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-(--l-fg-6)">
                    <div
                      className="h-full rounded-full bg-(--l-fg)"
                      style={{ width: "99%" }}
                    />
                  </div>
                  <p className="mt-2.5 text-xs text-(--l-fg-3)">
                    Start free with $1 credit and zero card required.
                  </p>
                </div>

                {/* $5 Plan Highlight */}
                <div className="mt-4 rounded-xl border border-(--l-border) bg-(--l-surface-2) p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-(--l-fg)">
                        Plus plan
                      </div>
                      <div className="mt-0.5 text-xs text-(--l-fg-3)">
                        $10 AI credit every month for daily builds
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div className="text-base font-semibold text-(--l-fg)">
                        $5/mo
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-(--l-border-subtle) pt-2.5 text-xs text-(--l-fg-2)">
                    Need higher limits or rolling windows? Visit the{" "}
                    <Link
                      href="/pricing"
                      className="font-medium text-(--l-fg) underline underline-offset-4"
                    >
                      pricing page
                    </Link>{" "}
                    to explore bigger plans.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-(--l-border) pt-4">
                <Link
                  href="/pricing"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
                >
                  <span>Compare all plans</span>
                  <ArrowRight className="size-3.5" strokeWidth={1.5} />
                </Link>
                <Link
                  href="/model"
                  className="text-xs font-medium text-(--l-fg-2) underline underline-offset-4 transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Inspect model rates
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
