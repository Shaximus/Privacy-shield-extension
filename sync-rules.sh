#!/bin/bash
# Sync rules/blocklist.json → stats worker FULL_RULES array
# Single source of truth: blocklist.json
# Run standalone or called by build.sh

BLOCKLIST="rules/blocklist.json"
WORKER="../ai-shield-stats-worker.js"

if [ ! -f "$BLOCKLIST" ]; then
    echo "ERROR: $BLOCKLIST not found"
    exit 1
fi

if [ ! -f "$WORKER" ]; then
    echo "ERROR: $WORKER not found"
    exit 1
fi

# Convert JSON array to JS array format and inject into worker
# The worker has: const FULL_RULES = [ ... ];
# We replace everything between "const FULL_RULES = [" and the closing "];"

RULE_COUNT=$(python3 -c "
import json, sys

with open('$BLOCKLIST') as f:
    rules = json.load(f)

# Convert each rule to compact JS object notation
lines = []
for r in rules:
    # Build the JS object string
    parts = []
    parts.append(f'id: {r[\"id\"]}')
    parts.append(f'priority: {r[\"priority\"]}')

    # Action
    action = json.dumps(r['action'])
    parts.append(f'action: {action}')

    # Condition
    cond = json.dumps(r['condition'])
    parts.append(f'condition: {cond}')

    line = '  { ' + ', '.join(parts) + ' }'
    lines.append(line)

js_array = ',\n'.join(lines)

# Read the worker file
with open('$WORKER') as f:
    content = f.read()

# Find and replace the FULL_RULES array
import re
pattern = r'const FULL_RULES = \[.*?\];'
replacement = 'const FULL_RULES = [\n' + js_array + '\n];'
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('$WORKER', 'w') as f:
    f.write(new_content)

print(len(rules))
")

echo "Synced $RULE_COUNT rules from $BLOCKLIST → $WORKER"
