import postgres from "postgres";

let _sql: postgres.Sql | null = null;

export function getSql(): postgres.Sql {
  if (!_sql) {
    const url = process.env.POSTGRES_URL;
    if (!url) {
      throw new Error("POSTGRES_URL environment variable is required");
    }
    _sql = postgres(url, { prepare: false, max: 5 });
  }
  return _sql;
}
