"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ToolkitPresetIcon } from "@/components/toolkit-icons";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

type StackInvocation = {
  readonly slug: string;
  readonly name: string;
  readonly label: string;
  readonly role: string;
  readonly prompt: string;
  readonly steps: readonly {
    readonly command: string;
    readonly target: string;
  }[];
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
    steps: [
      { command: "github.list_review_comments", target: "PR #109 · 4 threads" },
      { command: "workspace.edit && bun test", target: "14 tests passing" },
      { command: "github.push", target: "origin/feat/durable-streams" },
    ],
    duration: "1.3s",
    resultSummary:
      "Applied every requested edge-case fix, ran checks locally in the Ubuntu VM, and pushed clean commits to the pull request.",
    artifactLine: "4 review threads resolved · checks green",
  },
  {
    slug: "vercel",
    name: "Vercel",
    label: "Vercel",
    role: "Preview builds and production checks",
    prompt:
      "Run a full Next.js build check inside the workspace, publish a preview deployment, and confirm core routes return HTTP 200",
    steps: [
      { command: "workspace.build", target: "next build · 0 errors" },
      { command: "vercel.deploy_preview", target: "preview.entryagents.app" },
      { command: "http.verify_routes", target: "200 OK across 4 routes" },
    ],
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
    steps: [
      { command: "linear.get_issue", target: "ENG-418" },
      { command: "workspace.edit", target: "team-board.ts + test" },
      { command: "linear.update_issue", target: "Status -> In Review" },
    ],
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
    steps: [
      { command: "slack.read_channel", target: "#eng-alerts" },
      { command: "workspace.migrate", target: "add composite index" },
      { command: "slack.post_message", target: "#deployments" },
    ],
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
    steps: [
      { command: "gmail.search_threads", target: "3 customer reports" },
      { command: "bun test webhook-retry", target: "reproduced & fixed" },
      { command: "gmail.create_draft", target: "3 reply drafts saved" },
    ],
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
    steps: [
      { command: "notion.fetch_page", target: "Engineering / Auth Spec" },
      { command: "workspace.diff_schemas", target: "1 header mismatch fixed" },
      { command: "notion.append_blocks", target: "Changelog table synced" },
    ],
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
    steps: [
      { command: "figma.get_styles", target: "Pricing frame tokens" },
      { command: "workspace.edit", target: "plans-catalog.tsx" },
      { command: "browser.verify", target: "375px & 1440px · 0 overflow" },
    ],
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
    steps: [
      { command: "jira.search_issues", target: "CORE-204 · CORE-209" },
      { command: "workspace.test", target: "38 regression tests green" },
      { command: "jira.add_comment", target: "Commit SHA + logs attached" },
    ],
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
    steps: [
      { command: "calendar.freebusy", target: "4 engineers · 3 time zones" },
      { command: "calendar.create_event", target: "Release Readiness · 14:00" },
      { command: "calendar.attach_links", target: "PR + preview checklist" },
    ],
    duration: "0.8s",
    resultSummary:
      "Checked availability across three time zones and booked the walkthrough with links to the verified PR and preview build.",
    artifactLine: "Calendar hold sent · 4 attendees",
  },
];

const CYCLE_MS = 4800;

export function ConnectedStackShowcase() {
  const prefersReduced = useReducedMotion() ?? false;
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { amount: 0.3 });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (prefersReduced || !inView || paused) return;
    const id = window.setInterval(() => {
      setSelectedIndex((prev) => (prev + 1) % STACK_INVOCATIONS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
  }, [inView, paused, prefersReduced]);

  useEffect(() => {
    if (prefersReduced) {
      setActiveStepIndex(2);
      return;
    }
    setActiveStepIndex(0);
    const t1 = window.setTimeout(() => setActiveStepIndex(1), 1200);
    const t2 = window.setTimeout(() => setActiveStepIndex(2), 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [prefersReduced, selectedIndex]);

  const activeItem = STACK_INVOCATIONS[selectedIndex] ?? STACK_INVOCATIONS[0];

  return (
    <section
      ref={sectionRef}
      aria-label="Connected tools and integrations"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left column: headline + clean 3x3 real brand icon selector */}
            <div className="min-w-0 lg:col-span-5">
              <h2 className="font-display text-balance text-3xl font-semibold leading-[1.06] tracking-[-0.03em] sm:text-4xl">
                Connected where the work starts
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Read tickets, inspect threads, edit code in your Ubuntu VM, and
                write verified updates back without switching windows.
              </p>

              <div
                role="tablist"
                aria-label="Connected apps"
                className="mt-6 grid grid-cols-3 gap-2"
              >
                {STACK_INVOCATIONS.map((app, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={app.slug}
                      type="button"
                      role="tab"
                      aria-label={app.name}
                      aria-selected={isSelected}
                      onClick={() => {
                        setPaused(true);
                        setSelectedIndex(index);
                      }}
                      className={`flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 text-left transition-[border-color,background-color,color] duration-150 ${
                        isSelected
                          ? "border-(--l-fg)/45 bg-(--l-surface-2) text-(--l-fg)"
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

            {/* Right column: live auto-cycling vertical execution trace */}
            <div className="min-w-0 lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-panel)">
                {/* Hairline auto-advance progress bar */}
                <div className="h-[1.5px] w-full bg-(--l-panel-border)">
                  {!prefersReduced && inView && !paused ? (
                    <motion.div
                      key={activeItem.slug}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: CYCLE_MS / 1000, ease: "linear" }}
                      style={{ transformOrigin: "left" }}
                      className="h-full bg-(--l-accent)"
                    />
                  ) : null}
                </div>

                <AnimatePresence mode="wait" initial={false}>
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

                    <div className="divide-y divide-(--l-panel-border) overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-code-bg) font-mono text-xs">
                      {activeItem.steps.map((step, stepIndex) => {
                        const isActiveStep = stepIndex === activeStepIndex;
                        const isDoneStep = stepIndex < activeStepIndex;
                        return (
                          <motion.div
                            key={step.command}
                            initial={
                              prefersReduced
                                ? false
                                : { opacity: 0, transform: "translateX(-4px)" }
                            }
                            animate={{
                              opacity: 1,
                              transform: "translateX(0px)",
                            }}
                            transition={{
                              duration: 0.18,
                              delay: stepIndex * 0.06,
                              ease: EASE_OUT,
                            }}
                            className={`flex flex-col gap-0.5 px-3.5 py-2.5 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                              isActiveStep ? "bg-(--l-panel-surface)" : ""
                            }`}
                          >
                            <span className="inline-flex items-center gap-2.5 text-(--l-panel-fg)">
                              <span
                                className={`size-1.5 shrink-0 rounded-full transition-colors duration-200 ${
                                  isDoneStep
                                    ? "bg-emerald-500"
                                    : isActiveStep
                                      ? "bg-(--l-accent)"
                                      : "bg-(--l-panel-fg-4)"
                                }`}
                              />
                              <span
                                className={
                                  isActiveStep || isDoneStep
                                    ? "text-(--l-panel-fg)"
                                    : "text-(--l-panel-fg-3)"
                                }
                              >
                                {step.command}
                              </span>
                            </span>
                            <span className="pl-4 text-[11px] text-(--l-panel-fg-3) sm:pl-0">
                              {step.target}
                            </span>
                          </motion.div>
                        );
                      })}
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
