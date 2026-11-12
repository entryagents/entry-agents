import { describe, expect, test } from "bun:test";
import { getFileIcon } from "./file-type-icons";

describe("file-type-icons", () => {
  test("returns element for TypeScript and React files", () => {
    const ts = getFileIcon("index.ts");
    expect(ts).toBeDefined();
    const tsx = getFileIcon("app.tsx");
    expect(tsx).toBeDefined();
  });

  test("returns element for Markdown documents", () => {
    const md = getFileIcon("README.md");
    expect(md).toBeDefined();
    const plan = getFileIcon("plan.md");
    expect(plan).toBeDefined();
  });

  test("returns element for config and lock files", () => {
    const docker = getFileIcon("Dockerfile");
    expect(docker).toBeDefined();
    const bunLock = getFileIcon("bun.lock");
    expect(bunLock).toBeDefined();
    const pkg = getFileIcon("package.json");
    expect(pkg).toBeDefined();
  });

  test("returns element for web frameworks, documents, and archives", () => {
    expect(getFileIcon("component.vue")).toBeDefined();
    expect(getFileIcon("App.svelte")).toBeDefined();
    expect(getFileIcon("page.astro")).toBeDefined();
    expect(getFileIcon("data.csv")).toBeDefined();
    expect(getFileIcon("report.pdf")).toBeDefined();
    expect(getFileIcon("build.log")).toBeDefined();
    expect(getFileIcon("archive.zip")).toBeDefined();
  });
});
