#!/bin/bash

# Store start timestamp in format YYYYMMDDHHMMSS
PROMPT_EXECUTION_START=$(date +%Y%m%d%H%M%S)
START_EPOCH=$(date +%s)

# Print "Hello World"
echo "Hello World"

# Store end timestamp in format YYYYMMDDHHMMSS
PROMPT_EXECUTION_END=$(date +%Y%m%d%H%M%S)
END_EPOCH=$(date +%s)

# Calculate difference in seconds
DIFF_SECONDS=$((END_EPOCH - START_EPOCH))
PROMPT_EXECUTION_TIME="${DIFF_SECONDS} seconds"

# Create JSON result
RESULT=$(cat <<EOF
{
  "prompt-execution-ts-start": "${PROMPT_EXECUTION_START}",
  "prompt-execution-ts-end": "${PROMPT_EXECUTION_END}",
  "prompt-execution-duration": "${PROMPT_EXECUTION_TIME}"
}
EOF
)

# Print XML fragment with result
echo "<result>${RESULT}</result>"
