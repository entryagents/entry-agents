/**
 * Entry Agents Wildcard Permission Ruleset Evaluator
 * Mirrors `packages/core/src/permission.ts` and `packages/core/src/plugin/agent.ts`.
 *
 * Actions: "allow" | "ask" | "deny"
 * Supports wildcard matching (`*`, `*.env`, `.entry/plan/*`, etc.).
 */

export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionRule {
  permission: string;
  pattern: string;
  action: PermissionAction;
}

export type PermissionRuleset = PermissionRule[];

export function wildcardMatch(pattern: string, target: string): boolean {
  if (pattern === "*") return true;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`, "i");
  return regex.test(target);
}

/**
 * Default ruleset for `build` mode (mirrors Entry Agents' `build` agent):
 * - Allows read, glob, grep, edit, write, bash, task, skill, web_fetch, web_search
 * - Protects `.env` files with `"ask"` unless explicitly `.env.example`
 */
export const BUILD_PERMISSION_RULESET: PermissionRuleset = [
  { permission: "*", pattern: "*", action: "allow" },
  { permission: "read", pattern: "*", action: "allow" },
  { permission: "read", pattern: "*.env", action: "ask" },
  { permission: "read", pattern: "*.env.*", action: "ask" },
  { permission: "read", pattern: "*.env.example", action: "allow" },
  { permission: "edit", pattern: "*.env", action: "ask" },
  { permission: "write", pattern: "*.env", action: "ask" },
];

/**
 * Default ruleset for `plan` mode (mirrors Entry Agents' `plan` agent in `packages/core/src/plugin/plan.ts`):
 * - Read-only exploration (`read`, `glob`, `grep`, `web_fetch`, `web_search` allowed)
 * - Disallows mutating `edit` / `write` / `bash` EXCEPT writing to the plan file inside `.entry/plan/*`
 */
export const PLAN_PERMISSION_RULESET: PermissionRuleset = [
  { permission: "*", pattern: "*", action: "allow" },
  { permission: "read", pattern: "*.env", action: "ask" },
  { permission: "read", pattern: "*.env.*", action: "ask" },
  { permission: "read", pattern: "*.env.example", action: "allow" },
  { permission: "bash", pattern: "*", action: "deny" },
  { permission: "edit", pattern: "*", action: "deny" },
  { permission: "write", pattern: "*", action: "deny" },
  { permission: "edit", pattern: "*.entry/plan/*.md", action: "allow" },
  { permission: "write", pattern: "*.entry/plan/*.md", action: "allow" },
  { permission: "edit", pattern: "*/.entry/plan/*.md", action: "allow" },
  { permission: "write", pattern: "*/.entry/plan/*.md", action: "allow" },
];

/**
 * Evaluates a permission ruleset in order (last matching rule wins, just like entry-agents).
 */
export function evaluatePermission(
  ruleset: PermissionRuleset,
  permission: string,
  target = "*",
): PermissionAction {
  let result: PermissionAction = "allow";
  const normalizedTarget = target.replace(/\\/g, "/");
  for (const rule of ruleset) {
    const permMatches =
      rule.permission === "*" || wildcardMatch(rule.permission, permission);
    const patternMatches =
      rule.pattern === "*" || wildcardMatch(rule.pattern, normalizedTarget);
    if (permMatches && patternMatches) {
      result = rule.action;
    }
  }
  return result;
}
