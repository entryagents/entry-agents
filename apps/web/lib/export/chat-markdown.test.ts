import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { chatMarkdown, markdownFilename } from "./chat-markdown";

describe("markdownFilename", () => {
  test("sanitizes title into lowercase .md slug", () => {
    expect(markdownFilename("Fix Auth: Bug / 401?")).toBe(
      "fix-auth-bug-401.md",
    );
    expect(markdownFilename("   ")).toBe("chat.md");
  });
});

describe("chatMarkdown", () => {
  test("formats user, assistant, steps, plans, and switched agents", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Fix the header layout" }],
      },
      {
        id: "a1",
        role: "assistant",
        metadata: { modelId: "anthropic/claude-sonnet-4" },
        parts: [
          { type: "reasoning", text: "thinking..." },
          {
            type: "tool-bash",
            toolCallId: "t1",
            state: "output-available",
            input: { command: "pnpm test" },
            output: { stdout: "ok" },
          },
          {
            type: "tool-read",
            toolCallId: "t2",
            state: "output-available",
            input: { file_path: "src/header.tsx" },
            output: {},
          },
          {
            type: "text",
            text: "Updated the header to match Sable.",
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        metadata: { modelId: "openai/gpt-5" },
        parts: [
          { type: "text", text: "Verified the mobile responsive rules." },
        ],
      },
    ] as unknown as WebAgentUIMessage[];

    const md = chatMarkdown(
      {
        title: "Header 1:1 Port",
        repoName: "entry-agents",
        branch: "main",
        createdAt: "2026-06-01T12:00:00.000Z",
      },
      messages,
      { locale: "en-GB", timeZone: "UTC" },
    );

    expect(md).toContain("# Header 1:1 Port");
    expect(md).toContain("Anthropic · entry-agents · main · 1 Jun 2026");
    expect(md).toContain("## You");
    expect(md).toContain("Fix the header layout");
    expect(md).toContain("## Anthropic");
    expect(md).toContain("Updated the header to match Sable.");
    expect(md).toContain("**Steps** (2)");
    expect(md).toContain("- Ran `pnpm test`: completed");
    expect(md).toContain("- Also read 1 file");
    expect(md).toContain("> Switched to OpenAI");
    expect(md).toContain("## OpenAI");
  });

  test("handles slash commands and compaction notices", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "/compact focus on API" }],
      },
      {
        id: "a1",
        role: "assistant",
        metadata: { isCompactionNotice: true },
        parts: [{ type: "text", text: "Compacted conversation (42% → 12%)" }],
      },
    ] as unknown as WebAgentUIMessage[];

    const md = chatMarkdown({ title: "Compact" }, messages, {
      locale: "en-GB",
      timeZone: "UTC",
    });

    expect(md).toContain("`/compact focus on API`");
    expect(md).toContain("> Compacted conversation (42% → 12%)");
  });
});
