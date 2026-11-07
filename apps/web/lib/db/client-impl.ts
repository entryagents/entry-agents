"use step";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleClient | null = null;

function makeClient(): DrizzleClient {
  if (!_db) {
    if (!process.env.POSTGRES_URL) {
      throw new Error("POSTGRES_URL environment variable is required");
    }
    const client = postgres(process.env.POSTGRES_URL);
    _db = drizzle(client, { schema });
  }
  return _db;
}

export function getClient(): DrizzleClient {
  return makeClient();
}

export type { DrizzleClient };
