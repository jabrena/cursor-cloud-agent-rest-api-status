#!/bin/bash
set -e

# Script to extract JSON from the last <result> tag in churrera output
# The output may be split across multiple [conversation] sections
# Usage: 
#   ./extract-result-json.sh < input.txt
#   command | ./extract-result-json.sh
#   ./extract-result-json.sh input.txt

# Read input from file if provided as argument, otherwise from stdin
if [ $# -gt 0 ]; then
    INPUT="$1"
    if [ ! -f "$INPUT" ]; then
        echo "Error: File not found: $INPUT" >&2
        exit 1
    fi
    CONTENT=$(cat "$INPUT")
else
    CONTENT=$(cat)
fi

# Find the last [conversation] section
# Collect all sections and keep the last one
LAST_CONVERSATION=$(echo "$CONTENT" | awk '
    BEGIN { 
        sections[0]=""
        section_count=0
        current_section=""
        in_section=0
    }
    /\[conversation\]/ {
        # Save previous section if exists
        if (in_section && current_section != "") {
            sections[section_count++] = current_section
        }
        current_section=""
        in_section=1
        next
    }
    in_section {
        if (current_section == "") {
            current_section=$0
        } else {
            current_section=current_section "\n" $0
        }
    }
    END {
        # Add the last section if we were in one
        if (in_section && current_section != "") {
            sections[section_count++] = current_section
        }
        # Print the last section
        if (section_count > 0) {
            print sections[section_count-1]
        }
    }
')

# If no [conversation] marker found, use the entire content
if [ -z "$LAST_CONVERSATION" ]; then
    LAST_CONVERSATION="$CONTENT"
fi

# Extract content between <result> and </result> tags
# Use awk to handle multi-line content properly
RESULT=$(echo "$LAST_CONVERSATION" | awk '
    BEGIN { in_result=0; result="" }
    /<result>/ { 
        in_result=1
        # Remove everything before <result>
        sub(/.*<result>/, "")
        # If </result> is on the same line, extract and stop
        if (/<\/result>/) {
            sub(/<\/result>.*/, "")
            result = result $0
            in_result=0
        } else {
            result = result $0
        }
        next
    }
    in_result {
        if (/<\/result>/) {
            # Remove everything after </result>
            sub(/<\/result>.*/, "")
            result = result $0
            in_result=0
        } else {
            result = result $0 "\n"
        }
    }
    END { 
        # Remove leading/trailing whitespace and newlines
        gsub(/^[ \t\n\r]+|[ \t\n\r]+$/, "", result)
        print result
    }
')

# Print the JSON result
if [ -n "$RESULT" ]; then
    echo "$RESULT"
else
    echo "Error: No <result> tag found in the last [conversation] section" >&2
    exit 1
fi

