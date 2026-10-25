import type { BaseCodeOptions } from "@pierre/diffs/react";
import type { FileDiffOptions } from "@pierre/diffs";
import "./vercel-themes";

export const unsafeCSS = `
  :host {
    display: block;
    max-width: 100%;
    color-scheme: light;
    --diffs-bg: var(--background, #ffffff);
    --diffs-fg: var(--foreground, #171717);
    --diffs-light: #171717;
    --diffs-token-light: #171717;
    --diffs-dark: #171717;
    --diffs-token-dark: #171717;
    --diffs-font-family: var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    --diffs-tab-size: 2;
    --diffs-gap-inline: 8px;
    --diffs-gap-block: 0px;
    --diffs-addition-color-override: #15803d;
    --diffs-deletion-color-override: #b91c1c;
    --diffs-bg-addition-override: rgba(22, 163, 74, 0.12);
    --diffs-bg-deletion-override: rgba(225, 29, 72, 0.12);
    color: var(--foreground, #171717);
    background-color: var(--background, #ffffff);
  }

  :host-context(.dark),
  :host(.dark) {
    color-scheme: dark;
    --diffs-bg: var(--background, #0a0a0a);
    --diffs-fg: var(--foreground, #ededed);
    --diffs-dark: #ededed;
    --diffs-token-dark: #ededed;
    --diffs-addition-color-override: #3dc96a;
    --diffs-deletion-color-override: #f04b78;
    --diffs-bg-addition-override: rgba(61, 201, 106, 0.15);
    --diffs-bg-deletion-override: rgba(240, 75, 120, 0.15);
    color: var(--foreground, #ededed);
    background-color: var(--background, #0a0a0a);
  }

  /* Defend against unstyled tokens or inverted OS media queries in light mode */
  :host(:not(.dark)) pre,
  :host(:not(.dark)) code,
  :host(:not(.dark)) [data-line] {
    color: inherit;
  }
`;

/**
 * Returns FileDiffOptions strictly tailored to the current resolved theme.
 * Passing a single theme name ("vercel-dark" or "vercel-light") instead of dual themes
 * guarantees that Shiki directly resolves high-contrast colors and prevents OS-level
 * prefers-color-scheme leakage into the shadow DOM.
 */
export function getDiffOptions(
  resolvedTheme?: "light" | "dark" | string,
  split?: boolean,
): FileDiffOptions<undefined> {
  const isDark = resolvedTheme === "dark";
  const themeName = isDark ? "vercel-dark" : "vercel-light";

  return {
    theme: themeName,
    diffStyle: split ? "split" : "unified",
    diffIndicators: "classic",
    overflow: "scroll",
    disableFileHeader: true,
    unsafeCSS,
    hunkSeparators: "line-info",
  };
}

/**
 * Returns BaseCodeOptions strictly tailored to the current resolved theme.
 */
export function getFileOptions(
  resolvedTheme?: "light" | "dark" | string,
): BaseCodeOptions {
  const isDark = resolvedTheme === "dark";
  const themeName = isDark ? "vercel-dark" : "vercel-light";

  return {
    theme: themeName,
    overflow: "scroll",
    disableFileHeader: true,
    unsafeCSS,
  };
}

const defaultTheme = {
  dark: "vercel-dark",
  light: "vercel-light",
} as const;

/* ------------------------------------------------------------------ */
/* Exported static presets (for backward compatibility)                */
/* ------------------------------------------------------------------ */

export const defaultDiffOptions: FileDiffOptions<undefined> = {
  theme: defaultTheme,
  diffStyle: "unified",
  diffIndicators: "classic",
  overflow: "scroll",
  disableFileHeader: true,
  unsafeCSS,
  hunkSeparators: "line-info",
};

export const splitDiffOptions: FileDiffOptions<undefined> = {
  ...defaultDiffOptions,
  diffStyle: "split",
};

export const defaultFileOptions = {
  theme: defaultTheme,
  overflow: "scroll",
  disableFileHeader: true,
  unsafeCSS,
} satisfies BaseCodeOptions;
