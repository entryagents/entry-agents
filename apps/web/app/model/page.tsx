import type { Metadata } from "next";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { fetchAllLanguageModelsWithContext } from "@/lib/models-with-context";
import { PricingTable } from "./pricing-table";

export const metadata: Metadata = {
  title: "Model",
  description:
    "Price and context window for every model available in Entry — pay-as-you-go, per token, no markup.",
  alternates: {
    canonical: "/model",
  },
  openGraph: {
    url: "/model",
    title: "AI coding agent model pricing and context windows",
  },
  twitter: {
    title: "AI coding agent model pricing and context windows",
  },
};

export const dynamic = "force-dynamic";

export default async function ModelPage() {
  const models = await fetchAllLanguageModelsWithContext();

  return (
    <div className="landing relative isolate min-h-dvh bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
      <div className="relative z-10">
        <LandingNav showSignIn />

        <section className="pt-28 pb-16 sm:pt-36 md:pt-40 md:pb-24">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <div className="max-w-[740px]">
              <h1 className="text-3xl font-semibold leading-[1.06] tracking-tight sm:text-5xl md:text-6xl">
                Models &amp; token pricing
              </h1>
              <p className="mt-4 text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-lg">
                Pay-as-you-go, per token. No markup, no subscription required to
                start. Free models cost nothing to run. Every model the platform
                can route is listed — see{" "}
                {/* oxlint-disable-next-line nextjs/no-html-link-for-pages */}
                <a
                  href="/pricing"
                  className="underline decoration-(--l-fg-3) underline-offset-4 transition-colors hover:text-(--l-fg)"
                >
                  plans
                </a>{" "}
                for monthly credit bundles.
              </p>
            </div>

            <div className="mt-10 md:mt-12">
              <PricingTable models={models} />
            </div>
          </div>
        </section>
      </div>

      <LandingFooter />
    </div>
  );
}
