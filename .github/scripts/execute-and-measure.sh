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
CURSOR_LATENCY_IS_INT=false
if [ -f "$OUTPUT_FILE" ]; then
    echo "=== Starting JSON extraction process ==="
    # Get the script directory to ensure we can find extract-result-json.sh
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    EXTRACT_SCRIPT="$SCRIPT_DIR/extract-result-json.sh"
    
    if [ ! -f "$EXTRACT_SCRIPT" ]; then
        echo "Error: Extract script not found at $EXTRACT_SCRIPT" >&2
    else
        echo "Using extract script: $EXTRACT_SCRIPT"
        
        # Try to extract JSON from result tags
        set +e  # Temporarily disable exit on error for extraction
        # Capture stdout and stderr separately - capture stderr to see errors
        EXTRACT_ERROR_FILE=$(mktemp)
        EXTRACTED_JSON=$(cat "$OUTPUT_FILE" | "$EXTRACT_SCRIPT" 2>"$EXTRACT_ERROR_FILE")
        EXTRACT_EXIT_CODE=$?
        EXTRACT_ERROR=$(cat "$EXTRACT_ERROR_FILE" 2>/dev/null || echo "")
        rm -f "$EXTRACT_ERROR_FILE"
        set -e
        
        echo "Extraction exit code: $EXTRACT_EXIT_CODE"
        
        if [ -n "$EXTRACT_ERROR" ]; then
            echo "Extraction errors/warnings: $EXTRACT_ERROR" >&2
        fi
        
        if [ $EXTRACT_EXIT_CODE -eq 0 ] && [ -n "$EXTRACTED_JSON" ]; then
            echo "Extracted JSON (first 200 chars): ${EXTRACTED_JSON:0:200}..."
            
            # Validate that we got JSON (should start with { and be valid JSON)
            if echo "$EXTRACTED_JSON" | grep -q '^{'; then
                echo "JSON starts with '{', validating..."
                set +e  # Temporarily disable exit on error for jq validation
                if echo "$EXTRACTED_JSON" | jq empty 2>/dev/null; then
                    echo "JSON is valid"
                    # Extract prompt-execution-duration value and parse the numeric part
                    # Format is typically: "22 seconds" or just a number
                    # Capture both stdout and stderr separately to debug
                    
                    # Debug: try to see all keys in JSON
                    echo "Available JSON keys: $(echo "$EXTRACTED_JSON" | jq -r 'keys | join(", ")' 2>/dev/null || echo "failed to get keys")"
                    
                    # Try multiple extraction methods to find what works
                    TEST1_ERROR_FILE=$(mktemp)
                    TEST1=$(echo "$EXTRACTED_JSON" | jq -r '.prompt-execution-duration' 2>"$TEST1_ERROR_FILE")
                    TEST1_EXIT=$?
                    TEST1_ERROR=$(cat "$TEST1_ERROR_FILE" 2>/dev/null || echo "")
                    rm -f "$TEST1_ERROR_FILE"
                    
                    TEST2_ERROR_FILE=$(mktemp)
                    TEST2=$(echo "$EXTRACTED_JSON" | jq -r '.["prompt-execution-duration"]' 2>"$TEST2_ERROR_FILE")
                    TEST2_EXIT=$?
                    TEST2_ERROR=$(cat "$TEST2_ERROR_FILE" 2>/dev/null || echo "")
                    rm -f "$TEST2_ERROR_FILE"
                    
                    echo "Test 1 (direct): exit=$TEST1_EXIT, value='$TEST1', error='$TEST1_ERROR'"
                    echo "Test 2 (bracket): exit=$TEST2_EXIT, value='$TEST2', error='$TEST2_ERROR'"
                    
                    # Use the first method that works
                    PROMPT_DURATION=""
                    if [ $TEST1_EXIT -eq 0 ] && [ -n "$TEST1" ] && [ "$TEST1" != "null" ]; then
                        PROMPT_DURATION="$TEST1"
                        echo "Using Test 1 result: '$PROMPT_DURATION'"
                    elif [ $TEST2_EXIT -eq 0 ] && [ -n "$TEST2" ] && [ "$TEST2" != "null" ]; then
                        PROMPT_DURATION="$TEST2"
                        echo "Using Test 2 result: '$PROMPT_DURATION'"
                    else
                        echo "Warning: Both extraction methods failed or returned null/empty"
                    fi
                    
                    set -e
                    
                    echo "Final prompt-execution-duration value: '$PROMPT_DURATION'"
                    echo "prompt-execution-duration length: ${#PROMPT_DURATION}"
                    
                    if [ -n "$PROMPT_DURATION" ] && [ "$PROMPT_DURATION" != "null" ] && [ "$PROMPT_DURATION" != "empty" ]; then
                        # Extract numeric value (e.g., "22 seconds" -> 22, "2096 seconds" -> 2096)
                        CURSOR_LATENCY=$(echo "$PROMPT_DURATION" | grep -oE '[0-9]+' | head -1 || echo "")
                        echo "Extracted cursor-latency: '$CURSOR_LATENCY'"
                    else
                        echo "Warning: prompt-execution-duration is empty, null, or not found in JSON"
                        # Try alternative extraction methods
                        echo "Trying alternative extraction method..."
                        ALT_DURATION=$(echo "$EXTRACTED_JSON" | jq -r '.["prompt-execution-duration"]' 2>/dev/null || echo "")
                        echo "Alternative extraction result: '$ALT_DURATION'"
                    fi
                    
                    # Validate if CURSOR_LATENCY is a valid integer
                    if [ -n "$CURSOR_LATENCY" ] && [ "$CURSOR_LATENCY" -eq "$CURSOR_LATENCY" ] 2>/dev/null; then
                        CURSOR_LATENCY_IS_INT=true
                        echo "cursor-latency is a valid integer: $CURSOR_LATENCY"
                    else
                        CURSOR_LATENCY_IS_INT=false
                        CURSOR_LATENCY=""
                        echo "cursor-latency is not a valid integer, will store as empty string"
                    fi
                else
                    set -e
                    echo "Warning: Extracted text is not valid JSON"
                    echo "Extracted text: $EXTRACTED_JSON"
                fi
            else
                echo "Warning: Extracted text does not start with '{'"
                echo "Extracted text (first 500 chars): ${EXTRACTED_JSON:0:500}"
            fi
        else
            if [ $EXTRACT_EXIT_CODE -ne 0 ]; then
                echo "Warning: JSON extraction failed with exit code $EXTRACT_EXIT_CODE"
            fi
            if [ -z "$EXTRACTED_JSON" ]; then
                echo "Warning: No JSON extracted (empty result)"
            fi
        fi
    fi
    echo "=== JSON extraction process completed ==="
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
    # cursor-latency: integer if valid, empty string otherwise
    if [ -n "$TEST_TYPE" ]; then
        # Include test-type if provided
        if [ "$CURSOR_LATENCY_IS_INT" = true ]; then
            # cursor-latency is a valid integer, use --argjson
            jq --arg datetime "$LOCAL_DATETIME" \
               --arg status "$STATUS" \
               --argjson latency $DURATION \
               --argjson cursorlatency $CURSOR_LATENCY \
               --arg testtype "$TEST_TYPE" \
               '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "cursor-latency": $cursorlatency, "test-type": $testtype}]' \
               "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
        else
            # cursor-latency is empty or invalid, use --arg with empty string
            jq --arg datetime "$LOCAL_DATETIME" \
               --arg status "$STATUS" \
               --argjson latency $DURATION \
               --arg cursorlatency "" \
               --arg testtype "$TEST_TYPE" \
               '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "cursor-latency": $cursorlatency, "test-type": $testtype}]' \
               "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
        fi
    else
        # No test-type provided
        if [ "$CURSOR_LATENCY_IS_INT" = true ]; then
            # cursor-latency is a valid integer, use --argjson
            jq --arg datetime "$LOCAL_DATETIME" \
               --arg status "$STATUS" \
               --argjson latency $DURATION \
               --argjson cursorlatency $CURSOR_LATENCY \
               '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "cursor-latency": $cursorlatency}]' \
               "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
        else
            # cursor-latency is empty or invalid, use --arg with empty string
            jq --arg datetime "$LOCAL_DATETIME" \
               --arg status "$STATUS" \
               --argjson latency $DURATION \
               --arg cursorlatency "" \
               '. += [{"localdatetime": $datetime, "status": $status, "latency": $latency, "cursor-latency": $cursorlatency}]' \
               "$MEASURES_FILE" > "$MEASURES_FILE.tmp" && mv "$MEASURES_FILE.tmp" "$MEASURES_FILE"
        fi
    fi
else
    # Create new file with single entry
    # cursor-latency: integer if valid, empty string otherwise
    if [ -n "$TEST_TYPE" ]; then
        # Include test-type if provided
        if [ "$CURSOR_LATENCY_IS_INT" = true ]; then
            # cursor-latency is a valid integer, output without quotes
            echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"cursor-latency\": $CURSOR_LATENCY, \"test-type\": \"$TEST_TYPE\"}]" > "$MEASURES_FILE"
        else
            # cursor-latency is empty or invalid, output as empty string
            echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"cursor-latency\": \"\", \"test-type\": \"$TEST_TYPE\"}]" > "$MEASURES_FILE"
        fi
    else
        # No test-type provided
        if [ "$CURSOR_LATENCY_IS_INT" = true ]; then
            # cursor-latency is a valid integer, output without quotes
            echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"cursor-latency\": $CURSOR_LATENCY}]" > "$MEASURES_FILE"
        else
            # cursor-latency is empty or invalid, output as empty string
            echo "[{\"localdatetime\": \"$LOCAL_DATETIME\", \"status\": \"$STATUS\", \"latency\": $DURATION, \"cursor-latency\": \"\"}]" > "$MEASURES_FILE"
        fi
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
