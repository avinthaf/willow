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
