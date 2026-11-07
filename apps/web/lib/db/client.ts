import type { DrizzleClient } from "./client-impl";
import { getClient } from "./client-impl";

// The drizzle client is created lazily on first property access and lives in
// client-impl.ts, which is marked "use step" (the workflow bundler requires
// the postgres client to sit in the Node step bundle). This facade keeps the
// `db.select` shape every call site uses.
export const db: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_, prop) {
    return Reflect.get(getClient(), prop);
  },
});
