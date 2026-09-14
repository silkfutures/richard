import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "../db";

if (!process.env.DATABASE_URL && !process.env.STORAGE_DATABASE_URL && !process.env.STORAGE_POSTGRES_URL) {
  console.log("No Postgres database URL is configured; skipping database migrations for this build.");
} else {
  await migrate(getDb(), { migrationsFolder: "drizzle-pg" });
  console.log("Database migrations complete.");
}
