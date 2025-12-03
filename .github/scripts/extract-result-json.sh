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

# Find all [conversation] sections, extract the last 3, and search for <result> in them
# Search from the last section backwards through the last 3 sections
RESULT=$(echo "$CONTENT" | awk '
    BEGIN { 
        section_count=0
        current_section=""
        in_section=0
        all_lines_count=0
    }
    {
        # Store all lines for fallback case
        all_lines[all_lines_count++] = $0
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
        
        # If no sections found, search in entire content
        if (section_count == 0) {
            in_result=0
            result=""
            for (k = 0; k < all_lines_count; k++) {
                line = all_lines[k]
                if (match(line, /<result>/)) {
                    in_result=1
                    # Remove everything before <result>
                    sub(/.*<result>/, "", line)
                    # If </result> is on the same line
                    if (match(line, /<\/result>/)) {
                        sub(/<\/result>.*/, "", line)
                        result = result line
                        in_result=0
                        break
                    } else {
                        result = result line
                    }
                } else if (in_result) {
                    if (match(line, /<\/result>/)) {
                        sub(/<\/result>.*/, "", line)
                        result = result line
                        in_result=0
                        break
                    } else {
                        result = result line "\n"
                    }
                }
            }
            gsub(/^[ \t\n\r]+|[ \t\n\r]+$/, "", result)
            print result
            exit
        }
        
        # Search in last 3 sections (from last to first)
        start = (section_count > 3) ? section_count - 3 : 0
        found = 0
        
        for (i = section_count - 1; i >= start && !found; i--) {
            section = sections[i]
            in_result=0
            result=""
            
            # Process section line by line
            n = split(section, lines, "\n")
            for (j = 1; j <= n; j++) {
                line = lines[j]
                if (match(line, /<result>/)) {
                    in_result=1
                    # Remove everything before <result>
                    sub(/.*<result>/, "", line)
                    # If </result> is on the same line
                    if (match(line, /<\/result>/)) {
                        sub(/<\/result>.*/, "", line)
                        result = result line
                        in_result=0
                        found = 1
                        break
                    } else {
                        result = result line
                    }
                } else if (in_result) {
                    if (match(line, /<\/result>/)) {
                        sub(/<\/result>.*/, "", line)
                        result = result line
                        in_result=0
                        found = 1
                        break
                    } else {
                        result = result line "\n"
                    }
                }
            }
            
            if (found) {
                gsub(/^[ \t\n\r]+|[ \t\n\r]+$/, "", result)
                print result
                exit
            }
        }
    }
')

# Print the JSON result
if [ -n "$RESULT" ]; then
    echo "$RESULT"
else
    echo "Error: No <result> tag found in the last 3 [conversation] sections" >&2
    exit 1
fi

