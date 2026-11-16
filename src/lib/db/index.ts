import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "@/lib/env";

let pool: Pool | undefined;

export function getDbPool() {
  if (!pool) {
    const { DATABASE_URL } = getEnv();
    pool = new Pool({ connectionString: DATABASE_URL });
  }

  return pool;
}

export function getDb() {
  return drizzle(getDbPool());
}
