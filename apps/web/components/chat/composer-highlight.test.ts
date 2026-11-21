import { describe, expect, test } from "bun:test";
import {
  BUILTIN_COMPOSER_COMMANDS,
  mayHavePills,
  tokenizeComposerText,
} from "./composer-highlight";

describe("composer-highlight tokenizer", () => {
  const known = {
    commands: BUILTIN_COMPOSER_COMMANDS,
    skills: new Set(["review", "frontend-design"]),
    dollar: true,
    shell: false,
  };

  test("skips ordinary prose via mayHavePills", () => {
    expect(mayHavePills("fix the login bug")).toBe(false);
    expect(mayHavePills("/compact")).toBe(true);
    expect(mayHavePills("!git status")).toBe(true);
    expect(mayHavePills("check @src/app.ts")).toBe(true);
    expect(mayHavePills("use $review")).toBe(true);
  });

  test("highlights leading slash command and @file mention while stripping sentence punctuation", () => {
    const parts = tokenizeComposerText(
      "/compact check @apps/web/page.tsx, and @README.md.",
      known,
    );
    expect(parts).toEqual([
      { text: "/compact", kind: "command" },
      { text: " check ", kind: undefined },
      { text: "@apps/web/page.tsx", kind: "mention" },
      { text: ", and ", kind: undefined },
      { text: "@README.md", kind: "mention" },
      { text: ".", kind: undefined },
    ]);
  });

  test("highlights known $skill tokens only", () => {
    const parts = tokenizeComposerText(
      "run $review and $unknown-skill now",
      known,
    );
    expect(parts).toEqual([
      { text: "run ", kind: undefined },
      { text: "$review", kind: "skill" },
      { text: " and $unknown-skill now", kind: undefined },
    ]);
  });

  test("highlights leading ! as shell pill and treats rest as literal command text", () => {
    const parts = tokenizeComposerText("!git log --format=%an @HEAD", {
      ...known,
      shell: true,
    });
    expect(parts).toEqual([
      { text: "!", kind: "shell" },
      { text: "git log --format=%an @HEAD", kind: undefined },
    ]);
  });
});
