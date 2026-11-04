/**
 * Type-only stub for `@entry-agents/sandbox` in Project-B. The desktop
 * backend never imports sandbox RUNTIME code — only the `SandboxState`
 * JSON shape that lives in the shared schema. This stub is resolved
 * FIRST via tsconfig `paths` and prevents the whole sandbox package
 * (Vercel/Boat runtimes, .ts-extension imports) entering the build.
 */
declare module "@entry-agents/sandbox" {
  export type SandboxState = {
    state: string;
    [key: string]: unknown;
  };
}
