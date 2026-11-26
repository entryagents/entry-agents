import { Layers, Server, ShieldCheck } from "lucide-react";

const CAPABILITIES = [
  {
    icon: Server,
    title: "Isolated Ubuntu VM per session",
    description:
      "Every chat runs inside its own hardware-isolated Linux environment with persistent background servers, real git branches, and instant port previews.",
    detail: "Idle VMs suspend automatically after inactivity",
  },
  {
    icon: ShieldCheck,
    title: "Durable runs that outlive your tab",
    description:
      "Every turn executes on durable server checkpoints. Close your laptop, lose signal, or check in from your phone without dropping progress or diffs.",
    detail: "Reconnect at any point with full history intact",
  },
  {
    icon: Layers,
    title: "Fast solo pass, parallel when needed",
    description:
      "Focused fixes run straight through in a single-agent loop. Larger multi-file changes coordinate specialists with non-overlapping file edits in the same chat.",
    detail: "Switch models or reasoning depth between turns",
  },
] as const;

export function LandingFeatures() {
  return (
    <section aria-label="Core workspace capabilities">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="max-w-xl">
            <h2 className="text-balance text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              Engineered for real repositories
            </h2>
            <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
              No brittle browser sandboxes or lost runs when you close a tab.
              Just a clean Linux machine wired directly to your workflow.
            </p>
          </div>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-border) md:grid-cols-3">
            {CAPABILITIES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex flex-col justify-between bg-(--l-surface) p-6 sm:p-8"
                >
                  <div>
                    <div className="inline-flex size-9 items-center justify-center rounded-lg border border-(--l-border) bg-(--l-surface-2) text-(--l-fg)">
                      <Icon className="size-4" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-5 text-base font-semibold tracking-tight text-(--l-fg)">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-(--l-fg-2)">
                      {item.description}
                    </p>
                  </div>
                  <div className="mt-6 border-t border-(--l-border-subtle) pt-4 text-xs text-(--l-fg-3)">
                    {item.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
