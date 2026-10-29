# Willow long-term memory

The `save_memory`, `search_memory` and `flag_memory` tools (MCP server `willow`) store and recall learnings in a shared database.

The tools are deferred. Load them with `ToolSearch` using `select:mcp__willow__save_memory,mcp__willow__search_memory,mcp__willow__flag_memory`.

Load them at the start of every session. Load them again at the start of any resumed or compacted session. A context reset drops the tools, so never assume they are still loaded.

When to search:

- At the start of a task, call `search_memory` for relevant preferences, decisions and lessons. Pass `project` unless you want results from every project.
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

- To correct a memory, call `save_memory` with `supersedes` set to the old ID. The old one is marked superseded. Stay within the same project.
- If a memory looks stale but you cannot replace it, call `flag_memory` with the ID and a reason.
- Never delete or archive memories yourself. A human does that.

Do not save secrets, credentials, or trivial details. Do not announce each save. Save quietly and keep working.
