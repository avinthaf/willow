import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import pg from "pg";

const client = new Client({ name: "willow-test", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: "npx",
    args: ["tsx", "--env-file=.env.local", "server.ts"],
  }),
);

const text = (r: any) => r.content.map((c: any) => c.text).join("\n");

console.log("tools:", (await client.listTools()).tools.map((t) => t.name));

const marker = `willow smoke test ${Date.now()}`;
console.log("save:", text(await client.callTool({
  name: "save_memory",
  arguments: { content: marker, kind: "test", agent: "test-server" },
})));

const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await db.connect();
const { rows } = await db.query(
  "SELECT id, embedding IS NOT NULL AS embedded, embedding_model FROM memories WHERE content = $1",
  [marker],
);
console.log("saved row:", rows);

console.log("\nsearch: how does the user like answers formatted");
console.log(text(await client.callTool({
  name: "search_memory",
  arguments: { query: "how does the user like answers formatted", limit: 3 },
})));

await db.query("DELETE FROM memories WHERE kind = 'test' AND agent = 'test-server'");
await db.end();
await client.close();
