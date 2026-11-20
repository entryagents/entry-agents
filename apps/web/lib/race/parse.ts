import type { ModelOption } from "@/lib/model-options";

export type ParsedRaceCommand =
  | { kind: "empty" }
  | { kind: "start"; task: string };

/**
 * Parses `/race <task>`. Returns null if the message is not a `/race` command.
 */
export function parseRaceCommand(text: string): ParsedRaceCommand | null {
  const trimmed = text.trim();
  if (!/^\/race(?:\s|$)/i.test(trimmed)) {
    return null;
  }
  const task = trimmed.slice("/race".length).trim();
  if (!task) {
    return { kind: "empty" };
  }
  return { kind: "start", task };
}

/**
 * Picks two model IDs for a side-by-side race: the active model on the left,
 * and a distinct model from `modelOptions` on the right when available.
 */
export function pickRaceModels(
  currentModelId: string,
  modelOptions: readonly ModelOption[],
): [string, string] {
  const left = currentModelId || modelOptions[0]?.id || "";
  const rightOption =
    modelOptions.find((m) => m.id !== left) ?? modelOptions[0];
  const right = rightOption?.id ?? left;
  return [left, right];
}
