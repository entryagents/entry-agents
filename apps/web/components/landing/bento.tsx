"use client";

import { CheckCircle2, Layers, Plug, Terminal, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { ToolkitPresetIcon } from "@/components/toolkit-icons";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const CONNECTED_APPS = [
  { slug: "github", name: "GitHub" },
  { slug: "vercel", name: "Vercel" },
  { slug: "gmail", name: "Gmail" },
  { slug: "slack", name: "Slack" },
  { slug: "linear", name: "Linear" },
  { slug: "notion", name: "Notion" },
  { slug: "googlecalendar", name: "Google Calendar" },
  { slug: "figma", name: "Figma" },
  { slug: "jira", name: "Jira" },
] as const;

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 md:py-24">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <h2 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl">
                Built for shipping production software end to end
              </h2>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[54ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Stay inside one workspace from first prompt to verified pull
                request, whether a single agent knocks out a fix or a specialist
                team ships dependency waves together.
              </p>
            </div>
          </div>

          {/* Asymmetric 12-column grid (7 + 5, then 5 + 7) */}
          <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-12">
            {/* Primary Card 1 (7 cols): Live In-Chat Team Wave Mode */}
            <motion.article
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.36, ease: EASE_OUT }}
              className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-7"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                    <Users
                      className="size-4 text-(--l-fg-3)"
                      strokeWidth={1.5}
                    />
                    <span>Live in-chat /team waves</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    Dependency DAG · @role handoffs
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Watch the whole team work right inside your main chat
                </h3>
                <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Invoke <code className="font-mono text-(--l-fg)">/team</code>{" "}
                  or tag specialists with{" "}
                  <code className="font-mono text-(--l-fg)">@architect</code>,{" "}
                  <code className="font-mono text-(--l-fg)">@executor</code>,
                  and <code className="font-mono text-(--l-fg)">@reviewer</code>
                  : Wave 0 locks shared contracts, builders edit disjoint files
                  in parallel, and reviewers verify the real diff inline.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
                {[
                  {
                    role: "Wave 0 · @architect",
                    focus: "Contracts & wave plan",
                  },
                  { role: "Wave 0 · @explorer", focus: "Codebase discovery" },
                  { role: "Wave 1 · @executor", focus: "Disjoint file edits" },
                  { role: "Wave 2 · @reviewer", focus: "Tests & edge cases" },
                ].map((item) => (
                  <div
                    key={item.role}
                    className="rounded-xl border border-(--l-border) bg-(--l-surface-2) px-3 py-3"
                  >
                    <div className="font-mono text-xs font-medium text-(--l-fg)">
                      {item.role}
                    </div>
                    <div className="mt-1 text-xs text-(--l-fg-3)">
                      {item.focus}
                    </div>
                  </div>
                ))}
              </div>
            </motion.article>

            {/* Supporting Card 1 (5 cols): Full 3-pane Workspace */}
            <motion.article
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.36, delay: 0.05, ease: EASE_OUT }}
              className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                    <Terminal
                      className="size-4 text-(--l-fg-3)"
                      strokeWidth={1.5}
                    />
                    <span>Real dev environment</span>
                  </span>
                  <span className="font-mono text-xs">
                    Shell · Editor · Preview
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Terminal, code editor, diffs, and live preview in every room
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-(--l-fg-2)">
                  Open any modified file or diff inline, return cleanly to your
                  exact scroll position in the conversation, or test the running
                  app live in mobile and desktop preview frames.
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-(--l-border) bg-(--l-code-bg) p-4 font-mono text-xs leading-relaxed text-(--l-panel-fg-2)">
                <div className="flex items-center justify-between text-(--l-panel-fg-3)">
                  <span>workspace/main</span>
                  <span>branch ready</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-(--l-panel-fg)">
                  <CheckCircle2
                    className="size-3.5 shrink-0 text-emerald-500"
                    strokeWidth={1.5}
                  />
                  <span>
                    Interactive diffs synced across desktop &amp; phone
                  </span>
                </div>
              </div>
            </motion.article>

            {/* Supporting Card 2 (5 cols): Connected Apps */}
            <motion.article
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.36, delay: 0.08, ease: EASE_OUT }}
              className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                    <Plug
                      className="size-4 text-(--l-fg-3)"
                      strokeWidth={1.5}
                    />
                    <span>Connected apps</span>
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    One-click OAuth
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Bring tickets, docs, and notifications straight into the
                  session
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-(--l-fg-2)">
                  Connect Gmail, Slack, Linear, Notion, and Google Calendar from
                  Settings. Agents act across every connected app alongside your
                  GitHub repositories and Vercel deployments.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                {CONNECTED_APPS.map((app) => (
                  <span
                    key={app.slug}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1.5 font-mono text-xs text-(--l-fg-2)"
                  >
                    <ToolkitPresetIcon slug={app.slug} className="size-3.5" />
                    <span>{app.name}</span>
                  </span>
                ))}
              </div>
            </motion.article>

            {/* Primary Card 2 (7 cols): Free $1, $5 -> $10 Credit, 99% Caching & Durable Execution */}
            <motion.article
              initial={{ opacity: 0, transform: "translateY(12px)" }}
              whileInView={{ opacity: 1, transform: "translateY(0px)" }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.36, delay: 0.12, ease: EASE_OUT }}
              className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-7"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="inline-flex items-center gap-2 font-medium text-(--l-fg-2)">
                    <Layers
                      className="size-4 text-(--l-fg-3)"
                      strokeWidth={1.5}
                    />
                    <span>Generous credit &amp; durable continuity</span>
                  </span>
                  <span className="font-mono text-xs">
                    Claude · GPT · Gemini · DeepSeek
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Start free with $1 execution — or try our $5 plan for $10 of
                  AI credit
                </h3>
                <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Every Free account grants $1 of real execution credit out of
                  the box. Need more room to build? Try the $5 plan and get $10
                  of AI credit — stretched by up to 99% prompt caching across
                  main chat and subagents, with durable checkpoints that survive
                  offline drops.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-(--l-border) pt-4">
                <div className="flex flex-wrap gap-6 font-mono text-xs tabular-nums">
                  <div>
                    <span className="text-(--l-fg-3)">Free plan</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      $1 execution credit
                    </span>
                  </div>
                  <div>
                    <span className="text-(--l-fg-3)">$5 Plus plan</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      $10 AI credit (2x)
                    </span>
                  </div>
                  <div>
                    <span className="text-(--l-fg-3)">Prompt cache</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      Up to 99% reuse
                    </span>
                  </div>
                </div>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded-lg bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]"
                >
                  Start free ($1 credit)
                </Link>
              </div>
            </motion.article>
          </div>
        </div>
      </div>
    </section>
  );
}
