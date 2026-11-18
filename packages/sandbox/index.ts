// interface
export type {
  ActiveCommandInfo,
  ExecResult,
  Sandbox,
  SandboxCheckpoint,
  SandboxExposedPort,
  SandboxHook,
  SandboxHooks,
  SandboxInfo,
  SandboxProxyRoute,
  SandboxStats,
  SandboxType,
  SnapshotResult,
} from "./interface.ts";

// migration (moving a session's workspace to a fresh sandbox ahead of
// its hard session-duration cap -- see lib/sandbox/migration.ts in
// apps/web)
export {
  packWorkspacePayload,
  restoreWorkspacePayload,
  type WorkspacePayload,
} from "./migrate.ts";

// shared types
export type { Source, FileEntry, SandboxStatus } from "./types.ts";

// factory
export {
  connectSandbox,
  type ConnectOptions,
  type SandboxConnectConfig,
} from "./factory.ts";

export type { SandboxState } from "./state.ts";

// provider registry -- provider metadata + capabilities are importable
// from a browser bundle (no provider SDKs pulled in), while the
// server-side bindings live behind ./registry.
export {
  SANDBOX_TYPES,
  SANDBOX_PROVIDER_METADATA,
  USER_SELECTABLE_SANDBOX_TYPES,
  CONTEXT_SANDBOX_TYPES,
  DEFAULT_SANDBOX_PROVIDER,
  BOXD_CAPABILITIES,
  MODAL_CAPABILITIES,
  LOCAL_CAPABILITIES,
  NOVITA_CAPABILITIES,
  getSandboxCapabilities,
  getSandboxProviderMetadata,
  isKnownSandboxType,
  isSelectableInContext,
  isUserSelectableSandboxType,
  listProvidersForContext,
  listUserSelectableSandboxProviders,
  type SandboxCapabilities,
  type SandboxProviderId,
  type SandboxProviderMetadata,
} from "./registry-types.ts";

export {
  SANDBOX_PROVIDERS,
  getSandboxProvider,
  requireSandboxProvider,
  requireAvailableSandboxProvider,
  UnsupportedSandboxProviderError,
  type BuildProvisionStateInput,
  type SandboxProvider,
} from "./registry.ts";

// git helpers
export {
  hasUncommittedChanges,
  stageAll,
  getCurrentBranch,
  getHeadSha,
  getStagedDiff,
  getChangedFiles,
  detectBinaryFiles,
  readFileContents,
  getFileModes,
  getSymlinkTarget,
  syncToRemote,
  syncToRemotePreservingChanges,
  withTemporaryGitHubAuth,
  withTemporaryVercelAuth,
  type FileChange,
  type FileChangeStatus,
  type FileWithContent,
} from "./git.ts";

// local
export type { LocalState } from "./local/state.ts";
// LocalSandbox/connectLocal load lazily (Node-only): see local/sandbox.ts.
export async function connectLocal(state: unknown, options?: unknown) {
  const m = await import("./local/sandbox.ts");
  return m.connectLocal(state as never, options as never);
}
export async function LocalSandboxLazy() {
  const m = await import("./local/sandbox.ts");
  return m.LocalSandbox;
}

// provider-neutral drive types (moved out of ./vercel/config.ts when
// Vercel was dropped; Modal volumes are drives too)
export type { DriveMountConfig, DriveMountSpec } from "./types.ts";

// Error-shape helper: some HTTP/RPC SDKs keep details on .text/.json while
// .message stays generic, so callers use toErrorMessage() instead of bare .message.
export { toErrorMessage } from "./error-utils.ts";

export async function listAllBoxdMachines(
  ...args: Parameters<
    (typeof import("./boxd/connect.ts"))["listAllBoxdMachines"]
  >
) {
  const m = await import("./boxd/connect.ts");
  return m.listAllBoxdMachines(...args);
}
export async function deleteAllBoxdMachines(
  ...args: Parameters<
    (typeof import("./boxd/connect.ts"))["deleteAllBoxdMachines"]
  >
) {
  const m = await import("./boxd/connect.ts");
  return m.deleteAllBoxdMachines(...args);
}

// durable background process registry & toolchain bootstrap
export {
  ENTRY_PIDS_DIR,
  ENTRY_PIDS_REGISTRY,
  buildDetachedSpawnScript,
  buildProcessStatusScript,
  buildKillProcessScript,
  type RegisteredSandboxProcess,
} from "./process-registry.ts";
export { buildToolchainBootstrapScript } from "./toolchain.ts";
