import { migrate } from "drizzle-orm/neon-http/migrator";
import { getDb } from "../db";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not configured; skipping database migrations for this build.");
} else {
  await migrate(getDb(), { migrationsFolder: "drizzle-pg" });
  console.log("Database migrations complete.");
}
