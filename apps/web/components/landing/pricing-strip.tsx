import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "to start",
    credit: "$1 trial credit",
    summary: "Try Entry in a shared cloud workspace with no card required.",
    points: [
      "5 messages per day",
      "Shared 1 vCPU / 4 GiB Linux workspace",
      "Starter models included",
    ],
    featured: false,
  },
  {
    id: "plus",
    name: "Plus",
    price: "$3",
    cadence: "/ month",
    credit: "$6 monthly AI credit (2x)",
    summary:
      "Affordable daily coding with open coding models and steady windows.",
    points: [
      "$1.50 / 5h and $3.50 / 7d usage windows",
      "Shared 1 vCPU / 4 GiB cloud workspace",
      "25 active workspace hours per month",
    ],
    featured: false,
  },
  {
    id: "entry",
    name: "Builder",
    price: "$10",
    cadence: "/ month",
    credit: "$28 monthly AI credit (2.8x)",
    summary:
      "Full frontier model catalog and dedicated sandboxes for daily shipping.",
    points: [
      "$6 / 5h and $14 / 7d usage windows",
      "Dedicated 2 vCPU / 8 GiB VMs (up to 3 concurrent)",
      "50 active workspace hours per month",
    ],
    featured: true,
  },
] as const;

export function LandingPricingStrip() {
  return (
    <section aria-label="Plans and pricing">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
        <div className="border-t border-(--l-border) py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="font-display text-balance text-4xl font-normal leading-[1.04] tracking-[-0.02em] sm:text-5xl">
                Straightforward credits, zero markup
              </h2>
              <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
                Every dollar of credit goes straight toward model usage at
                provider rates. Start free and upgrade when you need dedicated
                compute.
              </p>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <Link
                href="/model"
                className="text-(--l-fg-2) transition-colors duration-150 hover:text-(--l-fg)"
              >
                Live model rates
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 font-medium text-(--l-fg) transition-opacity duration-150 hover:opacity-80"
              >
                <span>Compare plans</span>
                <ArrowRight className="size-3.5" strokeWidth={1.5} />
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`flex flex-col justify-between rounded-2xl border p-6 sm:p-7 ${
                  plan.featured
                    ? "border-(--l-accent)/55 bg-(--l-surface)"
                    : "border-(--l-border) bg-(--l-surface)"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-(--l-fg)">
                      {plan.featured && (
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-(--l-accent)"
                        />
                      )}
                      <span>{plan.name}</span>
                    </h3>
                    <span className="font-mono text-xs tabular-nums text-(--l-fg-3)">
                      {plan.credit}
                    </span>
                  </div>

                  <div className="mt-5 flex items-baseline gap-1.5 tabular-nums">
                    <span className="font-display text-5xl font-normal leading-none tracking-[-0.02em] text-(--l-fg)">
                      {plan.price}
                    </span>
                    <span className="text-xs text-(--l-fg-3)">
                      {plan.cadence}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-relaxed text-(--l-fg-2)">
                    {plan.summary}
                  </p>

                  <ul className="mt-5 space-y-2.5 border-t border-(--l-border-subtle) pt-5">
                    {plan.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-xs leading-relaxed text-(--l-fg-2)"
                      >
                        <Check
                          className={`mt-0.5 size-3.5 shrink-0 ${
                            plan.featured
                              ? "text-(--l-accent)"
                              : "text-(--l-fg-3)"
                          }`}
                          strokeWidth={1.75}
                        />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6">
                  <Link
                    href={
                      plan.id === "free"
                        ? "/login"
                        : `/pricing?subscribe=${plan.id}`
                    }
                    className={`inline-flex h-10 w-full items-center justify-center rounded-xl px-4 text-xs font-medium transition-[opacity,border-color,color,transform] duration-150 active:scale-[0.98] ${
                      plan.featured
                        ? "bg-(--l-btn-bg) text-(--l-btn-fg) hover:opacity-90"
                        : "border border-(--l-border) bg-(--l-surface-2) text-(--l-fg) hover:border-(--l-fg-4)"
                    }`}
                  >
                    {plan.id === "free" ? "Start free" : `Choose ${plan.name}`}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
