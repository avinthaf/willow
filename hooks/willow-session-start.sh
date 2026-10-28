#!/bin/bash
# Remind the agent to load Willow's deferred save_memory tool at session start.
jq -n '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: "Willow memory: load the save_memory tool now with ToolSearch (query \"select:mcp__willow__save_memory\"), then call it whenever you learn a preference, decision, or lesson. A Stop hook will ask you to save if you have not."}}'
