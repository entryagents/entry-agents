/**
 * Parses a GitHub repository URL or `owner/repo` shorthand into `{ owner, repo }`.
 * Returns `null` when the input does not match a valid GitHub repository reference.
 */
export function parseGithubRepoInput(
  rawValue: string,
): { owner: string; repo: string } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  // Allow owner/repo shorthand (e.g. "vercel/next.js")
  const shorthandMatch = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.exec(trimmed);
  if (shorthandMatch) {
    const owner = shorthandMatch[1];
    const repo = shorthandMatch[2]?.replace(/\.git$/i, "");
    if (owner && repo && owner !== "github.com") {
      return { owner, repo };
    }
  }

  // Allow full or protocol-less GitHub URLs
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return null;
    }
    const segments = url.pathname
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length < 2) return null;
    const owner = segments[0];
    const repo = segments[1]?.replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}
