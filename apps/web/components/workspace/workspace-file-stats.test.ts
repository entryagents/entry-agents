import { describe, expect, test } from "bun:test";
import {
  computeFileMetrics,
  formatBytes,
  getFileLanguage,
} from "./workspace-file-stats";

describe("workspace-file-stats", () => {
  test("getFileLanguage detects languages and frameworks", () => {
    expect(getFileLanguage("apps/web/app/page.tsx")).toBe("TypeScript React");
    expect(getFileLanguage("packages/agent/tools/task.ts")).toBe("TypeScript");
    expect(getFileLanguage("README.md")).toBe("Markdown");
    expect(getFileLanguage("package.json")).toBe("Node Package");
    expect(getFileLanguage("Dockerfile")).toBe("Docker");
    expect(getFileLanguage("main.rs")).toBe("Rust");
    expect(getFileLanguage("script.py")).toBe("Python");
    expect(getFileLanguage("unknown.xyz")).toBe("XYZ");
    expect(getFileLanguage("noextension")).toBe("Plain Text");
  });

  test("formatBytes formats file sizes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });

  test("computeFileMetrics counts lines, characters, and bytes", () => {
    const text = "line 1\nline 2\nline 3";
    const metrics = computeFileMetrics(text);
    expect(metrics.lines).toBe(3);
    expect(metrics.characters).toBe(20);
    expect(metrics.formattedSize).toBe("20 B");
  });
});
