# Willow

Long-term shared memory for AI coding agents.

Agents call an MCP tool to save learnings, preferences and decisions into Neon Postgres.
Each memory is embedded on save with pgvector. Agents recall them with semantic search.

## How it works

- `server.ts` is an MCP stdio server. It exposes `save_memory`.
- A save inserts a row into `memories`, then embeds it with OpenAI `text-embedding-3-small`.
- If embedding fails, the row is still saved. Run `npm run backfill` to catch up.
- `search_memory` finds active memories by meaning. `flag_memory` flags suspect rows.
- Hooks make agents actually save. Instructions alone were not enough.

## Setup

You need Node 20+, a Neon project, and an OpenAI API key.

1. Install dependencies.

   ```sh
   npm install
   ```

2. Create `.env.local` from the example and fill it in.

   ```sh
   cp .env.example .env.local
   ```

   Get both connection strings from the Neon dashboard. Use the pooled one for `DATABASE_URL`.

3. Create the table.

   ```sh
   npm run migrate
   ```

   This enables `pgvector` and creates `memories`. It is safe to re-run.

4. Check it works end to end.

   ```sh
   npx tsx --env-file=.env.local test-server.ts
   ```

   It saves a row, checks it was embedded, and cleans up its test rows.

## Connect an agent (Claude Code)

Register the server at user scope. Use absolute paths.

```sh
claude mcp add willow --scope user -- \
  /ABS/PATH/TO/willow/node_modules/.bin/tsx \
  --env-file=/ABS/PATH/TO/willow/.env.local \
  /ABS/PATH/TO/willow/server.ts
```

Restart Claude Code. A server added mid-session only loads after a restart.

The tools are deferred. Agents load them with `ToolSearch` using `select:mcp__willow__save_memory,mcp__willow__search_memory,mcp__willow__flag_memory`.

## Make agents save reliably

Two pieces live in `hooks/`.

**Instructions.** Add this to `~/.claude/CLAUDE.md`.
It tells agents when to save, what to save, and how to tag it.
The same text is in `hooks/CLAUDE.snippet.md`.

````md
# Willow long-term memory

The `save_memory`, `search_memory` and `flag_memory` tools (MCP server `willow`) store and recall learnings in a shared database.

The tools are deferred. Load them with `ToolSearch` using `select:mcp__willow__save_memory,mcp__willow__search_memory,mcp__willow__flag_memory`.

Load them at the start of every session. Load them again at the start of any resumed or compacted session. A context reset drops the tools, so never assume they are still loaded.

When to search:

- At the start of a task, call `search_memory` for relevant preferences, decisions and lessons. Search all projects. Many learnings apply everywhere. Pass `project` only to narrow a noisy result.
- Before saving something that might correct an older memory, search for it first. If one matches, save with `supersedes` set to its ID.
- Superseded memories are hidden from search, so ignore any you remember seeing.

When to save. This is a rule, not a suggestion:

- Every user request that changes files counts as a finished task. That includes small ones, like a single script.
- After each finished task, fix, or learned preference, call `save_memory` before you reply.
- Save at least one memory for any task that took more than a few steps.
- If a session ends a task with no memory saved, save one before you do anything else.

Decisions get their own entry:

- When the user directs something, such as "make a gitignored scripts folder", save it as its own `decision` entry. Include the reason.
- Never fold a decision into another note.

Call it when you learn something worth keeping across sessions:

- A user preference, such as communication style, level of expertise, or how they like to learn
- A project convention, coding standard, or decision, plus the reason behind it
- A lesson from a bug, failed approach, or surprising behavior
- Context that would help a new teammate or a fresh agent

How to save:

- Write `content` as a standalone sentence or two. It must make sense with no other context.
- Set `kind` to one of: `preference`, `learning`, `decision`, `context`.
- Set `project` to the project folder name and `agent` to `claude-code`.
- Put extras like file paths in `meta`. Include `source_type` (docs, video, book, or inference) and `version` (such as iOS 26 or Swift 5.8) when they apply.
- For beta or fast-changing content, set `review_after` to a YYYY-MM-DD date.

