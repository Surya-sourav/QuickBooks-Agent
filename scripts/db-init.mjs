import dotenv from "dotenv";
import { spawnSync } from "node:child_process";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment or .env file.");
  process.exit(1);
}

const result = spawnSync(
  "psql",
  [process.env.DATABASE_URL, "-f", "db/schema.sql"],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
