#!/bin/bash
set -e

# Check if workflow file path is provided
if [ -z "$1" ]; then
    echo "Error: Workflow file path is required"
    echo "Usage: $0 <workflow.xml> [test-type]"
    exit 1
fi

WORKFLOW_FILE="$1"
TEST_TYPE="$2"  # Optional second parameter for test-type

# Validate that the workflow file exists
if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "Error: Workflow file not found: $WORKFLOW_FILE"
    exit 1
fi

# Capture start time
START_TIME=$(date +%s)

# Execute the churrera workflow with 5 minute timeout
jbang trust add https://github.com/jabrena/
# Ensure extract script is executable
chmod +x .github/scripts/extract-result-json.sh

# Capture output to a temporary file for JSON extraction
OUTPUT_FILE=$(mktemp)
# Temporarily disable exit on error to handle timeout gracefully
set +e
timeout 300 jbang churrera@jabrena run --workflow "$WORKFLOW_FILE" --show-logs --delete-on-success-completion > "$OUTPUT_FILE" 2>&1
EXIT_CODE=$?
set -e

# Display the output (logs will appear in GitHub Actions)
cat "$OUTPUT_FILE"

# Capture end time
END_TIME=$(date +%s)

# Check if timeout occurred (exit code 124 or 143)
if [ "$EXIT_CODE" -eq 124 ] || [ "$EXIT_CODE" -eq 143 ]; then
    echo "Warning: Workflow execution timed out after 5 minutes"
    TIMEOUT_OCCURRED=true
else
    TIMEOUT_OCCURRED=false
fi

# Calculate duration in seconds
DURATION=$((END_TIME - START_TIME))

# Determine status: UP if less than 120 seconds (2 minutes), DOWN otherwise
# If timeout occurred, mark as DOWN
if [ "$TIMEOUT_OCCURRED" = true ]; then
    STATUS="DOWN"
elif [ $DURATION -lt 1000 ]; then
    STATUS="UP"
else
    STATUS="DOWN"
fi

# Get current date and time in format YYYYMMDD HH:MM
LOCAL_DATETIME=$(date +"%Y%m%d %H:%M")

# Extract cursor-latency from churrera output
CURSOR_LATENCY=""
if [ -f "$OUTPUT_FILE" ]; then
    # Try to extract JSON from result tags
    set +e  # Temporarily disable exit on error for extraction
    EXTRACTED_JSON=$(cat "$OUTPUT_FILE" | ./.github/scripts/extract-result-json.sh 2>/dev/null || echo "")
    set -e
    if [ -n "$EXTRACTED_JSON" ]; then
        # Extract prompt-execution-duration value and parse the numeric part
        # Format is typically: "22 seconds" or just a number
        set +e  # Temporarily disable exit on error for jq parsing
        PROMPT_DURATION=$(echo "$EXTRACTED_JSON" | jq -r '.prompt-execution-duration // empty' 2>/dev/null || echo "")
        set -e
        if [ -n "$PROMPT_DURATION" ]; then
            # Extract numeric value (e.g., "22 seconds" -> 22)
            CURSOR_LATENCY=$(echo "$PROMPT_DURATION" | grep -oE '[0-9]+' | head -1 || echo "")
        fi
    fi
fi

# Fetch and pull latest changes before reading measures.json to avoid conflicts
# when running multiple times in sequence
if [ -n "$GITHUB_ACTIONS" ]; then
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    git fetch origin main
    git pull origin main --no-edit || echo "Pull failed or no changes to merge"
fi

# Read existing measures.json and add new entry
MEASURES_FILE="docs/measures.json"

# Check if file exists and has content
if [ -f "$MEASURES_FILE" ] && [ -s "$MEASURES_FILE" ]; then
    # Use jq to add new entry to the array
    # Always include cursor-latency (empty string if not extracted)
    if [ -n "$TEST_TYPE" ]; then
        # Include test-type if provided
        jq --arg datetime "$LOCAL_DATETIME" \
           --arg status "$STATUS" \
           --argjson latency $DURATION \
           --arg cursorlatency "${CURSOR_LATENCY:-}" \
           --arg testtype "$TEST_TYPE" \
           '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "cursor-latency": $cursorlatency, "test-type": $testtype}]' \
           "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
    else
        # No test-type provided
        jq --arg datetime "$LOCAL_DATETIME" \
           --arg status "$STATUS" \
           --argjson latency $DURATION \
           --arg cursorlatency "${CURSOR_LATENCY:-}" \
           '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "cursor-latency": $cursorlatency}]' \
           "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
    fi
else
    # Create new file with single entry
    # Always include cursor-latency (empty string if not extracted)
    if [ -n "$TEST_TYPE" ]; then
        # Include test-type if provided
        echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"cursor-latency\": \"${CURSOR_LATENCY:-}\", \"test-type\": \"$TEST_TYPE\"}]" > "$MEASURES_FILE"
    else
        # No test-type provided
        echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"cursor-latency\": \"${CURSOR_LATENCY:-}\"}]" > "$MEASURES_FILE"
    fi
fi

echo "Execution completed: Duration=${DURATION}s, Status=${STATUS}, Cursor-Latency=${CURSOR_LATENCY:-""}"

# Cleanup temporary output file
rm -f "$OUTPUT_FILE"

# Commit and push measures.json if running in CI environment
if [ -n "$GITHUB_ACTIONS" ]; then
    git add "$MEASURES_FILE"
    if git diff --staged --quiet; then
        echo "No changes to commit"
    else
        git commit -m "Update measures.json with execution metrics [skip ci]"
        git push origin main
    fi
fi
