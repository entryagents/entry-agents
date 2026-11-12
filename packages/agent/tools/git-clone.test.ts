import { describe, expect, it } from "bun:test";
import { deriveRepoFolderName, normalizeGitCloneUrl } from "./git-clone";

describe("git-clone helpers", () => {
  it("expands GitHub owner/repo shorthand to https URL", () => {
    expect(normalizeGitCloneUrl("t3-oss/t3code")).toBe(
      "https://github.com/t3-oss/t3code.git",
    );
    expect(normalizeGitCloneUrl("vercel/ai.git")).toBe(
      "https://github.com/vercel/ai.git",
    );
  });

  it("accepts https URLs and rejects unsafe schemes or invalid strings", () => {
    expect(normalizeGitCloneUrl("https://github.com/pingdotgg/t3code")).toBe(
      "https://github.com/pingdotgg/t3code",
    );
    expect(normalizeGitCloneUrl("file:///etc/passwd")).toBeNull();
    expect(
      normalizeGitCloneUrl("ssh://git@github.com/org/repo.git"),
    ).toBeNull();
    expect(normalizeGitCloneUrl("")).toBeNull();
  });

  it("derives clean repo folder names", () => {
    expect(deriveRepoFolderName("https://github.com/t3-oss/t3code.git")).toBe(
      "t3code",
    );
    expect(
      deriveRepoFolderName("https://github.com/entryagents/entry-agents"),
    ).toBe("entry-agents");
  });
});
