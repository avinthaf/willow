# Willow

Long-term shared memory for AI coding agents.

Agents call an MCP tool to save learnings, preferences and decisions into Neon Postgres.
Each memory is embedded on save with pgvector. Search is deferred on purpose.

## How it works

- `server.ts` is an MCP stdio server. It exposes `save_memory`.
- A save inserts a row into `memories`, then embeds it with OpenAI `text-embedding-3-small`.
- If embedding fails, the row is still saved. Run `npm run backfill` to catch up.
- `search_memory` exists in the code but is not advertised to agents yet.
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

The tool is deferred. Agents load it with `ToolSearch` using `select:mcp__willow__save_memory`.

## Make agents save reliably

Two pieces live in `hooks/`.

**Instructions.** Add this to `~/.claude/CLAUDE.md`.
It tells agents when to save, what to save, and how to tag it.
The same text is in `hooks/CLAUDE.snippet.md`.

````md
# Willow long-term memory

The `save_memory` tool (MCP server `willow`) stores learnings in a shared database.

The tool is deferred. Load it with `ToolSearch` using `select:mcp__willow__save_memory`.

Load it at the start of every session. Load it again at the start of any resumed or compacted session. A context reset drops the tool, so never assume it is still loaded.

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
- Put extras like file paths in `meta`.

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
| `meta` | no | Any JSON, such as file paths. |

Do not save secrets or credentials. Willow has no access control yet.

## Schema

One table, `memories`. See `schema.sql`.

- `id`, `created_at`
- `agent`, `project`, `session_id`, `kind`
- `content`, `meta` (jsonb)
- `embedding vector(1536)`, `embedding_model`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run migrate` | Applies `schema.sql`. |
| `npm run server` | Runs the MCP server directly. |
| `npm run backfill` | Embeds rows where `embedding IS NULL`. |

## Notes

- Neon's free tier autosuspends after 5 minutes. The first save after idle retries while it wakes.
- Switching embedding models means re-embedding. `embedding_model` records which one each row used.
- Classification and search strategy are deferred until there are many memories.
