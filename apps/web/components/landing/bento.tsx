import Link from "next/link";

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 md:py-24">
          <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <h2 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl">
                Built for how engineers actually ship
              </h2>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[54ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Direct single-agent speed when you want a quick fix, invocable{" "}
                <code className="font-mono text-xs">/skills</code> and
                specialist subagents when you need depth, and native workspace
                integrations across your stack.
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
                    Adaptive execution
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    /architect · /explorer · /executor · /reviewer · /design
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Single-agent speed by default, specialist team on demand
                </h3>
                <p className="mt-2.5 max-w-[60ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Routine prompts run straight through without spawning
                  unnecessary subagents. When you invoke a specialist or launch
                  a multi-file feature, subagents coordinate through a shared
                  Team Board with live token and step visibility.
                </p>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { role: "/architect", mode: "System boundaries" },
                  { role: "/explorer", mode: "Fast codebase map" },
                  { role: "/executor", mode: "Scoped edits & tests" },
                  { role: "/reviewer", mode: "Pre-PR verification" },
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

            {/* Supporting Card 1 (5 cols): Invocable Skills */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Invocable Skills Catalog
                  </span>
                  <span className="font-mono text-[11px]">
                    17 built-in + GitHub packs
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Type <code>/unslop</code> or install any GitHub skill pack
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                  Invoke domain skills directly from the composer (
                  <code>/unslop</code>, <code>/frontend-design</code>,{" "}
                  <code>/code-review</code>, <code>/plan-mode</code>) or add
                  community skill repositories in one click.
                </p>
              </div>

              <div className="mt-6 rounded-xl border border-(--l-border) bg-(--l-code-bg) p-3.5 font-mono text-[11px] leading-relaxed text-(--l-panel-fg-2)">
                <div className="text-(--l-panel-fg-3)">
                  # Composer invocation
                </div>
                <div className="mt-1 text-emerald-500">
                  ✓ /unslop loaded SKILL.md + references/tokens.md
                </div>
                <div className="text-(--l-panel-fg)">
                  ✓ /frontend-design audited mobile &amp; desktop layout
                </div>
              </div>
            </article>

            {/* Supporting Card 2 (5 cols): Workspace Integrations */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-5">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Workspace Integrations
                  </span>
                  <span className="font-mono text-[11px]">
                    GitHub · Vercel · Composio
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Connected to Gmail, Slack, Linear, Notion &amp; GitHub
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-(--l-fg-2)">
                  Authorize your workspace apps once in Settings and let Entry
                  triage Linear tickets, read Slack threads, draft Gmail
                  updates, and open verified GitHub pull requests.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 font-mono text-[11px]">
                <span className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1 text-(--l-fg-2)">
                  Gmail &amp; Calendar
                </span>
                <span className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1 text-(--l-fg-2)">
                  Slack &amp; Linear
                </span>
                <span className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-2.5 py-1 text-(--l-fg-2)">
                  Notion &amp; Figma
                </span>
              </div>
            </article>

            {/* Primary Card 2 (7 cols) */}
            <article className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-7">
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-(--l-fg-3)">
                  <span className="font-medium text-(--l-fg-2)">
                    Multi-Provider Prompt Caching &amp; Durable Streams
                  </span>
                  <span className="font-mono text-[11px] tabular-nums">
                    Claude · GPT · Gemini · DeepSeek
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                  Prefix-cached across every frontier model and offline-proof
                </h3>
                <p className="mt-2.5 max-w-[60ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Static instructions stay byte-identical across turns so
                  Anthropic, OpenAI, Gemini, and DeepSeek hit provider KV caches
                  automatically — while server-checkpointed streams survive
                  network drops without losing a single token.
                </p>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-(--l-border) pt-4">
                <div className="flex flex-wrap gap-6 font-mono text-xs tabular-nums">
                  <div>
                    <span className="text-(--l-fg-3)">Prompt cache</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      All frontier providers
                    </span>
                  </div>
                  <div>
                    <span className="text-(--l-fg-3)">Stream recovery</span>{" "}
                    <span className="font-medium text-(--l-fg)">
                      Automatic on reconnect
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
