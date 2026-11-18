import { describe, expect, test } from "bun:test";
import { transformWordsAnchorHtml } from "./words-config";

describe("transformWordsAnchorHtml", () => {
  test("leaves normal external links untouched", () => {
    const html = '<a href="https://example.com">Example</a>';
    expect(transformWordsAnchorHtml(html, true)).toBe(html);
  });

  test("transforms workspace file links into file chips with data-workspace-file", () => {
    const html =
      '<a href="#workspace-file=apps%2Fweb%2Fapp%2Fpage.tsx">page.tsx</a>';
    const result = transformWordsAnchorHtml(html, true);
    expect(result).toContain('data-workspace-file="apps/web/app/page.tsx"');
    expect(result).toContain('title="Open apps/web/app/page.tsx"');
    expect(result).toContain("<bdi>page.tsx</bdi>");
  });

  test("marks non-interactive workspace file links as cursor-default", () => {
    const html = '<a href="#workspace-file=README.md">README.md</a>';
    const result = transformWordsAnchorHtml(html, false);
    expect(result).toContain("cursor-default");
    expect(result).toContain('title="README.md"');
  });
});
