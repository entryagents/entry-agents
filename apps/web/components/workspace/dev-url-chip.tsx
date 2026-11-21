"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DetectedDevUrl {
  url: string;
  label: string;
}

const DEV_URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s"'`<>)\]]*)?/gi;

/** Extracts unique localhost / loopback dev-server URLs from terminal output. */
export function extractDevUrls(text: string): DetectedDevUrl[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: DetectedDevUrl[] = [];
  for (const match of text.matchAll(DEV_URL_RE)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "");
    const normalized = raw.replace("://0.0.0.0:", "://localhost:");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      const parsed = new URL(normalized);
      const label = `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
      out.push({ url: normalized, label });
    } catch {
      out.push({ url: normalized, label: normalized });
    }
  }
  return out;
}

/**
 * Quiet dev-server address chip (1:1 Sable `DevUrlChip.tsx`).
 * Click opens the Work Panel Preview tab; Cmd/Ctrl+click opens in a new tab.
 */
export function DevUrlChip({
  url,
  label,
  onOpenPreview,
  className,
}: {
  url: string;
  label: string;
  onOpenPreview?: (url: string) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={`Open ${label} in Preview`}
      title="Open in Preview tab (Cmd/Ctrl+click opens external tab)"
      onClick={(e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || !onOpenPreview) {
          window.open(url, "_blank", "noopener,noreferrer");
          return;
        }
        onOpenPreview(url);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 transition-colors hover:border-emerald-500/45 hover:bg-emerald-500/20 hover:text-emerald-200 cursor-pointer",
        className,
      )}
    >
      <span className="font-mono tabular-nums">{label}</span>
      <span className="inline-flex items-center gap-0.5 font-sans font-medium text-emerald-200">
        Open
        <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
      </span>
    </button>
  );
}
