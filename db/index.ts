import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let database: ReturnType<typeof createDb> | null = null;

function createDb() {
  const connectionString = process.env.DATABASE_URL || process.env.STORAGE_DATABASE_URL || process.env.STORAGE_POSTGRES_URL;
  if (!connectionString) {
    throw new Error("No Postgres database URL is configured.");
  }
  return drizzle(neon(connectionString), { schema });
}

export function getDb() {
  database ??= createDb();
  return database;
}
