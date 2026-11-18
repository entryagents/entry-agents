/**
 * Extracts a human-readable error message from SDK/HTTP errors that place
 * response payloads on `.text`, `.body`, or `.json` while keeping `.message`
 * generic (e.g. "Status code 400 is not ok").
 */
export function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      text?: unknown;
      json?: unknown;
    };

    const details =
      typeof candidate.text === "string" && candidate.text.trim().length > 0
        ? candidate.text.trim()
        : candidate.json && typeof candidate.json === "object"
          ? JSON.stringify(candidate.json)
          : "";

    const baseMessage =
      typeof candidate.message === "string" ? candidate.message : String(error);

    if (details && !baseMessage.includes(details)) {
      return `${baseMessage} (${details})`;
    }
    return baseMessage;
  }

  return String(error);
}
