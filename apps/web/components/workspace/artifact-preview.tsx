"use client";

import {
  ExternalLink,
  Globe,
  Maximize2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { streamdownPlugins } from "@/lib/streamdown-config";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Markdown Artifact Rendering
// ---------------------------------------------------------------------------

function stripMarkdownFrontmatter(content: string) {
  const frontmatterMatch = content.match(
    /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?:\r?\n|$)/,
  );
  if (!frontmatterMatch) {
    return content;
  }
  return content.slice(frontmatterMatch[0].length);
}

export function MarkdownArtifactPreview({ content }: { content: string }) {
  const cleanMarkdown = useMemo(
    () => stripMarkdownFrontmatter(content),
    [content],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-8 py-8">
      <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-m-20 prose-headings:font-semibold prose-a:text-primary prose-a:underline-offset-4 hover:prose-a:underline prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-xs prose-pre:rounded-lg prose-pre:border prose-pre:border-border prose-pre:bg-muted/40 prose-img:rounded-lg">
        <Streamdown
          mode="static"
          isAnimating={false}
          plugins={streamdownPlugins}
        >
          {cleanMarkdown}
        </Streamdown>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HTML / Web Artifact Rendering (Sandboxed IFrame Preview)
// ---------------------------------------------------------------------------

type ViewportMode = "responsive" | "desktop" | "tablet" | "mobile";

export function HtmlArtifactPreview({
  htmlContent,
  fileName,
}: {
  htmlContent: string;
  fileName: string;
}) {
  const [viewport, setViewport] = useState<ViewportMode>("responsive");
  const [reloadKey, setReloadKey] = useState(0);

  const srcDoc = useMemo(() => {
    // Inject responsive meta tag if missing so mobile views render correctly
    if (!htmlContent.includes('<meta name="viewport"')) {
      return htmlContent.replace(
        "<head>",
        '<head><meta name="viewport" content="width=device-width, initial-scale=1.0">',
      );
    }
    return htmlContent;
  }, [htmlContent]);

  const handleOpenExternal = () => {
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const getContainerWidth = () => {
    switch (viewport) {
      case "desktop":
        return "max-w-[1280px]";
      case "tablet":
        return "max-w-[768px]";
      case "mobile":
        return "max-w-[375px]";
      default:
        return "w-full";
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-muted/10">
      {/* HTML Preview Controls Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-3 py-1.5 gap-2">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground mr-1">
            Viewport:
          </span>
          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewport("responsive")}
              className={cn(
                "h-6 px-2 text-xs gap-1",
                viewport === "responsive" &&
                  "bg-background text-foreground shadow-2xs font-medium",
              )}
            >
              <Maximize2 className="h-3 w-3" />
              <span>Full</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewport("desktop")}
              className={cn(
                "h-6 px-2 text-xs gap-1",
                viewport === "desktop" &&
                  "bg-background text-foreground shadow-2xs font-medium",
              )}
            >
              <Monitor className="h-3 w-3" />
              <span>Desktop</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewport("tablet")}
              className={cn(
                "h-6 px-2 text-xs gap-1",
                viewport === "tablet" &&
                  "bg-background text-foreground shadow-2xs font-medium",
              )}
            >
              <Tablet className="h-3 w-3" />
              <span>Tablet</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setViewport("mobile")}
              className={cn(
                "h-6 px-2 text-xs gap-1",
                viewport === "mobile" &&
                  "bg-background text-foreground shadow-2xs font-medium",
              )}
            >
              <Smartphone className="h-3 w-3" />
              <span>Mobile</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reload preview</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleOpenExternal}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in new tab</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Sandboxed Iframe Container */}
      <div className="flex-1 min-h-0 overflow-auto p-4 flex justify-center items-start">
        <div
          className={cn(
            "h-full w-full rounded-lg border border-border bg-background shadow-xs overflow-hidden transition-all duration-200",
            getContainerWidth(),
          )}
        >
          <iframe
            key={reloadKey}
            title={fileName}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms"
            className="h-full w-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG Vector Preview
// ---------------------------------------------------------------------------

export function SvgArtifactPreview({
  svgContent,
  fileName,
}: {
  svgContent: string;
  fileName: string;
}) {
  const dataUrl = useMemo(() => {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
  }, [svgContent]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-8 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)]">
      <div className="max-h-[80vh] max-w-full rounded-lg border border-border bg-background/90 p-6 shadow-sm backdrop-blur-xs flex items-center justify-center">
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        <img
          src={dataUrl}
          alt={fileName}
          className="max-h-[60vh] max-w-full object-contain"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// URL Artifact Bookmark Card
// ---------------------------------------------------------------------------

export function UrlArtifactPreview({ jsonContent }: { jsonContent: string }) {
  const parsed = useMemo(() => {
    try {
      return JSON.parse(jsonContent) as {
        url?: string;
        title?: string;
        description?: string;
      };
    } catch {
      return null;
    }
  }, [jsonContent]);

  if (!parsed || !parsed.url) {
    return null;
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-8 bg-muted/10">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              URL Artifact
            </div>
            <h3 className="text-base font-semibold text-foreground truncate">
              {parsed.title || "External Resource"}
            </h3>
          </div>
        </div>

        {parsed.description && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {parsed.description}
          </p>
        )}

        <div className="mt-4 rounded-md border border-border/80 bg-muted/40 p-2 font-mono text-xs text-foreground truncate">
          {parsed.url}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button asChild size="sm" className="gap-1.5 cursor-pointer">
            <a href={parsed.url} target="_blank" rel="noopener noreferrer">
              <span>Visit Link</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
