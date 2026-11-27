import { Check, GitBranch, Layers, Server, ShieldCheck } from "lucide-react";

const VM_SPECS = [
  { label: "OS", value: "Ubuntu 24.04 LTS" },
  { label: "Init", value: "systemd PID 1" },
  { label: "Compute", value: "2 vCPU · 8 GiB" },
  { label: "Preview", value: "HTTPS port proxy" },
] as const;

const CHECKPOINT_STEPS = [
  { step: "Step 14", label: "Checkpoint persisted to server", active: false },
  { step: "Offline", label: "Laptop closed on train", active: false },
  { step: "Steps 15–22", label: "Tests verified and PR opened", active: true },
  { step: "Resume", label: "Diffs reconciled on reconnect", active: false },
] as const;

export function LandingFeatures() {
  return (
    <section aria-label="Core workspace capabilities">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="max-w-xl">
            <h2 className="font-display text-balance text-3xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-4xl">
              Built for branches that actually ship
            </h2>
            <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
              No brittle browser containers or aborted turns when your laptop
              sleeps. A real Linux machine wired directly into your delivery
              loop.
            </p>
          </div>

          {/* Asymmetric 12-column architectural bento */}
          <div className="mt-10 grid gap-4 lg:grid-cols-12">
            {/* Flagship Left Panel: Isolated Ubuntu VMs */}
            <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6 sm:p-8 lg:col-span-7">
              <div>
                <div className="inline-flex size-9 items-center justify-center rounded-lg border border-(--l-border) bg-(--l-surface-2) text-(--l-fg)">
                  <Server className="size-4" strokeWidth={1.5} />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-(--l-fg)">
                  Isolated Ubuntu VM per session
                </h3>
                <p className="mt-2 max-w-[54ch] text-sm leading-relaxed text-(--l-fg-2)">
                  Every chat provisions a hardware-isolated Linux environment
                  with persistent background dev servers, real git branches, and
                  live HTTPS port previews. Idle machines suspend automatically
                  when you step away.
                </p>
              </div>

              {/* Grounded VM telemetry artifact */}
              <div className="mt-6 overflow-hidden rounded-xl border border-(--l-panel-border) bg-(--l-code-bg)">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-panel-border) px-4 py-2.5 font-mono text-[11px] text-(--l-panel-fg-3)">
                  <span className="inline-flex items-center gap-2 text-(--l-panel-fg)">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    <span>boxd · vm-entry-9a4f</span>
                  </span>
                  <span className="tabular-nums">isolated · east-west off</span>
                </div>

                <div className="space-y-1.5 px-4 py-3.5 font-mono text-[11.5px] leading-relaxed">
                  <div className="text-(--l-panel-fg-3)">
                    $ pnpm dev --port 3000 &amp;
                  </div>
                  <div className="text-(--l-panel-fg)">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓
                    </span>{" "}
                    Ready in 1.4s · persisted across turns under systemd
                  </div>
                  <div className="truncate text-(--l-panel-fg-2)">
                    <span className="text-(--l-accent)">→</span>{" "}
                    https://p3000.entry-vm.boxd.sh
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-px border-t border-(--l-panel-border) bg-(--l-panel-border) sm:grid-cols-4">
                  {VM_SPECS.map((spec) => (
                    <div
                      key={spec.label}
                      className="bg-(--l-panel) px-3.5 py-2.5"
                    >
                      <div className="text-[10.5px] text-(--l-panel-fg-3)">
                        {spec.label}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] font-medium tabular-nums text-(--l-panel-fg)">
                        {spec.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Stacked Pair */}
            <div className="grid min-w-0 gap-4 lg:col-span-5">
              {/* Top: Durable Checkpoints */}
              <div className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6">
                <div>
                  <div className="inline-flex size-9 items-center justify-center rounded-lg border border-(--l-border) bg-(--l-surface-2) text-(--l-fg)">
                    <ShieldCheck className="size-4" strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight text-(--l-fg)">
                    Durable runs that outlive your tab
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-(--l-fg-2)">
                    Turns execute on server-side checkpoints. Close your laptop
                    or check back from your phone with every file diff intact.
                  </p>
                </div>

                <div className="mt-5 space-y-2 border-t border-(--l-border-subtle) pt-4">
                  {CHECKPOINT_STEPS.map((item) => (
                    <div
                      key={item.step}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${
                            item.active ? "bg-(--l-accent)" : "bg-(--l-fg-4)"
                          }`}
                        />
                        <span
                          className={`truncate ${
                            item.active
                              ? "font-medium text-(--l-fg)"
                              : "text-(--l-fg-2)"
                          }`}
                        >
                          {item.label}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-(--l-fg-3)">
                        {item.step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom: Solo or Parallel Team */}
              <div className="flex flex-col justify-between rounded-2xl border border-(--l-border) bg-(--l-surface) p-6">
                <div>
                  <div className="inline-flex size-9 items-center justify-center rounded-lg border border-(--l-border) bg-(--l-surface-2) text-(--l-fg)">
                    <Layers className="size-4" strokeWidth={1.5} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold tracking-tight text-(--l-fg)">
                    Fast solo pass, parallel when needed
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-(--l-fg-2)">
                    Routine edits finish in a single direct loop. Broad builds
                    split disjoint files across parallel builders in one thread.
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-(--l-border-subtle) pt-4 text-[11px]">
                  <div className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-3 py-2">
                    <div className="inline-flex items-center gap-1.5 font-medium text-(--l-fg)">
                      <Check
                        className="size-3 text-(--l-accent)"
                        strokeWidth={1.75}
                      />
                      <span>Direct loop</span>
                    </div>
                    <div className="mt-0.5 text-(--l-fg-3)">
                      Single focused fix
                    </div>
                  </div>
                  <div className="rounded-lg border border-(--l-border) bg-(--l-surface-2) px-3 py-2">
                    <div className="inline-flex items-center gap-1.5 font-medium text-(--l-fg)">
                      <GitBranch
                        className="size-3 text-(--l-accent)"
                        strokeWidth={1.75}
                      />
                      <span>Team waves</span>
                    </div>
                    <div className="mt-0.5 text-(--l-fg-3)">
                      Disjoint file builds
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
