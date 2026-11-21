export type ParsedCompactCommand = {
  kind: "compact";
  focus?: string;
};

/**
 * Parses `/compact` or `/compact <focus instructions>`.
 * Returns `null` if the message is not a `/compact` command.
 */
export function parseCompactCommand(text: string): ParsedCompactCommand | null {
  const trimmed = text.trim();
  const match = /^\/compact(?:\s+([\s\S]+))?$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  const focus = match[1]?.trim();
  return focus ? { kind: "compact", focus } : { kind: "compact" };
}
