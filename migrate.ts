import { readFileSync } from "node:fs";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();
await client.query(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
const { rows } = await client.query(
  "SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'memories' ORDER BY ordinal_position",
);
console.table(rows);
await client.end();
