"use client";

import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import Image from "next/image";
import { useEffect, useRef } from "react";

interface CloudBank {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
  phase: number;
}

function buildCloudSprite(isDark: boolean): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = 320;
  sprite.height = 150;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;

  const puffs = [
    { x: 160, y: 86, r: 72, a: 0.62 },
    { x: 102, y: 92, r: 58, a: 0.5 },
    { x: 218, y: 94, r: 60, a: 0.48 },
    { x: 132, y: 62, r: 54, a: 0.54 },
    { x: 192, y: 66, r: 52, a: 0.46 },
  ];

  const rgb = isDark ? "232, 241, 255" : "255, 255, 255";
  const rim = isDark ? "168, 202, 238" : "216, 234, 252";

  for (const puff of puffs) {
    const grad = ctx.createRadialGradient(
      puff.x,
      puff.y - puff.r * 0.18,
      puff.r * 0.08,
      puff.x,
      puff.y,
      puff.r,
    );
    grad.addColorStop(0, `rgba(${rgb}, ${puff.a})`);
    grad.addColorStop(0.52, `rgba(${rim}, ${puff.a * 0.52})`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, puff.r, 0, Math.PI * 2);
    ctx.fill();
  }

  return sprite;
}

function CloudWispCanvas({
  reducedMotion,
  density = 28,
}: {
  readonly reducedMotion: boolean;
  readonly density?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isDark = document.documentElement.classList.contains("dark");
    let sprite = buildCloudSprite(isDark);

    const observer = new MutationObserver(() => {
      const nextDark = document.documentElement.classList.contains("dark");
      if (nextDark !== isDark) {
        isDark = nextDark;
        sprite = buildCloudSprite(isDark);
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let width = 0;
    let height = 0;
    const banks: CloudBank[] = [];

    const seedBanks = (w: number, h: number) => {
      banks.length = 0;
      for (let i = 0; i < density; i++) {
        const layer = i % 3;
        const scale = layer === 0 ? 1.5 : layer === 1 ? 1.05 : 0.72;
        const bw = (220 + ((i * 59) % 190)) * scale;
        const bh = bw * 0.46;
        banks.push({
          x: (i / density) * (w + bw * 1.2) - bw * 0.3,
          y: h * (0.01 + ((i * 17) % 68) / 100),
          w: bw,
          h: bh,
          // Unmistakable multi-depth wind velocity (px/s in half-res canvas space)
          speed: (layer === 0 ? 52 : layer === 1 ? 34 : 20) + (i % 5) * 3.8,
          alpha: isDark
            ? layer === 0
              ? 0.42
              : layer === 1
                ? 0.3
                : 0.2
            : layer === 0
              ? 0.72
              : layer === 1
                ? 0.54
                : 0.38,
          phase: i * 1.13,
        });
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * 0.5));
      height = Math.max(1, Math.round(rect.height * 0.5));
      canvas.width = width;
      canvas.height = height;
      seedBanks(width, height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let rafId = 0;
    let lastTime = performance.now();

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);
      const t = now * 0.00075;

      for (const bank of banks) {
        if (!reducedMotion) {
          bank.x -= bank.speed * dt;
          if (bank.x + bank.w < -40) {
            bank.x = width + 24;
          }
        }
        const bobY = reducedMotion ? 0 : Math.sin(t + bank.phase) * 9;
        ctx.globalAlpha = isDark
          ? bank.alpha
          : Math.min(0.82, bank.alpha * 1.25);
        ctx.drawImage(sprite, bank.x, bank.y + bobY, bank.w, bank.h);
      }

      ctx.globalAlpha = 1;
      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    drawFrame(lastTime);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      observer.disconnect();
    };
  }, [density, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

/**
 * Seamless 200%-width mirrored panoramic cloud track that glides continuously
 * horizontally so desktop sky motion is unmistakably alive with zero seam.
 */
function SeamlessCloudTrack({
  trackClassName,
  objectPosition,
  priority = false,
  sizes = "100vw",
}: {
  readonly trackClassName: string;
  readonly objectPosition: string;
  readonly priority?: boolean;
  readonly sizes?: string;
}) {
  return (
    <div className={`${trackClassName} flex h-full w-[200%]`}>
      <div className="relative h-full w-1/2 shrink-0">
        <Image
          src="/images/hero-cloud-dark.jpg"
          alt=""
          fill
          priority={priority}
          sizes={sizes}
          className="hidden object-cover dark:block"
          style={{ objectPosition }}
        />
        <Image
          src="/images/hero-cloud-light.jpg"
          alt=""
          fill
          priority={priority}
          sizes={sizes}
          className="block object-cover dark:hidden"
          style={{ objectPosition }}
        />
      </div>
      <div className="relative h-full w-1/2 shrink-0 -scale-x-100">
        <Image
          src="/images/hero-cloud-dark.jpg"
          alt=""
          fill
          sizes={sizes}
          className="hidden object-cover dark:block"
          style={{ objectPosition }}
        />
        <Image
          src="/images/hero-cloud-light.jpg"
          alt=""
          fill
          sizes={sizes}
          className="block object-cover dark:hidden"
          style={{ objectPosition }}
        />
      </div>
    </div>
  );
}

interface CloudSkyBackdropProps {
  readonly variant?: "hero" | "closing" | "login";
}

export function CloudSkyBackdrop({ variant = "hero" }: CloudSkyBackdropProps) {
  const prefersReduced = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });
  const scrollShiftY = useTransform(scrollYProgress, [0, 1], [0, 76]);

  const mouseX = useSpring(0, { stiffness: 45, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 45, damping: 20 });

  useEffect(() => {
    if (prefersReduced || (variant !== "hero" && variant !== "login")) return;
    const handleMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      mouseX.set(nx * -42);
      mouseY.set(ny * -20);
    };
    window.addEventListener("pointermove", handleMove, { passive: true });
    return () => window.removeEventListener("pointermove", handleMove);
  }, [mouseX, mouseY, prefersReduced, variant]);

  if (variant === "closing") {
    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 opacity-75">
          <SeamlessCloudTrack
            trackClassName="entry-cloud-track"
            objectPosition="75% 58%"
            sizes="(max-width: 1280px) 100vw, 1200px"
          />
        </div>
        <CloudWispCanvas reducedMotion={prefersReduced} density={12} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(95deg, var(--l-surface) 0%, color-mix(in srgb, var(--l-surface) 88%, transparent) 48%, color-mix(in srgb, var(--l-surface) 22%, transparent) 100%)",
          }}
        />
      </div>
    );
  }

  if (variant === "login") {
    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <motion.div
          style={prefersReduced ? undefined : { x: mouseX, y: mouseY }}
          className="absolute inset-[-6%]"
        >
          <SeamlessCloudTrack
            trackClassName="entry-cloud-track"
            objectPosition="64% 34%"
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
          />
        </motion.div>
        <CloudWispCanvas reducedMotion={prefersReduced} density={20} />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--l-surface) 0%, color-mix(in srgb, var(--l-surface) 84%, transparent) 44%, color-mix(in srgb, var(--l-surface) 18%, transparent) 100%)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[660px] overflow-hidden sm:h-[760px] lg:h-[880px]"
    >
      {/* Layer 1: Continuous panoramic cloud sea with scroll + pointer parallax */}
      <motion.div
        style={
          prefersReduced
            ? undefined
            : { x: mouseX, y: mouseY, translateY: scrollShiftY }
        }
        className="absolute inset-[-7%]"
      >
        <SeamlessCloudTrack
          trackClassName="entry-cloud-track"
          objectPosition="72% 28%"
          priority
        />
      </motion.div>

      {/* Layer 2: Counter-drifting translucent upper cloud strata */}
      <div
        className="absolute inset-[-7%] opacity-35 dark:opacity-38"
        style={{
          maskImage:
            "radial-gradient(ellipse 88% 74% at 68% 30%, black 22%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 88% 74% at 68% 30%, black 22%, transparent 82%)",
        }}
      >
        <SeamlessCloudTrack
          trackClassName="entry-cloud-track-veil"
          objectPosition="55% 22%"
        />
      </div>

      {/* Layer 3: Real-time 60fps visibly drifting volumetric cumulus banks */}
      <CloudWispCanvas reducedMotion={prefersReduced} density={28} />

      {/* Crisp readability feather on left while keeping right cloud sea vividly open */}
      <div className="absolute inset-0 bg-(--l-bg)/28 md:bg-transparent" />
      <div
        className="absolute inset-0 md:w-[58%]"
        style={{
          background:
            "linear-gradient(to right, var(--l-bg) 0%, color-mix(in srgb, var(--l-bg) 72%, transparent) 40%, transparent 100%)",
        }}
      />
      {/* Seamless bottom dissolve into page ground */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--l-bg) 22%, transparent) 0%, transparent 16%, transparent 48%, color-mix(in srgb, var(--l-bg) 80%, transparent) 82%, var(--l-bg) 100%)",
        }}
      />
    </div>
  );
}