Stale or wrong memories:

- To correct a memory, call `save_memory` with `supersedes` set to the old ID. The old one is marked superseded. It can be in any project.
- After a save with `supersedes`, check the reply. `Saved memory #N (superseded #M)` means it linked. A bare `Saved memory #N` means it did not, so tell the user the server may be outdated.
- If a memory looks stale but you cannot replace it, call `flag_memory` with the ID and a reason.
- Never delete or archive memories yourself. A human does that.

Do not save secrets, credentials, or trivial details. Do not announce each save. Save quietly and keep working.
````

**Hooks.** Copy the scripts and make them executable. Both need `jq`.

```sh
mkdir -p ~/.claude/hooks
cp hooks/willow-*.sh ~/.claude/hooks/
chmod +x ~/.claude/hooks/willow-*.sh
```

Then add this to `~/.claude/settings.json`. Merge it with any existing `hooks` block.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/willow-session-start.sh" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "~/.claude/hooks/willow-stop.sh" }] }
    ]
  }
}
```

- `willow-session-start.sh` reminds the agent to load the tool.
- `willow-stop.sh` blocks the stop once if no memory was saved.
  It blocks when nothing was saved all session, or when files changed since the last prompt with no save after it.
- Known gap: file changes made only through Bash are not counted.

Other MCP-capable agents can use the same server. They need their own equivalent of the instructions and hooks.

## The `save_memory` tool


| Field | Required | Notes |
| --- | --- | --- |
| `content` | yes | Standalone sentence or two. |
| `kind` | no | `preference`, `learning`, `decision`, or `context`. |
| `project` | no | Project folder name. |
| `agent` | no | For example `claude-code`. |
| `session_id` | no | Session the memory came from. |
| `meta` | no | Any JSON, such as file paths, `source_type`, `version`. |
| `supersedes` | no | ID of an older memory this one replaces. The old one becomes `superseded`. |
| `review_after` | no | `YYYY-MM-DD` date to re-check beta or fast-changing content. |

`flag_memory(id, reason)` marks a memory as possibly stale. It does not hide or change it.

## The `search_memory` tool

| Field | Required | Notes |
| --- | --- | --- |
| `query` | yes | Natural language. |
| `limit` | no | 1 to 20. Default 5. |
| `project` | no | Only this project. Omit to search all, which is the default agents should use. |
| `kind` | no | Only this kind, such as `preference`. |

Results include IDs and a similarity score. Superseded and archived rows are hidden.

Do not save secrets or credentials. Willow has no access control yet.

## Stale memories

Agents can supersede and flag. They cannot archive or delete.

- **Supersede:** save a correction with `supersedes`. Both changes happen in one transaction.
  Only active memories can be superseded, in any project.
- **Flag:** `flag_memory` records a reason. A human or a later janitor reviews flags.
- **Archive and delete:** by hand in SQL. `status` is `active`, `superseded` or `archived`.
- Search returns only `active` rows.

Old corrections that only name the entry in text can be linked after the fact.

```sh
npm run backfill-supersedes             # dry run
npm run backfill-supersedes -- --apply  # write
```

## Schema

One table, `memories`. See `schema.sql`.

- `id`, `created_at`
- `agent`, `project`, `session_id`, `kind`
- `content`, `meta` (jsonb)
- `embedding vector(1536)`, `embedding_model`
- `status`, `superseded_by`, `status_reason`, `status_changed_at`
- `review_after`, `flag_reason`, `flagged_at`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run migrate` | Applies `schema.sql`. |
| `npm run server` | Runs the MCP server directly. |
| `npm run backfill` | Embeds rows where `embedding IS NULL`. |
| `npm run backfill-supersedes` | Links corrections to the entries they replace. Dry run unless `--apply`. |

## Notes

- Neon's free tier autosuspends after 5 minutes. The first save after idle retries while it wakes.
- Switching embedding models means re-embedding. `embedding_model` records which one each row used.
- Search is plain cosine similarity for now. Classification and ranking are not designed yet.
