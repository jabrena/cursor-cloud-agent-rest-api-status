#!/bin/bash
set -e

# Check if workflow file path is provided
if [ -z "$1" ]; then
    echo "Error: Workflow file path is required"
    echo "Usage: $0 <workflow.xml>"
    exit 1
fi

WORKFLOW_FILE="$1"

# Validate that the workflow file exists
if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "Error: Workflow file not found: $WORKFLOW_FILE"
    exit 1
fi

# Capture start time
START_TIME=$(date +%s)

# Execute the churrera workflow
jbang trust add https://github.com/jabrena/
jbang churrera@jabrena run "$WORKFLOW_FILE"

# Capture end time
END_TIME=$(date +%s)

# Calculate duration in seconds
DURATION=$((END_TIME - START_TIME))

# Determine status: UP if less than 120 seconds (2 minutes), DOWN otherwise
if [ $DURATION -lt 120 ]; then
    STATUS="UP"
else
    STATUS="DOWN"
fi

# Get current date and time in format YYYYMMDD HH:MM
LOCAL_DATETIME=$(date +"%Y%m%d %H:%M")

# Read existing measures.json and add new entry
MEASURES_FILE="docs/measures.json"

# Check if file exists and has content
if [ -f "$MEASURES_FILE" ] && [ -s "$MEASURES_FILE" ]; then
    # Use jq to add new entry to the array
    jq --arg datetime "$LOCAL_DATETIME" \
       --arg status "$STATUS" \
       --argjson latency $DURATION \
       '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency}]' \
       "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
else
    # Create new file with single entry
    echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION}]" > "$MEASURES_FILE"
fi

echo "Execution completed: Duration=${DURATION}s, Status=${STATUS}"

# Commit and push measures.json if running in CI environment
if [ -n "$GITHUB_ACTIONS" ]; then
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    git add "$MEASURES_FILE"
    if git diff --staged --quiet; then
        echo "No changes to commit"
    else
        git commit -m "Update measures.json with execution metrics [skip ci]"
        git push origin main
    fi
fi
