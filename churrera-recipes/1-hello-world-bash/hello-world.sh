#!/bin/bash

# Step 1: Measure the execution time (start)
PROMPT_EXECUTION_START=$(date +%Y%m%d%H%M%S)

# Step 2: Print "Hello World" in the console
echo "Hello World"

# Step 3: Measure the execution time (end)
PROMPT_EXECUTION_END=$(date +%Y%m%d%H%M%S)

# Calculate the difference in seconds
# Convert YYYYMMDDHHMMSS to YYYY-MM-DD HH:MM:SS format, then to Unix timestamp
START_FORMATTED="${PROMPT_EXECUTION_START:0:4}-${PROMPT_EXECUTION_START:4:2}-${PROMPT_EXECUTION_START:6:2} ${PROMPT_EXECUTION_START:8:2}:${PROMPT_EXECUTION_START:10:2}:${PROMPT_EXECUTION_START:12:2}"
END_FORMATTED="${PROMPT_EXECUTION_END:0:4}-${PROMPT_EXECUTION_END:4:2}-${PROMPT_EXECUTION_END:6:2} ${PROMPT_EXECUTION_END:8:2}:${PROMPT_EXECUTION_END:10:2}:${PROMPT_EXECUTION_END:12:2}"
START_EPOCH=$(date -d "$START_FORMATTED" +%s)
END_EPOCH=$(date -d "$END_FORMATTED" +%s)
PROMPT_EXECUTION_TIME=$((END_EPOCH - START_EPOCH))" seconds"

# Output the result in XML format with JSON
RESULT=$(cat <<EOF
{
  "prompt-execution-ts-start": "$PROMPT_EXECUTION_START",
  "prompt-execution-ts-end": "$PROMPT_EXECUTION_END",
  "prompt-execution-duration": "$PROMPT_EXECUTION_TIME"
}
EOF
)

echo "<result>$RESULT</result>"
