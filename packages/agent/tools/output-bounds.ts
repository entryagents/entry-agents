export const DEFAULT_TOOL_MODEL_OUTPUT_MAX_CHARS = 16_000;

export function truncateMiddle(
  text: string,
  maxChars = DEFAULT_TOOL_MODEL_OUTPUT_MAX_CHARS,
  label = "tool output",
): string {
  if (text.length <= maxChars) {
    return text;
  }
  const headChars = Math.max(200, Math.floor(maxChars * 0.65));
  const tailChars = Math.max(200, maxChars - headChars - 160);
  const omitted = Math.max(0, text.length - headChars - tailChars);
  return (
    `${text.slice(0, headChars)}\n\n` +
    `[... ${omitted} chars of ${label} omitted to keep context bounded; original length=${text.length} chars. Narrow your query, use pagination/limits, or pipe to a file if full output is needed. ...]\n\n` +
    `${text.slice(-tailChars)}`
  );
}

export function serializeBoundedForModel(
  output: unknown,
  options?: { maxChars?: number; label?: string },
): { type: "text"; value: string } {
  const maxChars = options?.maxChars ?? DEFAULT_TOOL_MODEL_OUTPUT_MAX_CHARS;
  const label = options?.label ?? "tool output";
  let serialized: string;
  if (typeof output === "string") {
    serialized = output;
  } else {
    try {
      serialized = JSON.stringify(output, null, 2) ?? String(output);
    } catch {
      serialized = String(output);
    }
  }
  return {
    type: "text",
    value: truncateMiddle(serialized, maxChars, label),
  };
}
