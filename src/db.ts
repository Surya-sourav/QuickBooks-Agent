import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export const query = <T = any>(text: string, params?: any[]) => {
  return pool.query<T>(text, params);
};

export const withClient = async <T>(fn: (client: pg.PoolClient) => Promise<T>) => {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};
