#!/bin/bash

# Function to set the prompt execution start timestamp
set_prompt_execution_start() {
    rm -f /tmp/prompt_execution_start.txt
    export PROMPT_EXECUTION_START=$(date +%Y%m%d%H%M%S)
    echo "$PROMPT_EXECUTION_START" > /tmp/prompt_execution_start.txt
}

# Function to calculate the prompt execution time
calculate_prompt_execution_time() {
    PROMPT_EXECUTION_START=$(cat /tmp/prompt_execution_start.txt)
    PROMPT_EXECUTION_END=$(date +%Y%m%d%H%M%S)

    # Convert YYYYMMDDHHMMSS to YYYY-MM-DD HH:MM:SS format, then to Unix timestamp
    START_FORMATTED="${PROMPT_EXECUTION_START:0:4}-${PROMPT_EXECUTION_START:4:2}-${PROMPT_EXECUTION_START:6:2} ${PROMPT_EXECUTION_START:8:2}:${PROMPT_EXECUTION_START:10:2}:${PROMPT_EXECUTION_START:12:2}"
    END_FORMATTED="${PROMPT_EXECUTION_END:0:4}-${PROMPT_EXECUTION_END:4:2}-${PROMPT_EXECUTION_END:6:2} ${PROMPT_EXECUTION_END:8:2}:${PROMPT_EXECUTION_END:10:2}:${PROMPT_EXECUTION_END:12:2}"

    # Convert to epoch with error checking
    START_EPOCH=$(date -d "$START_FORMATTED" +%s 2>/dev/null)
    END_EPOCH=$(date -d "$END_FORMATTED" +%s 2>/dev/null)

    # Validate that both epoch values are valid numbers
    if [ -z "$START_EPOCH" ] || [ -z "$END_EPOCH" ] || ! [[ "$START_EPOCH" =~ ^[0-9]+$ ]] || ! [[ "$END_EPOCH" =~ ^[0-9]+$ ]]; then
        echo "Error: Failed to convert timestamps to epoch time" >&2
        echo "START_FORMATTED: $START_FORMATTED" >&2
        echo "END_FORMATTED: $END_FORMATTED" >&2
        echo "START_EPOCH: $START_EPOCH" >&2
        echo "END_EPOCH: $END_EPOCH" >&2
        # Fallback: calculate difference manually for same day
        if [ "${PROMPT_EXECUTION_START:0:8}" = "${PROMPT_EXECUTION_END:0:8}" ]; then
            START_SEC=$((10#${PROMPT_EXECUTION_START:8:2} * 3600 + 10#${PROMPT_EXECUTION_START:10:2} * 60 + 10#${PROMPT_EXECUTION_START:12:2}))
            END_SEC=$((10#${PROMPT_EXECUTION_END:8:2} * 3600 + 10#${PROMPT_EXECUTION_END:10:2} * 60 + 10#${PROMPT_EXECUTION_END:12:2}))
            PROMPT_EXECUTION_TIME="$((END_SEC - START_SEC)) seconds"
        else
            PROMPT_EXECUTION_TIME="0 seconds"
        fi
    else
        PROMPT_EXECUTION_TIME="$((END_EPOCH - START_EPOCH)) seconds"
    fi
    
    export PROMPT_EXECUTION_START
    export PROMPT_EXECUTION_END
    export PROMPT_EXECUTION_TIME
}

