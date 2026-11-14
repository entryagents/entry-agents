import Link from "next/link";

const items = [
  {
    id: "001",
    title: "Agent Team & Board",
    body: "Main agent delegates to Architect, Explorer, Executor, Reviewer, and Design subagents sharing a real-time Team Board.",
  },
  {
    id: "002",
    title: "Plugin SDK & Vault",
    body: "Typed lifecycle hooks, custom /commands, and AES-256-GCM runtime secrets with automatic output redaction.",
  },
  {
    id: "003",
    title: "Cloud Workspaces",
    body: "Isolated Linux sandboxes per session with filesystem, terminal, MCP bridge, and copy-on-write hibernation.",
  },
  {
    id: "004",
    title: "Workflow SDK",
    body: "Resumable step checkpoints, real-time token metering, diff caching, and background queue draining.",
  },
] as const;

function Mark({ index }: { readonly index: number }) {
  if (index === 0) {
    return (
      <div className="relative h-6 w-8" aria-hidden="true">
        <span className="absolute left-0 top-0 size-2 border border-(--l-fg-4)" />
        <span className="absolute right-0 top-0 size-2 border border-(--l-fg-4)" />
        <span className="absolute bottom-0 left-1/2 size-2 -translate-x-1/2 border border-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="h-px w-3 bg-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="grid grid-cols-2 gap-1" aria-hidden="true">
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
        <span className="size-2 border border-(--l-fg-4)" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      <span className="h-px w-4 bg-(--l-fg-4)" />
      <span className="h-px w-6 bg-(--l-fg-4)" />
      <span className="h-px w-3 bg-(--l-fg-4)" />
    </div>
  );
}

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] border-t border-(--l-border-subtle)">
        <div className="grid gap-6 border-b border-(--l-border) px-6 py-14 pb-10 sm:gap-10 sm:px-10 md:grid-cols-2 md:gap-0 md:py-24 md:pb-14">
          <div>
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-4xl md:text-6xl">
              Infrastructure
              <br />
              that ships.
            </h2>
          </div>
          <div className="md:pl-10">
            <p className="max-w-md text-balance text-base leading-relaxed text-(--l-fg-2)">
              Built on focused primitives: specialist subagent teams, typed
              lifecycle plugins, isolated cloud workspaces, and durable workflow
              execution.
            </p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex min-h-9 items-center rounded-md bg-(--l-fg) px-4 text-sm font-medium text-(--l-bg) transition-opacity duration-150 hover:opacity-85"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="flex h-full flex-col border-b border-(--l-border) px-6 py-8 md:border-b-0 md:border-r md:px-9 md:py-9 md:last:border-r-0"
            >
              <div className="font-mono text-xs tabular-nums text-(--l-fg-4)">
                {item.id}
              </div>
              <div className="mt-8 flex h-12 items-center">
                <Mark index={index} />
              </div>
              <h3 className="mt-6 text-balance text-xl font-semibold tracking-tight sm:text-2xl">
                {item.title}
              </h3>
              <p className="mt-3 text-pretty text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
