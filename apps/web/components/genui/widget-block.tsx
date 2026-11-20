"use client";

import "./genui.css";
import { Check, Copy, Download, Maximize2 } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const WIDGET_CAP = 560;

function isSvgCode(code: string): boolean {
  return /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(code);
}

function guessTitle(code: string): string {
  const titleMatch = /<title>([^<]+)<\/title>/i.exec(code);
  if (titleMatch?.[1]?.trim()) return titleMatch[1].trim();
  return isSvgCode(code) ? "Diagram" : "Widget";
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "widget"
  );
}

function buildSrcDoc(code: string, channelId: string): string {
  const body = isSvgCode(code)
    ? `<div style="display:flex;justify-content:center;align-items:center;padding:12px;">${code}</div>`
    : code;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    background: transparent;
    color: inherit;
  }
  svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
${body}
<script>
(function() {
  var id = ${JSON.stringify(channelId)};
  function post() {
    var h = Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0
    );
    window.parent.postMessage({ type: "entry-widget-height", id: id, height: h }, "*");
  }
  if (typeof ResizeObserver !== "undefined" && document.body) {
    new ResizeObserver(post).observe(document.body);
  }
  window.addEventListener("load", post);
  setTimeout(post, 60);
})();
</script>
</body>
</html>`;
}

export function saveWidgetFile(title: string, code: string) {
  const svg = isSvgCode(code);
  const blob = new Blob([code], {
    type: svg ? "image/svg+xml" : "text/html",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug(title)}.${svg ? "svg" : "html"}`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const WidgetBlock = memo(function WidgetBlock({
  id,
  title,
  code,
  isStreaming = false,
}: {
  id: string;
  title?: string;
  code: string;
  isStreaming?: boolean;
}) {
  const [height, setHeight] = useState(220);
  const [expanded, setExpanded] = useState(false);
  const [large, setLarge] = useState(false);
  const [copied, setCopied] = useState(false);
  const channelId = useRef(id || `w-${Math.random().toString(36).slice(2)}`);

  const resolvedTitle = title?.trim() || guessTitle(code);
  const srcDoc = useMemo(() => buildSrcDoc(code, channelId.current), [code]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as
        | { type?: string; id?: string; height?: number }
        | undefined;
      if (
        data?.type === "entry-widget-height" &&
        data.id === channelId.current &&
        typeof data.height === "number" &&
        data.height > 0
      ) {
        setHeight(Math.max(80, Math.ceil(data.height)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const clipped = !expanded && height > WIDGET_CAP;
  const stageHeight = clipped ? WIDGET_CAP : height;

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <figure className="gw">
      <div className="gw-stage" style={{ height: `${stageHeight}px` }}>
        <iframe
          srcDoc={srcDoc}
          title={resolvedTitle}
          className="gw-frame"
          sandbox="allow-scripts"
        />
        {clipped && (
          <div className="gw-more">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-3 text-xs shadow-xs"
              onClick={() => setExpanded(true)}
            >
              Show all
            </Button>
          </div>
        )}
      </div>

      {!isStreaming && (
        <div className="gw-bar" role="toolbar" aria-label={resolvedTitle}>
          <span className="gw-title truncate">{resolvedTitle}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleCopy}
            aria-label="Copy code"
            title="Copy code"
          >
            {copied ? (
              <Check size={13} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Copy size={13} strokeWidth={1.7} aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => saveWidgetFile(resolvedTitle, code)}
            aria-label="Save as file"
            title="Save as file"
          >
            <Download size={13} strokeWidth={1.7} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setLarge(true)}
            aria-label="Open larger"
            title="Open larger"
          >
            <Maximize2 size={13} strokeWidth={1.7} aria-hidden="true" />
          </Button>
        </div>
      )}

      <Dialog open={large} onOpenChange={setLarge}>
        <DialogContent className="sm:max-w-4xl h-[82vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 py-2.5 border-b border-border flex flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-sm font-medium truncate">
              {resolvedTitle}
            </DialogTitle>
            <div className="flex items-center gap-1 pr-6">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={handleCopy}
              >
                <Copy size={12} strokeWidth={1.7} aria-hidden="true" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => saveWidgetFile(resolvedTitle, code)}
              >
                <Download size={12} strokeWidth={1.7} aria-hidden="true" />
                Save
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto p-3">
            <iframe
              srcDoc={srcDoc}
              title={resolvedTitle}
              className="w-full h-full border-0"
              sandbox="allow-scripts"
            />
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  );
});
