"use client";

import { ArrowRight } from "lucide-react";
import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { AppMockup } from "@/components/landing/app-mockup";
import { LandingBento } from "@/components/landing/bento";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

const HERO_SPECS = [
  {
    value: "5 roles",
    label: "Architect · Explorer · Executor · Reviewer · Design",
  },
  { value: "3 transports", label: "HTTP, SSE & sandbox stdio MCP" },
  { value: "AES-256-GCM", label: "Runtime secret vault & log redaction" },
  { value: "Resumable", label: "Durable Workflow SDK step checkpoints" },
] as const;

export function SignedOutHero() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-dvh bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <LandingNav showSignIn />

        <section className="relative overflow-hidden pt-24 pb-12 sm:pt-28 md:pt-36 md:pb-20">
          {/* Studio optical hero visual — masked softly into --l-bg with no hard crop edges */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden opacity-35 dark:opacity-80 sm:h-[620px]"
          >
            <div className="mx-auto relative h-full max-w-[1440px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/entry-hero-optics.jpg"
                alt=""
                fetchPriority="high"
                className="ml-auto h-full w-full object-cover object-right md:w-[78%]"
                style={{
                  maskImage:
                    "radial-gradient(ellipse 90% 85% at 72% 42%, black 25%, transparent 78%), linear-gradient(to bottom, black 55%, transparent 100%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 90% 85% at 72% 42%, black 25%, transparent 78%), linear-gradient(to bottom, black 55%, transparent 100%)",
                }}
              />
            </div>
          </div>

          <div className="mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-10">
            <div className="max-w-[740px]">
              <motion.div
                initial={{ opacity: 0, transform: "translateY(8px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{ duration: 0.35, ease: EASE_OUT_QUINT }}
                className="inline-flex items-center gap-2 rounded-lg border border-(--l-border) bg-(--l-surface)/85 px-3 py-1 text-xs text-(--l-fg-2) backdrop-blur-xs"
              >
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span>Autonomous engineering in isolated cloud workspaces</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, transform: "translateY(10px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  duration: 0.4,
                  delay: 0.04,
                  ease: EASE_OUT_QUINT,
                }}
                className="mt-5 text-balance text-3xl font-semibold leading-[1.06] tracking-tight sm:text-5xl md:text-6xl"
              >
                Ship software with an agent team in its own cloud sandbox
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, transform: "translateY(10px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  duration: 0.4,
                  delay: 0.08,
                  ease: EASE_OUT_QUINT,
                }}
                className="mt-4 max-w-[62ch] text-pretty text-base leading-relaxed text-(--l-fg-2) sm:mt-5 sm:text-lg"
              >
                Delegate architecture, discovery, implementation, and review to
                specialist subagents sharing a live Team Board. Every session
                runs inside a dedicated Linux sandbox with durable workflow
                checkpoints that keep executing even when you close your laptop.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, transform: "translateY(8px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  duration: 0.4,
                  delay: 0.12,
                  ease: EASE_OUT_QUINT,
                }}
                className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8"
              >
                <Link
                  href="/login"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-(--l-btn-bg) px-4 text-sm font-medium text-(--l-btn-fg) transition-opacity duration-150 hover:opacity-90"
                >
                  Start building
                  <ArrowRight className="size-4" strokeWidth={1.5} />
                </Link>
                <a
                  href="#features"
                  className="inline-flex h-10 items-center rounded-lg border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-colors duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                >
                  Explore architecture
                </a>
                <Link
                  href="/model"
                  className="inline-flex h-10 items-center px-2 text-sm text-(--l-fg-3) transition-colors duration-150 hover:text-(--l-fg)"
                >
                  Models &amp; pricing &rarr;
                </Link>
              </motion.div>
            </div>

            {/* Scannable architectural capability strip */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(10px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                duration: 0.45,
                delay: 0.15,
                ease: EASE_OUT_QUINT,
              }}
              className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 lg:grid-cols-4"
            >
              {HERO_SPECS.map((spec) => (
                <div
                  key={spec.value}
                  className="rounded-xl border border-(--l-border) bg-(--l-surface)/85 px-4 py-3 backdrop-blur-xs"
                >
                  <div className="font-mono text-sm font-medium tabular-nums text-(--l-fg)">
                    {spec.value}
                  </div>
                  <div className="mt-0.5 text-xs leading-snug text-(--l-fg-3)">
                    {spec.label}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Interactive 3-pane workspace preview */}
            <motion.div
              initial={{ opacity: 0, transform: "translateY(14px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                duration: 0.5,
                delay: 0.18,
                ease: EASE_OUT_QUINT,
              }}
              className="mt-8 sm:mt-10"
            >
              <Stage>
                <AppMockup />
              </Stage>
            </motion.div>
          </div>
        </section>

        <div id="features">
          <LandingFeatures />
        </div>
        <LandingBento />
        <LandingFaq />
        <LandingFooter />
      </div>
    </MotionConfig>
  );
}
