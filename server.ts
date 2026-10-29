import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { z } from "zod";
import { EMBEDDING_MODEL, embed, toVector } from "./embed.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

// First write after idle can fail while Neon wakes the compute, so retry.
async function insertWithRetry(sql: string, params: unknown[], tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

const server = new McpServer({ name: "willow", version: "0.1.0" });

server.registerTool(
  "save_memory",
  {
    description:
      "Save a learning, preference, or piece of context to Willow's long-term memory. " +
      "Use it when you learn something about the user, the project, or a lesson worth keeping. " +
      "Write content as a standalone sentence or two.",
    inputSchema: {
      content: z.string().min(1).describe("The memory itself, as plain text"),
      kind: z
        .string()
        .optional()
        .describe("Loose tag such as preference, learning, decision, or context"),
      agent: z.string().optional().describe("Name of the agent saving this"),
      project: z.string().optional().describe("Project this memory belongs to"),
      session_id: z.string().optional().describe("Session the memory came from"),
      meta: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Any extra structured detail, such as source file paths, source_type, or version"),
      supersedes: z
        .number()
        .int()
        .optional()
        .describe("ID of an older memory this one corrects or replaces. The old one is marked superseded."),
      review_after: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("YYYY-MM-DD date to re-check this memory, for beta or fast-changing content"),
    },
  },
  async ({ content, kind, agent, project, session_id, meta, supersedes, review_after }) => {
    const params = [
      content, kind ?? null, agent ?? null, project ?? null, session_id ?? null, meta ?? {}, review_after ?? null,
    ];
    const insertSql = `INSERT INTO memories (content, kind, agent, project, session_id, meta, review_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;

    let id: number;
    if (supersedes === undefined) {
      id = (await insertWithRetry(insertSql, params)).rows[0].id;
    } else {
      // Insert the correction and retire the old row together, or neither.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const old = await client.query("SELECT project, status FROM memories WHERE id = $1 FOR UPDATE", [supersedes]);
        if (old.rows.length === 0) throw new Error(`Memory #${supersedes} does not exist`);
        if (old.rows[0].status !== "active") {
          throw new Error(`Memory #${supersedes} is already ${old.rows[0].status}`);
        }
        if (old.rows[0].project && old.rows[0].project !== (project ?? null)) {
          throw new Error(`Memory #${supersedes} belongs to project ${old.rows[0].project}, not ${project ?? "none"}`);
        }
        id = (await client.query(insertSql, params)).rows[0].id;
        await client.query(
          `UPDATE memories SET status = 'superseded', superseded_by = $1,
             status_reason = 'superseded by correction', status_changed_at = now() WHERE id = $2`,
          [id, supersedes],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    // The row is already saved. If embedding fails, `npm run backfill` catches up later.
    let note = "";
    try {
      const vector = toVector(await embed(content));
      await pool.query("UPDATE memories SET embedding = $1::vector, embedding_model = $2 WHERE id = $3", [
        vector,
        EMBEDDING_MODEL,
        id,
      ]);
    } catch (err) {
      note = " (embedding pending)";
      console.error(`embed failed for memory #${id}:`, err);
    }
    const sup = supersedes === undefined ? "" : ` (superseded #${supersedes})`;
    return { content: [{ type: "text", text: `Saved memory #${id}${sup}${note}` }] };
  },
);

server.registerTool(
  "flag_memory",
  {
    description:
      "Flag a memory as possibly stale or wrong, with a reason. Nothing is archived or hidden. " +
      "A human or janitor reviews flags later. To replace a memory, use save_memory with supersedes instead.",
    inputSchema: {
      id: z.number().int().describe("ID of the memory to flag"),
      reason: z.string().min(1).describe("Why it looks stale or wrong"),
    },
  },
  async ({ id, reason }) => {
    const { rowCount } = await pool.query(
      "UPDATE memories SET flag_reason = $2, flagged_at = now() WHERE id = $1",
      [id, reason],
    );
    return { content: [{ type: "text", text: rowCount ? `Flagged memory #${id}` : `Memory #${id} not found` }] };
  },
);

server.registerTool(
  "search_memory",
  {
    description:
      "Search Willow's long-term memory by meaning. Use it before starting work to recall " +
      "user preferences, project decisions, and past lessons. Ask in natural language.",
    inputSchema: {
      query: z.string().min(1).describe("What you want to recall, in natural language"),
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default 5)"),
      project: z.string().optional().describe("Only return memories from this project"),
      kind: z.string().optional().describe("Only return this kind, such as preference"),
    },
  },
  async ({ query, limit, project, kind }) => {
    const vector = toVector(await embed(query));
    const { rows } = await pool.query(
      `SELECT id, kind, project, content, created_at,
              round((1 - (embedding <=> $1::vector))::numeric, 3) AS similarity
       FROM memories
       WHERE embedding IS NOT NULL
         AND status = 'active'
         AND ($2::text IS NULL OR project = $2)
         AND ($3::text IS NULL OR kind = $3)
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [vector, project ?? null, kind ?? null, limit ?? 5],
    );
    const text = rows.length
      ? rows
          .map((r) => `#${r.id} [${r.kind ?? "-"} | ${r.project ?? "-"} | sim ${r.similarity}] ${r.content}`)
          .join("\n")
      : "No matching memories.";
    return { content: [{ type: "text", text }] };
  },
);

await server.connect(new StdioServerTransport());
