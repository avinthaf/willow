import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";

const openai = new OpenAI({ timeout: 10_000, maxRetries: 1 });

export async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    // Stay well under the model's 8191-token input cap.
    input: text.slice(0, 8000),
    encoding_format: "float",
  });
  return res.data[0].embedding;
}

// pgvector accepts a JSON array string cast to ::vector.
export const toVector = (v: number[]) => JSON.stringify(v);
