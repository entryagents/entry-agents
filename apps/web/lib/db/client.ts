import type { DrizzleClient } from "./client-impl";
import { getClient } from "./client-impl";

// The drizzle client is created lazily on first property access inside Node
// API routes and "use step" functions. This facade keeps the `db.select`
// shape every call site uses.
export const db: DrizzleClient = new Proxy({} as DrizzleClient, {
  get(_, prop) {
    return Reflect.get(getClient(), prop);
  },
});
