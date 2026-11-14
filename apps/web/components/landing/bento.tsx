import Link from "next/link";

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 md:py-24">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <h2 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl">
                Infrastructure built for real engineering teams
              </h2>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[54ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Built on four composable primitives: multi-agent team
                orchestration, typed lifecycle plugins, zero-knowledge secret
                injection, and prefix-cached durable workflows.
              </p>
            </div>
          </div>

          {/* Asymmetric 12-column architectural grid (7 + 5, then 5 + 7) */}
          <div className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-12">
            {/* Primary Card 1 (7 cols) */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-7">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Multi-agent orchestration
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    team_board · spawn_agent
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Specialist roles sharing a structured Team Board
                </h3>
                <p className="mt-2.5 max-w-[60ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Instead of one overloaded context window, Entry delegates
                  planning, codebase discovery, implementation, and security
                  review to dedicated subagents that post decisions and
                  checklists to a shared board.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { role: "Architect", mode: "Plan & boundaries" },
                  { role: "Explorer", mode: "Fast AST & grep" },
                  { role: "Executor", mode: "Edit & test" },
                  { role: "Reviewer", mode: "Diff & security audit" },
                ].map((item) => (
                  <div
                    key={item.role}
                    className="rounded-xl border border-(--l-border) bg-(--l-surface-2) px-3 py-2.5"
                  >
                    <div className="font-mono text-xs font-medium text-(--l-fg)">
                      {item.role}
                    </div>
                    <div className="mt-0.5 text-[11px] text-(--l-fg-3)">
                      {item.mode}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            {/* Supporting Card 1 (5 cols) */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Plugin SDK &amp; Vault
                  </span>
                  <span className="font-mono text-[11px]">AES-256-GCM</span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Lifecycle hooks and zero-knowledge secrets
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                  Configure built-in or custom plugins that hook into{" "}
                  <code>context.system</code>, <code>tool.execute.before</code>,
                  and <code>tool.execute.after</code> while scrubbing API keys
                  from transcripts.
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-(--l-border) bg-(--l-code-bg) p-3.5 font-mono text-[11px] leading-relaxed text-(--l-panel-fg-2)">
                <div className="text-(--l-panel-fg-3)">
                  # Runtime secret injection &amp; redaction
                </div>
                <div className="mt-1 text-emerald-500">
                  ✓ STRIPE_SECRET_KEY injected into sandbox env
                </div>
                <div className="text-(--l-panel-fg)">
                  ✓ tool.execute.after scrubbed 2 token matches
                </div>
              </div>
            </article>

            {/* Supporting Card 2 (5 cols) */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Cloud Workspaces &amp; MCP
                  </span>
                  <span className="font-mono text-[11px]">
                    http · sse · stdio
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Full Linux sandboxes with universal MCP
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                  Connect remote HTTP/SSE MCP servers or spawn `npx`, `uvx`, and
                  binary stdio MCP servers directly inside the session container
                  with automatic tool discovery.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px]">
                <span className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1 text-(--l-fg-2)">
                  Copy-on-write hibernate
                </span>
                <span className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1 text-(--l-fg-2)">
                  Live port preview
                </span>
                <span className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1 text-(--l-fg-2)">
                  Scoped GitHub App tokens
                </span>
              </div>
            </article>

            {/* Primary Card 2 (7 cols) */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-7">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Workflow SDK &amp; Prompt Caching
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    stablePrefix + dynamicTail
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Prefix-cached turns and instant stream reconnection
                </h3>
                <p className="mt-2.5 max-w-[60ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Static instructions and deterministically sorted tools stay
                  byte-identical across turns so DeepSeek V3.2, Claude 4.6, and
                  GPT-5 hit the provider KV cache — while mid-turn tool
                  checkpoints let any browser tab resume live.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-(--l-border) pt-4">
                <div className="flex flex-wrap gap-6 font-mono text-xs tabular-nums">
                  <div>
                    <span className="text-(--l-fg-3)">KV prefix</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      deterministic
                    </span>
                  </div>
                  <div>
                    <span className="text-(--l-fg-3)">Compaction</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      observation pruning
                    </span>
                  </div>
                </div>
                <Link
                  href="/login"
                  className="inline-flex h-9 items-center rounded-lg bg-(--l-btn-bg) px-4 text-xs font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
                >
                  Start a session
                </Link>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
