import { describe, expect, test } from "bun:test";
import { extractDevUrls } from "./dev-url-chip";

describe("extractDevUrls", () => {
  test("detects localhost and 0.0.0.0 dev URLs, normalizing 0.0.0.0 and deduplicating", () => {
    const output = `
  ▲ Next.js 16.0.0
  - Local:        http://localhost:3000
  - Network:      http://0.0.0.0:3000/
  - API:          http://127.0.0.1:8787/health.
`;
    const urls = extractDevUrls(output);
    expect(urls).toEqual([
      { url: "http://localhost:3000", label: "localhost:3000" },
      { url: "http://127.0.0.1:8787/health", label: "127.0.0.1:8787/health" },
    ]);
  });

  test("ignores non-dev URLs and empty output", () => {
    expect(extractDevUrls("")).toEqual([]);
    expect(extractDevUrls("Visit https://example.com/docs")).toEqual([]);
  });
});
