"use client";

import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppMockup } from "@/components/landing/app-mockup";
import { LandingBento } from "@/components/landing/bento";
import { LandingFaq } from "@/components/landing/faq";
import { LandingFeatures } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingNav } from "@/components/landing/nav";
import { Stage } from "@/components/landing/stage";

const EASE_OUT_QUINT = [0.23, 1, 0.32, 1] as const;

const CAPABILITY_SIGNALS = [
  { label: "Team", value: "5 Specialist Agents" },
  { label: "Extensibility", value: "Plugin Hooks & MCP" },
  { label: "Execution", value: "Durable Checkpoints" },
  { label: "Secrets", value: "AES-256-GCM Vault" },
] as const;

export function SignedOutHero() {
  const heroButtonsRef = useRef<HTMLDivElement>(null);
  const [heroButtonsVisible, setHeroButtonsVisible] = useState(true);

  useEffect(() => {
    const el = heroButtonsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroButtonsVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing relative isolate min-h-screen bg-(--l-bg) text-(--l-fg) selection:bg-(--l-fg)/20">
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden md:block">
          <div className="mx-auto h-full max-w-[1320px] border-x border-x-(--l-border)" />
        </div>

        <div className="relative z-10">
          <LandingNav showSignIn={!heroButtonsVisible} />

          <section className="relative overflow-hidden pb-0 pt-24 md:pb-0 md:pt-36">
            <div className="mx-auto max-w-[1320px] px-6 sm:px-10">
              <div className="max-w-[780px]">
                <motion.div
                  initial={{ opacity: 0, transform: "translateY(8px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.35, ease: EASE_OUT_QUINT }}
                  className="mb-5 inline-flex items-center gap-2.5 border border-(--l-border) bg-(--l-surface) px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-(--l-fg-3)"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-(--l-accent)"
                    aria-hidden="true"
                  />
                  <span>00 // Autonomous Engineering Runtime</span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, transform: "translateY(12px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{
                    duration: 0.45,
                    delay: 0.05,
                    ease: EASE_OUT_QUINT,
                  }}
                  className="text-4xl font-semibold leading-[1.02] tracking-tighter sm:text-6xl md:text-7xl"
                >
                  Entry Agents.
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, transform: "translateY(12px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{
                    duration: 0.45,
                    delay: 0.1,
                    ease: EASE_OUT_QUINT,
                  }}
                  className="mt-4 max-w-[660px] text-balance text-base leading-relaxed text-(--l-fg-2) sm:mt-6 sm:text-xl"
                >
                  Give an autonomous agent team a task and a repository.
                  Architect, explorer, executor, and reviewer collaborate inside
                  an isolated cloud sandbox — running durable workflows that
                  survive disconnects, respect your plugins, and ship clean PRs.
                </motion.p>
              </div>

              <motion.div
                ref={heroButtonsRef}
                initial={{ opacity: 0, transform: "translateY(10px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  duration: 0.45,
                  delay: 0.15,
                  ease: EASE_OUT_QUINT,
                }}
                className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8"
              >
                <Link
                  href="/login"
                  className="inline-flex min-h-10 items-center rounded-md bg-(--l-fg) px-5 text-sm font-medium text-(--l-bg) transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.97]"
                >
                  Start building
                </Link>
                <a
                  href="#architecture"
                  className="inline-flex min-h-10 items-center rounded-md border border-(--l-border) bg-(--l-surface) px-4 font-mono text-xs uppercase tracking-wider text-(--l-fg-2) transition-[border-color,color,transform] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg) active:scale-[0.97]"
                >
                  Inspect Architecture
                </a>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, transform: "translateY(8px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  duration: 0.45,
                  delay: 0.2,
                  ease: EASE_OUT_QUINT,
                }}
                className="mt-10 grid grid-cols-2 gap-px border border-(--l-border) bg-(--l-border) sm:grid-cols-4"
              >
                {CAPABILITY_SIGNALS.map((signal) => (
                  <div key={signal.label} className="bg-(--l-bg) px-4 py-3">
                    <div className="font-mono text-[10px] uppercase tracking-widest text-(--l-fg-4)">
                      {signal.label}
                    </div>
                    <div className="mt-1 text-xs font-medium text-(--l-fg-2) sm:text-sm">
                      {signal.value}
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, transform: "translateY(16px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                duration: 0.55,
                delay: 0.24,
                ease: EASE_OUT_QUINT,
              }}
              className="mx-auto mt-10 max-w-[1320px] overflow-hidden px-4 sm:px-6 md:mt-16 md:px-0"
            >
              <Stage tone="slate">
                <div className="mx-auto w-full max-w-[1160px]">
                  <AppMockup />
                </div>
              </Stage>
            </motion.div>
          </section>

          <div id="architecture">
            <LandingFeatures />
          </div>
          <LandingBento />
          <LandingFaq />
          <LandingFooter />
        </div>
      </div>
    </MotionConfig>
  );
}
