import * as path from "path";
import type { Sandbox } from "@entry-agents/sandbox";
import { parseSkillFrontmatter } from "../discovery";
import { frontmatterToOptions } from "../types";
import { BUILTIN_SKILLS } from "./generated";

/**
 * Ensure the curated set of built-in, generically-useful skills (browser
 * automation, no-API-key web search, ...) exist in a sandbox's global skills
 * directory, so discoverSkills() picks them up for every session regardless
 * of what project the user is working on.
 *
 * Cheap no-op on repeat calls: only writes a skill's files if its SKILL.md
 * isn't already present at the target path (skip re-writing on every turn).
 */
export async function seedBuiltinSkills(
  sandbox: Sandbox,
  globalSkillsDirectory: string,
): Promise<void> {
  await Promise.all(
    BUILTIN_SKILLS.map(async (skill) => {
      const skillDir = path.posix.join(globalSkillsDirectory, skill.name);
      const skillMdPath = path.posix.join(skillDir, "SKILL.md");

      try {
        await sandbox.access(skillMdPath);
        // Already seeded in this sandbox.
        return;
      } catch {
        // Not present yet, fall through to write it.
      }

      await Promise.all(
        Object.entries(skill.files).map(([relativePath, content]) =>
          sandbox.writeFile(
            path.posix.join(skillDir, relativePath),
            content,
            "utf-8",
          ),
        ),
      );
    }),
  );
}

/**
 * Returns static SkillMetadata for all builtin skills (e.g. agent-browser, sandbox)
 * without requiring any network calls or sandbox filesystem operations.
 */
export function getBuiltinSkillsMetadata() {
  return BUILTIN_SKILLS.map((skill) => {
    const content = skill.files["SKILL.md"] ?? "";
    const parsed = parseSkillFrontmatter(content);
    return {
      name: skill.name,
      description: parsed.success ? parsed.data.description : skill.name,
      path: path.posix.join("/root/.agents/skills", skill.name),
      filename: "SKILL.md",
      options: parsed.success ? frontmatterToOptions(parsed.data) : {},
    };
  });
}
