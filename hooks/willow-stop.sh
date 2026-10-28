#!/bin/bash
# Block a Stop when Willow memory is missing.
# Blocks if (a) nothing was ever saved this session, or
# (b) files changed since the latest user prompt with no save after that prompt.
input=$(cat)

# Second pass: the agent already got the nudge, so let it stop.
[ "$(echo "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

transcript=$(echo "$input" | jq -r '.transcript_path // empty')
[ -z "$transcript" ] || [ ! -f "$transcript" ] && exit 0

verdict=$(jq -rs '
  to_entries as $e
  | ($e | map(select(
        .value.type == "user"
        and (.value.isMeta | not)
        and (.value.isCompactSummary | not)
        and ((.value.message.content | type) == "string"
             or (.value.message.content[0].type != "tool_result"))
      )) | last | .key // -1) as $last
  | [ $e[] | select(.value.type == "assistant")
      | {k: .key, names: [.value.message.content[]? | select(.type == "tool_use") | .name]} ] as $a
  | ($a | map(select(.names | index("mcp__willow__save_memory"))) | length > 0) as $savedEver
  | ($a | map(select(.k > $last and (.names | index("mcp__willow__save_memory")))) | length > 0) as $savedSince
  | ($a | map(select(.k > $last and (.names | any(. == "Edit" or . == "Write" or . == "NotebookEdit")))) | length > 0) as $changed
  | if ((($changed) and ($savedSince | not)) or ($savedEver | not)) then "block" else "ok" end
' "$transcript" 2>/dev/null)

[ "$verdict" = "block" ] || exit 0

jq -n '{decision: "block", reason: "Willow memory is missing for this request. Call save_memory now: one entry for what you learned, plus a separate decision entry (with the reason) for anything the user directed. If the tool is not loaded, even in a resumed or compacted session, load it first with ToolSearch (select:mcp__willow__save_memory). Then finish."}'
