import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";

export default function NotFound() {
  return (
    <div className="landing min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg)">
      <LandingNav showSignIn />
      <main className="mx-auto max-w-[1080px] px-4 pb-24 pt-28 sm:px-6 sm:pt-36 md:pt-44">
        <p className="font-mono text-xs tabular-nums text-(--l-fg-3)">404</p>
        <h1 className="mt-3 max-w-2xl text-balance text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Page not found
        </h1>
        <p className="mt-4 max-w-[54ch] text-pretty text-base leading-relaxed text-(--l-fg-2)">
          The route you requested does not match an active page or public
          profile on Entry Agents.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
          >
            <ArrowLeft className="size-4" strokeWidth={1.5} />
            <span>Back to home</span>
          </Link>
          <Link
            href="/guide"
            className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-[border-color,color] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
          >
            Read the builder guide
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
