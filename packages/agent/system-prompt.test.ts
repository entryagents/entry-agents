import { describe, expect, test } from "bun:test";
import { buildSystemPrompt, buildSystemPromptParts } from "./system-prompt";

function commonPrefixLength(a: string, b: string): number {
  const len = Math.min(a.length, b.length);
  let i = 0;
  while (i < len && a.charCodeAt(i) === b.charCodeAt(i)) {
    i += 1;
  }
  return i;
}

describe("buildSystemPrompt guided frontend workflow", () => {
  test("omits the guided frontend workflow section by default", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).not.toContain("Guided Frontend Workflow");
    expect(prompt).not.toContain("design.md");
  });

  test("omits the section when explicitly false", () => {
    const prompt = buildSystemPrompt({ guidedFrontendWorkflow: false });
    expect(prompt).not.toContain("Guided Frontend Workflow");
  });

  test("injects the guided frontend workflow section when enabled", () => {
    const prompt = buildSystemPrompt({ guidedFrontendWorkflow: true });
    expect(prompt).toContain("Guided Frontend Workflow");
    expect(prompt).toContain("design.md");
  });

  test("guided frontend workflow section is appended after other sections", () => {
    const withSkills = buildSystemPrompt({
      guidedFrontendWorkflow: true,
      customInstructions: "Always use pnpm.",
      cwd: ".",
    });
    const customIdx = withSkills.indexOf("Always use pnpm.");
    const guidedIdx = withSkills.indexOf("Guided Frontend Workflow");
    expect(customIdx).toBeGreaterThan(-1);
    expect(guidedIdx).toBeGreaterThan(customIdx);
  });
});

describe("buildSystemPromptParts prefix caching stability", () => {
  const baseOptions = {
    modelId: "deepseek/deepseek-chat",
    cwd: "/workspace/repo",
    customInstructions: "Always run pnpm run ci before merging.",
    skills: [
      {
        name: "unslop",
        description: "Polish UI to remove generic AI aesthetics.",
        path: "/skills/unslop",
        filename: "SKILL.md",
        options: {},
      },
    ],
    secretCatalog: [{ name: "DEEPGRAM_API_KEY", description: "Speech API" }],
    mcpSummary: {
      bridged: true,
      servers: [{ name: "executor", toolCount: 12 }],
      directToolNames: [],
      connectedIntegrations: ["github"],
    },
  };

  test("orders dynamicParts from most-stable to least-stable", () => {
    const { dynamicContext } = buildSystemPromptParts({
      ...baseOptions,
      currentBranch: "feat/session-1",
      environmentDetails: "Node 24 / Bun 1.3",
      guidedFrontendWorkflow: true,
    });

    const dateIdx = dynamicContext.indexOf("Current date:");
    const skillsIdx = dynamicContext.indexOf("## Skills");
    const cwdIdx = dynamicContext.indexOf("Working directory:");
    const customIdx = dynamicContext.indexOf("# Project-Specific Instructions");
    const secretsIdx = dynamicContext.indexOf(
      "## Available User Secrets & API Keys",
    );
    const mcpIdx = dynamicContext.indexOf("## Connected MCP Servers");
    const branchIdx = dynamicContext.indexOf("Current branch:");
    const sandboxIdx = dynamicContext.indexOf("# Cloud Sandbox");
    const envDetailsIdx = dynamicContext.indexOf("Node 24 / Bun 1.3");
    const guidedIdx = dynamicContext.indexOf("# Guided Frontend Workflow");

    expect(dateIdx).toBeGreaterThan(-1);
    expect(skillsIdx).toBeGreaterThan(dateIdx);
    expect(cwdIdx).toBeGreaterThan(skillsIdx);
    expect(customIdx).toBeGreaterThan(cwdIdx);
    expect(secretsIdx).toBeGreaterThan(customIdx);
    expect(mcpIdx).toBeGreaterThan(secretsIdx);
    expect(branchIdx).toBeGreaterThan(mcpIdx);
    expect(sandboxIdx).toBeGreaterThan(branchIdx);
    expect(envDetailsIdx).toBeGreaterThan(sandboxIdx);
    expect(guidedIdx).toBeGreaterThan(envDetailsIdx);
  });

  test("preserves shared prefix across different sessions and branches", () => {
    const sessionA = buildSystemPrompt({
      ...baseOptions,
      currentBranch: "feat/session-a",
      environmentDetails: "Session A sandbox",
    });
    const sessionB = buildSystemPrompt({
      ...baseOptions,
      currentBranch: "feat/session-b",
      environmentDetails: "Session B sandbox",
    });

    const sharedLen = commonPrefixLength(sessionA, sessionB);
    const branchStart = sessionA.indexOf("Current branch: feat/session-a");

    // Everything up to the branch name must be byte-for-byte identical
    expect(sharedLen).toBeGreaterThanOrEqual(branchStart);
    expect(sessionA.slice(0, sharedLen)).toContain("## Skills");
    expect(sessionA.slice(0, sharedLen)).toContain(
      "Always run pnpm run ci before merging.",
    );
    expect(sessionA.slice(0, sharedLen)).toContain("DEEPGRAM_API_KEY");
    expect(sessionA.slice(0, sharedLen)).toContain("## Connected MCP Servers");
  });
});
