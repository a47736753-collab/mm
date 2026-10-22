import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../drizzle/schema";

let _pgDb: ReturnType<typeof drizzle> | null = null;
let _pool: pg.Pool | null = null;

export async function getPgDb() {
  if (!_pgDb && process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith("postgres://") || process.env.DATABASE_URL.startsWith("postgresql://"))) {
    try {
      _pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      _pgDb = drizzle(_pool, { schema });
    } catch (err) {
      console.warn("[PostgreSQL] Failed to connect:", err);
      _pgDb = null;
    }
  }
  return _pgDb;
}
