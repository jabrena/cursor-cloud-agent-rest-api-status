#!/bin/bash

# Store start timestamp
PROMPT_EXECUTION_START=$(date +%Y%m%d%H%M%S)

# Print Hello World
echo "Hello World"

# Store end timestamp
PROMPT_EXECUTION_END=$(date +%Y%m%d%H%M%S)

# Calculate difference in seconds
# Convert timestamps to epoch seconds for calculation
START_EPOCH=$(date -d "${PROMPT_EXECUTION_START:0:4}-${PROMPT_EXECUTION_START:4:2}-${PROMPT_EXECUTION_START:6:2} ${PROMPT_EXECUTION_START:8:2}:${PROMPT_EXECUTION_START:10:2}:${PROMPT_EXECUTION_START:12:2}" +%s 2>/dev/null)
END_EPOCH=$(date -d "${PROMPT_EXECUTION_END:0:4}-${PROMPT_EXECUTION_END:4:2}-${PROMPT_EXECUTION_END:6:2} ${PROMPT_EXECUTION_END:8:2}:${PROMPT_EXECUTION_END:10:2}:${PROMPT_EXECUTION_END:12:2}" +%s 2>/dev/null)

if [ -n "$START_EPOCH" ] && [ -n "$END_EPOCH" ]; then
    DIFF=$((END_EPOCH - START_EPOCH))
else
    # Fallback: if date parsing fails, use 0 (execution is very fast)
    DIFF=0
fi

# Store execution time with " seconds" suffix
PROMPT_EXECUTION_TIME="${DIFF} seconds"

# Create JSON object
RESULT=$(cat <<EOF
{
  "prompt-execution-ts-start": "${PROMPT_EXECUTION_START}",
  "prompt-execution-ts-end": "${PROMPT_EXECUTION_END}",
  "prompt-execution-duration": "${PROMPT_EXECUTION_TIME}"
}
EOF
)

# Output XML fragment
echo "<result>${RESULT}</result>"
