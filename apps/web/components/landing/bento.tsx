import Link from "next/link";

type BentoItem = {
  readonly slug: string;
  readonly tag: string;
  readonly title: string;
  readonly body: string;
};

const items: readonly BentoItem[] = [
  {
    slug: "coordination",
    tag: "Coordination",
    title: "Multi-agent teams",
    body: "Divide engineering tasks across parallel specialized subagents: Architect for planning, Executor for implementation, Verifier for test passes.",
  },
  {
    slug: "worktree",
    tag: "Sandboxes",
    title: "Isolated git worktrees",
    body: "A dedicated cloud workspace for every session with filesystem, outbound network, and containerized runtime access. No local machine risk.",
  },
  {
    slug: "durable",
    tag: "Orchestration",
    title: "Durable workflows",
    body: "Agent execution loops run as resilient, state-persisted workflows that survive restarts, network disconnects, and long-running batch jobs.",
  },
  {
    slug: "verification",
    tag: "Integrity",
    title: "Automated verification",
    body: "Every code change runs automated typechecks, lint passes, and test suites. Review unified git diffs before merging into your repository.",
  },
];

function BentoIcon({ slug }: { readonly slug: string }) {
  if (slug === "coordination") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5 text-(--l-accent)" aria-hidden="true">
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="12" cy="18" r="3" />
        <path d="M8.5 7.5L10 16M15.5 7.5L14 16M9 6h6" strokeLinecap="round" />
      </svg>
    );
  }
  if (slug === "worktree") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5 text-(--l-accent)" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="8" y="14" width="8" height="7" rx="1.5" />
        <path d="M6.5 10v2a2 2 0 002 2h7a2 2 0 002-2v-2" strokeLinecap="round" />
      </svg>
    );
  }
  if (slug === "durable") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5 text-(--l-accent)" aria-hidden="true">
        <path d="M21 12a9 9 0 11-3-6.7L21 8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5 text-(--l-accent)" aria-hidden="true">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LandingBento() {
  return (
    <section>
      <div className="mx-auto max-w-[1320px] border-t border-(--l-border-subtle)">
        <div className="grid gap-6 border-b border-(--l-border) px-6 py-14 pb-10 sm:gap-10 sm:px-10 md:grid-cols-2 md:gap-0 md:pb-14 md:py-24">
          <div>
            <h2 className="text-balance text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-4xl md:text-5xl">
              Engineered for
              <br />
              software delivery.
            </h2>
          </div>
          <div className="md:pl-10">
            <p className="max-w-md text-balance text-base leading-relaxed text-(--l-fg-2)">
              Built for real production codebases: coordinated agent teams, private cloud worktrees, and resilient background execution.
            </p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex min-h-9 items-center rounded-md bg-(--l-fg) px-4 text-sm font-medium text-(--l-bg) transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--l-fg) active:scale-[0.98]"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => (
            <article
              key={item.slug}
              className={`flex h-full flex-col border-b border-(--l-border) px-6 py-8 md:px-8 md:py-9 ${
                index % 2 === 1 ? "md:border-l md:border-l-(--l-border)" : ""
              } ${index >= 2 ? "md:border-b-0" : ""} ${
                index > 0
                  ? "lg:border-l lg:border-l-(--l-border)"
                  : "lg:border-l-0"
              } lg:border-b-0`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-(--l-fg-3)">
                  {item.tag}
                </span>
                <BentoIcon slug={item.slug} />
              </div>
              <h3 className="mt-6 text-balance text-xl font-semibold tracking-tighter">
                {item.title}
              </h3>
              <p className="mt-3 flex-1 text-pretty text-sm leading-relaxed text-(--l-fg-2)">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
