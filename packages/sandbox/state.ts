import type { LocalState } from "./local/state.ts";
import type { BoxdState } from "./boxd/state.ts";
import type { Source } from "./types.ts";

/** Legacy state shape retained only for migrating retired Modal rows to Boxd. */
export interface ModalState {
  sandboxId?: string;
  volumeName?: string;
  source?: Source;
  expiresAt?: number;
  createdAt?: number;
}

/** Legacy state shape retained only for migrating retired Novita rows to Boxd. */
export interface NovitaState {
  sandboxId: string;
  template?: string;
  source?: Source;
  expiresAt?: number;
  createdAt?: number;
}

/**
 * Unified sandbox state type. Use the `type` discriminator to determine
 * which sandbox implementation to use. Persisted verbatim in
 * `sessions.sandbox_state` (jsonb), so the discriminator is the durable
 * record of which provider owns a session.
 *
 * "boxd" -- persistent hardware-isolated Linux workspace machine.
 *
 * "novita" -- retired legacy Firecracker microVM state (auto-migrates to Boxd).
 *
 * "modal" -- retired legacy Modal container state (auto-migrates to Boxd).
 *
 * "local" -- plain local directory + child_process, no remote
 * provisioning. Only used by local dev/test tooling.
 */
export type SandboxState =
  | ({ type: "boxd" } & BoxdState)
  | ({ type: "novita" } & NovitaState)
  | ({ type: "modal" } & ModalState)
  | ({ type: "local" } & LocalState);
