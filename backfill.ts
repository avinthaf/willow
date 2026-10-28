import OpenAI from "openai";
import pg from "pg";

const MODEL = "text-embedding-3-small";
const BATCH = 100;

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing from .env.local");
  process.exit(1);
}

const openai = new OpenAI();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await db.connect();

let done = 0;
for (;;) {
  const { rows } = await db.query(
    "SELECT id, content FROM memories WHERE embedding IS NULL ORDER BY id LIMIT $1",
    [BATCH],
  );
  if (rows.length === 0) break;

  const res = await openai.embeddings.create({
    model: MODEL,
    // Stay well under the model's 8191-token input cap.
    input: rows.map((r) => r.content.slice(0, 8000)),
    encoding_format: "float",
  });

  for (const item of res.data) {
    await db.query("UPDATE memories SET embedding = $1::vector, embedding_model = $2 WHERE id = $3", [
      JSON.stringify(item.embedding),
      MODEL,
      rows[item.index].id,
    ]);
  }
  done += rows.length;
  console.log(`embedded ${done} (tokens this batch: ${res.usage.total_tokens})`);
}

console.log(done === 0 ? "nothing to embed" : `done, ${done} rows embedded`);
await db.end();
