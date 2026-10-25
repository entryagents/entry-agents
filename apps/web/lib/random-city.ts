/**
 * Developer-focused session title generator.
 * Replaces legacy random city names with clean, contextual workspace names.
 */

export interface SessionTitleOptions {
  repoName?: string | null;
  initialPrompt?: string | null;
}

/**
 * Derives a clean, concise default title for a session before AI title generation completes.
 * Uses repository context or clean developer placeholders ("New Session", "New Session 2", etc.).
 * Never uses random world cities.
 */
export function getDefaultSessionTitle(
  usedNames: Set<string>,
  options?: SessionTitleOptions,
): string {
  // 1. If repoName is provided, use repo name if available
  if (options?.repoName && options.repoName.trim()) {
    const cleanRepo = options.repoName.trim();
    if (!usedNames.has(cleanRepo)) {
      return cleanRepo;
    }
    let suffix = 2;
    while (usedNames.has(`${cleanRepo} (${suffix})`)) {
      suffix++;
    }
    return `${cleanRepo} (${suffix})`;
  }

  // 2. If an initial prompt was given, extract a clean fallback title
  if (options?.initialPrompt && options.initialPrompt.trim()) {
    const fallback = sanitizePromptToTitle(options.initialPrompt);
    if (fallback && !usedNames.has(fallback)) {
      return fallback;
    }
  }

  // 3. Fall back to clean "New Session", "New Session 2", etc.
  const base = "New Session";
  if (!usedNames.has(base)) {
    return base;
  }

  let suffix = 2;
  while (usedNames.has(`${base} ${suffix}`)) {
    suffix++;
  }
  return `${base} ${suffix}`;
}

/**
 * Backward compatibility export for callers expecting getRandomCityName.
 * Now returns clean developer session titles rather than random cities.
 */
export function getRandomCityName(
  usedNames: Set<string>,
  context?: { repoName?: string },
): string {
  return getDefaultSessionTitle(usedNames, context);
}

/**
 * Quick local sanitizer that turns a user prompt into a clean 3-6 word title
 * when AI title generation is slow, rate-limited, or unavailable.
 */
export function sanitizePromptToTitle(prompt: string): string {
  let cleaned =
    prompt
      .trim()
      .replace(/^[`'"]+|[`'"]+$/g, "")
      // Remove common conversational opening phrases
      .replace(
        /^(can you\s+(please\s+)?(help\s+(me\s+)?with\s+|to\s+)?|please\s+|hey\s+|hi\s+|hello\s+|let's\s+|let\s+us\s+|let\s+me\s+|i\s+want\s+to\s+|i\s+need\s+to\s+|could\s+you\s+)/i,
        "",
      )
      .replace(
        /^(build\s+a\s+|create\s+a\s+|make\s+a\s+|add\s+a\s+)/i,
        (match) => {
          // Capitalize verb
          return match.charAt(0).toUpperCase() + match.slice(1);
        },
      )
      .split("\n")[0]
      ?.trim() ?? "";

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.?!,:;]+$/, "").trim();

  if (cleaned.length === 0) {
    return "New Session";
  }

  // Capitalize first character
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  if (cleaned.length > 50) {
    const truncated = cleaned.slice(0, 48);
    const lastSpace = truncated.lastIndexOf(" ");
    cleaned =
      (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "...";
  }

  return cleaned;
}
