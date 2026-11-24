"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface IdleRoutePrefetchOptions {
  enabled?: boolean;
  delayMs?: number;
}

/**
 * Prefetches Next.js App Router routes during browser idle time so sidebar and
 * tab navigations open immediately without a cold RSC fetch pause.
 */
export function useIdleRoutePrefetch(
  hrefs: readonly string[],
  options: IdleRoutePrefetchOptions = {},
): void {
  const { enabled = true, delayMs = 150 } = options;
  const router = useRouter();
  const prefetchedRef = useRef(new Set<string>());
  const hrefsKey = hrefs.join("\0");

  useEffect(() => {
    if (!enabled || hrefs.length === 0) {
      return;
    }

    const targets = hrefsKey.split("\0").filter(Boolean);
    const run = () => {
      for (const href of targets) {
        if (prefetchedRef.current.has(href)) {
          continue;
        }
        prefetchedRef.current.add(href);
        router.prefetch(href);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(run, {
        timeout: Math.max(delayMs, 300),
      });
      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timer = window.setTimeout(run, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [delayMs, enabled, hrefs.length, hrefsKey, router]);
}
