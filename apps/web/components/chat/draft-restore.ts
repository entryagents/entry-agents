/**
 * Merges a rewound user message's text back into the composer above any
 * already-typed draft, matching Sable's `Again.tsx` behavior ("Something
 * already typed is kept under the message, not replaced by it.").
 */
export function mergeRestoredDraftText(
  restoredText: string,
  existingDraft: string,
): string {
  if (!existingDraft.trim()) {
    return restoredText;
  }
  if (!restoredText) {
    return existingDraft;
  }
  return `${restoredText}\n\n${existingDraft}`;
}
