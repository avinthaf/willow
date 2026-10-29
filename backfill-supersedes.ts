import pg from "pg";

// Links old memories to the corrections that name them ("supersedes #123").
// Dry run by default. Pass --apply to write.
const apply = process.argv.includes("--apply");

const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await db.connect();

const { rows } = await db.query(
  "SELECT id, content FROM memories WHERE content ~* 'supersed(es|ing) +#[0-9]' ORDER BY id",
);

const phrase = /supersed(?:es|ing)\s+((?:#\d+(?:\s*(?:,|and|&)\s*)?)+)/gi;
let linked = 0;
for (const row of rows) {
  const ids = new Set<number>();
  for (const m of row.content.matchAll(phrase)) {
    for (const n of m[1].matchAll(/#(\d+)/g)) ids.add(Number(n[1]));
  }
  for (const oldId of ids) {
    const { rows: old } = await db.query("SELECT id, status FROM memories WHERE id = $1", [oldId]);
    const skip =
      old.length === 0 ? "missing"
      : oldId >= row.id ? "not older"
      : old[0].status !== "active" ? `already ${old[0].status}`
      : null;
    if (skip) {
      console.log(`skip   #${oldId} <- #${row.id} (${skip})`);
      continue;
    }
    console.log(`${apply ? "link  " : "would "} #${oldId} <- #${row.id}`);
    if (apply) {
      await db.query(
        `UPDATE memories SET status = 'superseded', superseded_by = $1,
           status_reason = 'backfilled from correction text', status_changed_at = now() WHERE id = $2`,
        [row.id, oldId],
      );
    }
    linked++;
  }
}
console.log(`${apply ? "linked" : "would link"} ${linked}${apply ? "" : " (re-run with --apply)"}`);
await db.end();
