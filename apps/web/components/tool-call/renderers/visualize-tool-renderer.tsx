"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Code2,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  RotateCw,
  Sparkles,
} from "lucide-react";
import type { WebAgentUIToolPart } from "@/app/types";
import type { ToolRenderState } from "@/app/lib/render-tool";
import { cn } from "@/lib/utils";

interface VisualizeToolRendererProps {
  part: WebAgentUIToolPart;
  state: ToolRenderState;
  onApprove?: (id: string) => void;
  onDeny?: (id: string, reason?: string) => void;
}

interface VisualizePayload {
  title?: string;
  description?: string | null;
  kind?: "diagram" | "chart" | "dashboard" | "simulation" | "ui";
  html?: string;
  height?: number;
  filePath?: string | null;
}

const KIND_LABELS: Record<NonNullable<VisualizePayload["kind"]>, string> = {
  diagram: "Diagram",
  chart: "Chart",
  dashboard: "Dashboard",
  simulation: "Simulation",
  ui: "Interactive UI",
};

function buildThemedSrcDoc(rawHtml: string, isDark: boolean): string {
  const trimmed = rawHtml.trim();
  const themeStyle = `
<style data-entry-theme-sync>
  :root {
    color-scheme: ${isDark ? "dark" : "light"};
  }
  html, body {
    margin: 0;
    padding: 0;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: ${isDark ? "#0f1115" : "#ffffff"};
    color: ${isDark ? "#e5e7eb" : "#111827"};
  }
</style>`;

  if (/<html[\s>]/i.test(trimmed)) {
    if (/<head[\s>]/i.test(trimmed)) {
      return trimmed.replace(/<head([\s>])/i, `<head$1${themeStyle}`);
    }
    return trimmed.replace(
      /<html([\s>])/i,
      `<html$1<head>${themeStyle}</head>`,
    );
  }

  return `<!DOCTYPE html>
<html lang="en" class="${isDark ? "dark" : ""}" data-theme="${isDark ? "dark" : "light"}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${themeStyle}
</head>
<body>
  ${trimmed}
</body>
</html>`;
}

function slugifyFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "visualization"}.html`;
}

export function VisualizeToolRenderer({
  part,
  state,
}: VisualizeToolRendererProps) {
  const input = (part.input ?? {}) as VisualizePayload;
  const output = (part.output ?? {}) as VisualizePayload;

  const title = output.title || input.title || "Interactive Visualization";
  const description = output.description ?? input.description ?? null;
  const kind = output.kind || input.kind || "diagram";
  const html = output.html || input.html || "";
  const height = Math.min(
    760,
    Math.max(220, Number(output.height ?? input.height ?? 460)),
  );
  const filePath = output.filePath ?? null;

  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains("dark"));
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  const srcDoc = useMemo(
    () => (html ? buildThemedSrcDoc(html, isDark) : ""),
    [html, isDark],
  );

  const isStreamingInput =
    state.running ||
    part.state === "input-streaming" ||
    part.state === "input-available";

  const handleDownload = () => {
    if (!srcDoc) return;
    const blob = new Blob([srcDoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = slugifyFilename(title);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const cardBody = (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        isFullscreen && "flex h-full w-full flex-col rounded-none border-0",
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/35 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium text-foreground">
                {title}
              </span>
              <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {KIND_LABELS[kind]}
              </span>
            </div>
            {description ? (
              <p className="truncate text-[11px] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {filePath ? (
            <span
              className="hidden max-w-[160px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block"
              title={filePath}
            >
              {filePath}
            </span>
          ) : null}

          <div className="flex items-center rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                viewMode === "preview"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Interactive preview"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode("code")}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                viewMode === "code"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Inspect HTML source"
            >
              <Code2 className="h-3 w-3" />
              Code
            </button>
          </div>

          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={!srcDoc}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            title="Reload visualization"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!srcDoc}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            title="Download standalone HTML"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((prev) => !prev)}
            disabled={!srcDoc}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            title={isFullscreen ? "Exit fullscreen" : "Expand fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      {isStreamingInput && !html ? (
        <div
          className="flex flex-col items-center justify-center gap-2 bg-muted/15 px-4 text-center"
          style={{ height: `${Math.min(height, 260)}px` }}
        >
          <Sparkles className="h-5 w-5 animate-pulse text-primary" />
          <p className="text-xs font-medium text-foreground">
            Building interactive visualization...
          </p>
          <p className="text-[11px] text-muted-foreground">
            Rendering self-contained HTML/SVG/JS canvas
          </p>
        </div>
      ) : viewMode === "code" ? (
        <pre
          className={cn(
            "overflow-auto bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground",
            isFullscreen ? "flex-1" : "max-h-[480px]",
          )}
        >
          <code>{html}</code>
        </pre>
      ) : (
        <iframe
          key={`${reloadKey}-${isDark ? "dark" : "light"}`}
          title={title}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          className={cn(
            "w-full border-0 bg-background",
            isFullscreen && "flex-1",
          )}
          style={isFullscreen ? undefined : { height: `${height}px` }}
        />
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xs">
        {cardBody}
      </div>
    );
  }

  return cardBody;
}
