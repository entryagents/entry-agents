import "server-only";

/**
 * Legacy cleanup hook for archived sessions that still carry a `modal` state row.
 * Modal runtime/SDK support has been retired in favor of Boxd workspaces, so
 * volume reclamation is now a safe no-op.
 */
export async function deleteModalSessionVolume(_volumeName: string) {
  // No-op: Modal provider and SDK removed; legacy sessions automatically migrate to Boxd on resume.
}
