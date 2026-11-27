"use client";

import { ArrowRight } from "lucide-react";
import {
  motion,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { AppMockup } from "@/components/landing/app-mockup";
import { CloudSkyBackdrop } from "@/components/landing/cloud-sky-backdrop";
import { ConnectedStackShowcase } from "@/components/landing/connected-stack-showcase";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";

export function SignedOutHero() {
  const prefersReduced = useReducedMotion() ?? false;
  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress: pageProgress } = useScroll();
  const smoothPageProgress = useSpring(pageProgress, {
    stiffness: 180,
    damping: 32,
    restDelta: 0.001,
  });

  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const smoothHeroProgress = useSpring(heroProgress, {
    stiffness: 140,
    damping: 26,
    mass: 0.4,
  });

  // Subtle multi-plane desktop depth: copy glides gently while the workspace
  // rises cleanly out of a crisp perspective angle on scroll.
  const copyY = useTransform(smoothHeroProgress, [0, 0.6], [0, -26]);
  const workspaceScale = useTransform(
    smoothHeroProgress,
    [0, 0.35],
    [0.985, 1],
  );
  const workspaceY = useTransform(smoothHeroProgress, [0, 0.55], [0, -20]);
  const workspaceRotateX = useTransform(
    smoothHeroProgress,
    [0, 0.32],
    [2.5, 0],
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative min-h-dvh overflow-x-clip bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/15">
        {/* Crisp top scroll-progress hairline */}
        {!prefersReduced && (
          <motion.div
            aria-hidden="true"
            style={{ scaleX: smoothPageProgress, transformOrigin: "left" }}
            className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] bg-(--l-accent)/80"
          />
        )}

        <LandingNav showSignIn />

        <main>
          {/* Hero Stage: Living Moving Cloud Horizon + Left-Aligned H1 + Scroll-Reactive Live Workspace */}
          <section
            ref={heroRef}
            className="relative overflow-hidden pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-32"
          >
            <CloudSkyBackdrop variant="hero" />

            <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <motion.div
                style={prefersReduced ? undefined : { y: copyY }}
                className="max-w-2xl"
              >
                <h1 className="font-display text-balance text-4xl font-semibold leading-[1.03] tracking-[-0.035em] text-(--l-fg) sm:text-5xl lg:text-[3.75rem]">
                  Cloud coding agents that finish the work
                </h1>

                <p className="mt-4 max-w-[52ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-[17px]">
                  An isolated Ubuntu VM per session, durable background runs
                  that outlive your tab, and direct GitHub and Vercel delivery —
                  starting at $3/mo.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-7">
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                  >
                    <span>Start building</span>
                    <ArrowRight className="size-4" strokeWidth={1.5} />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex h-10 items-center rounded-xl border border-(--l-border) bg-(--l-surface)/85 px-5 text-sm font-medium text-(--l-fg) backdrop-blur-sm transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface) active:scale-[0.98]"
                  >
                    View pricing
                  </Link>
                </div>
              </motion.div>

              {/* Interactive 3-pane Entry workspace rising cleanly out of perspective */}
              <div style={{ perspective: 1400 }} className="mt-10 sm:mt-14">
                <motion.div
                  style={
                    prefersReduced
                      ? undefined
                      : {
                          scale: workspaceScale,
                          y: workspaceY,
                          rotateX: workspaceRotateX,
                          transformOrigin: "center top",
                        }
                  }
                  className="min-w-0 will-change-transform"
                >
                  <AppMockup />
                </motion.div>
              </div>
            </div>
          </section>

          <LandingFeatures />
          <ConnectedStackShowcase />
          <LandingFaq />

          {/* Moving Cloud Horizon Closing CTA */}
          <section aria-label="Get started" className="pb-16 sm:pb-24">
            <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-10">
              <div className="relative overflow-hidden rounded-2xl border border-(--l-border) bg-(--l-surface)">
                <CloudSkyBackdrop variant="closing" />

                <div className="relative flex flex-col items-start justify-between gap-6 px-6 py-12 sm:px-10 sm:py-16 lg:flex-row lg:items-end">
                  <div className="max-w-xl">
                    <h2 className="font-display text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.035em] text-(--l-fg) sm:text-4xl">
                      Leave the next branch with Entry
                    </h2>
                    <p className="mt-3 text-pretty text-base leading-relaxed text-(--l-fg-2)">
                      Start free with $1 in trial credits and an isolated Ubuntu
                      workspace in seconds.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/login"
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-(--l-btn-bg) px-5 text-sm font-medium text-(--l-btn-fg) shadow-xs transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
                    >
                      <span>Start building</span>
                      <ArrowRight className="size-4" strokeWidth={1.5} />
                    </Link>
                    <Link
                      href="/guide"
                      className="inline-flex h-10 shrink-0 items-center rounded-xl border border-(--l-border) bg-(--l-surface)/85 px-5 text-sm font-medium text-(--l-fg) backdrop-blur-sm transition-[border-color,background-color,transform] duration-150 hover:border-(--l-fg-4) hover:bg-(--l-surface) active:scale-[0.98]"
                    >
                      Read the guide
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
