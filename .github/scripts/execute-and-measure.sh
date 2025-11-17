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

# Execute the churrera workflow
jbang trust add https://github.com/jabrena/
jbang churrera@jabrena run --workflow "$WORKFLOW_FILE" --delete-on-success-completion

# Capture end time
END_TIME=$(date +%s)

# Calculate duration in seconds
DURATION=$((END_TIME - START_TIME))

# Determine status: UP if less than 120 seconds (2 minutes), DOWN otherwise
if [ $DURATION -lt 1000 ]; then
    STATUS="UP"
else
    STATUS="DOWN"
fi

# Get current date and time in format YYYYMMDD HH:MM
LOCAL_DATETIME=$(date +"%Y%m%d %H:%M")

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
    if [ -n "$TEST_TYPE" ]; then
        # Include test-type if provided
        jq --arg datetime "$LOCAL_DATETIME" \
           --arg status "$STATUS" \
           --argjson latency $DURATION \
           --arg testtype "$TEST_TYPE" \
           '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "test-type": $testtype}]' \
           "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
    else
        # No test-type provided
        jq --arg datetime "$LOCAL_DATETIME" \
           --arg status "$STATUS" \
           --argjson latency $DURATION \
           '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency}]' \
           "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
    fi
else
    # Create new file with single entry
    if [ -n "$TEST_TYPE" ]; then
        # Include test-type if provided
        echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"test-type\": \"$TEST_TYPE\"}]" > "$MEASURES_FILE"
    else
        # No test-type provided
        echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION}]" > "$MEASURES_FILE"
    fi
fi

echo "Execution completed: Duration=${DURATION}s, Status=${STATUS}"

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
