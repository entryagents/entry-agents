import { describe, expect, it } from "bun:test";
import { parseGithubRepoInput } from "./parse-repo-input";

describe("parseGithubRepoInput", () => {
  it("parses full GitHub URLs", () => {
    expect(parseGithubRepoInput("https://github.com/vercel/next.js")).toEqual({
      owner: "vercel",
      repo: "next.js",
    });
    expect(
      parseGithubRepoInput("https://github.com/entryagents/entry-agents.git"),
    ).toEqual({
      owner: "entryagents",
      repo: "entry-agents",
    });
    expect(
      parseGithubRepoInput("github.com/entryagents/entry-agents/tree/main"),
    ).toEqual({
      owner: "entryagents",
      repo: "entry-agents",
    });
  });

  it("parses owner/repo shorthand", () => {
    expect(parseGithubRepoInput("entryagents/entry-agents")).toEqual({
      owner: "entryagents",
      repo: "entry-agents",
    });
  });

  it("returns null for invalid inputs", () => {
    expect(parseGithubRepoInput("")).toBeNull();
    expect(parseGithubRepoInput("just-a-word")).toBeNull();
    expect(parseGithubRepoInput("https://gitlab.com/user/repo")).toBeNull();
    expect(parseGithubRepoInput("https://github.com/only-owner")).toBeNull();
  });
});
