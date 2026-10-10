/**
 * Re-export the REAL Entry web DB modules - Project-B has no DB layer of
 * its own. The modules are vendored verbatim into `vendored-web/lib/db`
 * at deploy time from `apps/web/lib/db` (client, schema, sessions, usage),
 * so both surfaces run the same persistence code against the same
 * physical database. If web persistence logic changes, Project-B must
 * re-sync its vendored copies (single `cp -r`, no divergence by design).
 */
/* oxlint-disable oxc/no-barrel-file -- intentional: Project-B has no DB
   layer of its own and re-exports the vendored web modules so both
   surfaces run one persistence implementation against one database */
export * from "../../vendored-web/lib/db/client";
export * from "../../vendored-web/lib/db/schema";
export * from "../../vendored-web/lib/db/sessions";
export * from "../../vendored-web/lib/db/usage";
/* oxlint-enable oxc/no-barrel-file */
