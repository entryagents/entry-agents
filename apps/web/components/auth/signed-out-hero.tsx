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
              <div className="max-w-[720px]">
                <motion.h1
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.4, ease: EASE_OUT_QUINT }}
                  className="text-4xl font-semibold leading-[1.03] tracking-tighter sm:text-6xl md:text-7xl"
                >
                  Entry Agents.
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, transform: "translateY(10px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{
                    duration: 0.4,
                    delay: 0.05,
                    ease: EASE_OUT_QUINT,
                  }}
                  className="mt-4 max-w-[600px] text-balance text-base leading-relaxed text-(--l-fg-2) sm:mt-6 sm:text-xl"
                >
                  Autonomous software engineering in isolated cloud sandboxes.
                  Coordinate specialist subagents, inspect live diffs, and run
                  durable workflows that keep shipping while you are away.
                </motion.p>
              </div>

              <motion.div
                ref={heroButtonsRef}
                initial={{ opacity: 0, transform: "translateY(8px)" }}
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                transition={{
                  duration: 0.4,
                  delay: 0.1,
                  ease: EASE_OUT_QUINT,
                }}
                className="mt-7 flex flex-wrap items-center gap-3 sm:mt-8"
              >
                <Link
                  href="/login"
                  className="inline-flex min-h-9 items-center rounded-md bg-(--l-fg) px-4 text-sm font-medium text-(--l-bg) transition-opacity duration-150 hover:opacity-85"
                >
                  Start building
                </Link>
                <a
                  href="#features"
                  className="inline-flex min-h-9 items-center rounded-md border border-(--l-border) bg-(--l-surface) px-4 text-sm font-medium text-(--l-fg-2) transition-colors duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg)"
                >
                  Explore how it works
                </a>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, transform: "translateY(14px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{
                duration: 0.5,
                delay: 0.16,
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

          <div id="features">
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
