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

# Fetch and pull latest changes before reading hardware.json to avoid conflicts
# when running multiple times in sequence
if [ -n "$GITHUB_ACTIONS" ]; then
    git config --local user.email "action@github.com"
    git config --local user.name "GitHub Action"
    git fetch origin main
    git pull origin main --no-edit || echo "Pull failed or no changes to merge"
fi

# Setup jbang trust
jbang trust add https://github.com/jabrena/

# Ensure extract script is executable
chmod +x .github/scripts/extract-result-json.sh

# Run churrera and capture output
OUTPUT_FILE=$(mktemp)
jbang churrera@jabrena run --workflow "$WORKFLOW_FILE" \
  --show-logs --delete-on-success-completion > "$OUTPUT_FILE" 2>&1

# Display the output (logs will appear in GitHub Actions)
cat "$OUTPUT_FILE"

# Extract JSON from the output to a temporary file
NEW_JSON_FILE=$(mktemp)
cat "$OUTPUT_FILE" | ./.github/scripts/extract-result-json.sh > "$NEW_JSON_FILE"

# Ensure hardware.json exists and is a valid JSON array
HARDWARE_FILE="docs/data/hardware.json"
if [ ! -f "$HARDWARE_FILE" ] || [ ! -s "$HARDWARE_FILE" ]; then
    echo "[]" > "$HARDWARE_FILE"
fi

# Append the new JSON object to the existing array
jq --argjson new "$(cat "$NEW_JSON_FILE")" '. + [$new]' "$HARDWARE_FILE" > "$HARDWARE_FILE.tmp" && mv "$HARDWARE_FILE.tmp" "$HARDWARE_FILE"

echo ""
echo "=== Extracted JSON ==="
cat "$NEW_JSON_FILE"
echo ""

# Cleanup temporary files
rm "$OUTPUT_FILE" "$NEW_JSON_FILE"

# Commit and push hardware.json if running in CI environment
if [ -n "$GITHUB_ACTIONS" ]; then
    git add "$HARDWARE_FILE"
    if git diff --staged --quiet; then
        echo "No changes to commit"
    else
        git commit -m "Update hardware.json with execution hardware details [skip ci]"
        git push origin main
    fi
fi

echo "Hardware details extraction completed successfully"

