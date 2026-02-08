import dotenv from "dotenv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment or .env file.");
  process.exit(1);
}

const migrationsDir = path.join(process.cwd(), "db", "migrations");
if (!fs.existsSync(migrationsDir)) {
  console.log("No migrations directory found.");
  process.exit(0);
}

const files = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  const fullPath = path.join(migrationsDir, file);
  const result = spawnSync(
    "psql",
    [process.env.DATABASE_URL, "-f", fullPath],
    { stdio: "inherit" }
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
