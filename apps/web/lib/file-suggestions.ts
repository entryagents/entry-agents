import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";

/**
 * Extract the @ mention from input text at the cursor position
 * Returns the partial path after @ or null if not in a mention
 */
export function extractMention(
  text: string,
  cursorPosition: number,
): { mentionStart: number; partialPath: string } | null {
  // Find the @ symbol before cursor
  let atIndex = -1;
  for (let i = cursorPosition - 1; i >= 0; i--) {
    const char = text[i];
    if (char === undefined) break;
    // Stop at whitespace - no mention
    if (char === " " || char === "\t" || char === "\n") {
      break;
    }
    if (char === "@") {
      atIndex = i;
      break;
    }
  }

  if (atIndex === -1) {
    return null;
  }

  const partialPath = text.slice(atIndex + 1, cursorPosition);
  return { mentionStart: atIndex, partialPath };
}

export const AGENT_MENTION_SUGGESTIONS: FileSuggestion[] = [
  {
    value: "team",
    display: "@team",
    isDirectory: false,
    kind: "team",
    description:
      "Coordinate all specialists in the main chat with dependency waves and @role handoffs",
  },
  {
    value: "architect",
    display: "@architect",
    isDirectory: false,
    kind: "agent",
    description:
      "System architecture, interface contracts, and file ownership boundaries",
  },
  {
    value: "explorer",
    display: "@explorer",
    isDirectory: false,
    kind: "agent",
    description:
      "Fast read-only codebase search, symbol discovery, and dependency mapping",
  },
  {
    value: "executor",
    display: "@executor",
    isDirectory: false,
    kind: "agent",
    description:
      "Focused code implementation, refactoring, and test/typecheck verification",
  },
  {
    value: "design",
    display: "@design",
    isDirectory: false,
    kind: "agent",
    description:
      "UI/UX layout craft, responsive breakpoints, typography, and motion",
  },
  {
    value: "reviewer",
    display: "@reviewer",
    isDirectory: false,
    kind: "agent",
    description:
      "Pre-merge correctness, security, edge cases, and regression audit",
  },
];

/**
 * Filter @ mention suggestions (specialist agents + repository files) based on a partial path
 * Returns max results for performance
 */
export function filterFileSuggestions(
  files: FileSuggestion[],
  partialPath: string,
  maxResults: number = 50,
): FileSuggestion[] {
  const query = partialPath.toLowerCase();
  const results: FileSuggestion[] = [];

  for (const agent of AGENT_MENTION_SUGGESTIONS) {
    if (
      !query ||
      agent.value.toLowerCase().includes(query) ||
      (agent.description?.toLowerCase().includes(query) ?? false)
    ) {
      results.push(agent);
      if (results.length >= maxResults) return results;
    }
  }

  if (!query) {
    // Show top-level items when no query
    for (const f of files) {
      if (
        !f.value.includes("/") ||
        (f.isDirectory && !f.value.slice(0, -1).includes("/"))
      ) {
        results.push(f);
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }

  // Filter files that match the query
  for (const f of files) {
    if (f.value.toLowerCase().includes(query)) {
      results.push(f);
      if (results.length >= maxResults) break;
    }
  }
  return results;
}
