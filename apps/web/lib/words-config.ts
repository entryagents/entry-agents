import { createHighlightsPlugin } from "@pierre/words/highlights";
import type {
  Components,
  ControlsConfig,
  PluginConfig,
} from "@pierre/words/react";
import pierreDark from "@pierre/highlights/themes/pierre-dark";
import pierreLight from "@pierre/highlights/themes/pierre-light";
import { parseWorkspaceFileHref } from "@/lib/assistant-file-links";

export const wordsPlugins: PluginConfig = {
  code: createHighlightsPlugin({
    themes: {
      light: pierreLight,
      dark: pierreDark,
    },
  }),
};

export const wordsControls: ControlsConfig = {
  code: {
    copy: true,
    download: false,
  },
};

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Transforms generated `<a>` HTML from `@pierre/words` so `#workspace-file=`
 * links render as clean file chips with `data-workspace-file` for click
 * delegation.
 */
export function transformWordsAnchorHtml(
  html: string,
  interactive: boolean,
): string {
  const hrefMatch = html.match(/\bhref="([^"]*)"/i);
  if (!hrefMatch) {
    return html;
  }

  const rawHref = hrefMatch[1].replace(/&amp;/g, "&");
  const workspaceFilePath = parseWorkspaceFileHref(rawHref);
  if (!workspaceFilePath) {
    return html;
  }

  const labelMatch = html.match(/^<a\b[^>]*>([\s\S]*?)<\/a>$/i);
  const innerHtml = labelMatch
    ? labelMatch[1]
    : escapeHtmlAttribute(workspaceFilePath);
  const escapedPath = escapeHtmlAttribute(workspaceFilePath);
  const titleAttr = interactive ? `Open ${escapedPath}` : escapedPath;
  const interactiveClasses = interactive
    ? "cursor-pointer transition-colors hover:border-foreground/20 hover:bg-muted"
    : "cursor-default";

  return `<a href="${escapeHtmlAttribute(rawHref)}" data-workspace-file="${escapedPath}" title="${titleAttr}" class="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-1.5 py-0.5 font-mono text-[0.9em] leading-none text-foreground no-underline ${interactiveClasses}"><span dir="rtl" class="min-w-0 truncate"><bdi>${innerHtml}</bdi></span></a>`;
}

export function createWordsComponents(interactiveLinks: boolean): Components {
  return {
    a: (html: string) => transformWordsAnchorHtml(html, interactiveLinks),
  };
}
