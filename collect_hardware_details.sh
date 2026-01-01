#!/bin/bash

# Set start timestamp
PROMPT_EXECUTION_START=$(date +%Y%m%d%H%M%S)

# Update DNS (try with sudo, continue if it fails)
sudo sed 's/nameserver 1.1.1.1/nameserver 8.8.8.8/g' /etc/resolv.conf 2>/dev/null | sudo tee /etc/resolv.conf > /dev/null 2>&1 || true
grep -q "nameserver 8.8.8.8" /etc/resolv.conf 2>/dev/null || echo "nameserver 8.8.8.8" 2>/dev/null | sudo tee -a /etc/resolv.conf > /dev/null 2>&1 || true

# Install packages (try with sudo, continue if it fails)
sudo apt update -qq > /dev/null 2>&1 || true
sudo apt install -qq -y curl libcurl4 > /dev/null 2>&1 || true

# Execute commands and extract information
CPU_ARCHITECTURE=$(lscpu 2>/dev/null | grep "Architecture:" | awk '{print $2}')
NUMBER_OF_PROCESSING_UNITS=$(nproc)
SYSTEM_INFORMATION=$(uname -a)
RAM_USAGE_AND_TOTAL_MEMORY=$(free -h 2>/dev/null | grep "^Mem:" | awk '{print $2 " total, " $3 " used, " $4 " free, " $7 " available"}')
DISK_SPACE_USAGE=$(df -h / 2>/dev/null | tail -1 | awk '{print $2 " total, " $3 " used, " $4 " available (" $5 " used)"}')
JAVA_VERSION=$(java -version 2>&1 | head -1 | sed -E 's/.*version "([^"]+)".*/\1/')
MAVEN_VERSION=$(mvn -version 2>&1 | head -1 | sed -E 's/.*Apache Maven ([0-9.]+).*/\1/' || echo "unknown")
GRADLE_VERSION=$(gradle -version 2>&1 | grep "^Gradle" | awk '{print $2}' || echo "not installed")
IP_INFO=$(curl -s http://ip-api.com/json/ 2>/dev/null)
AWS_REGION=$(echo "$IP_INFO" | python3 -c "import sys, json; print(json.load(sys.stdin)['org'])" 2>/dev/null || echo "unknown")

# Set end timestamp
PROMPT_EXECUTION_END=$(date +%Y%m%d%H%M%S)

# Calculate execution time
START_SECONDS=$(date -d "${PROMPT_EXECUTION_START:0:4}-${PROMPT_EXECUTION_START:4:2}-${PROMPT_EXECUTION_START:6:2} ${PROMPT_EXECUTION_START:8:2}:${PROMPT_EXECUTION_START:10:2}:${PROMPT_EXECUTION_START:12:2}" +%s 2>/dev/null)
END_SECONDS=$(date -d "${PROMPT_EXECUTION_END:0:4}-${PROMPT_EXECUTION_END:4:2}-${PROMPT_EXECUTION_END:6:2} ${PROMPT_EXECUTION_END:8:2}:${PROMPT_EXECUTION_END:10:2}:${PROMPT_EXECUTION_END:12:2}" +%s 2>/dev/null)

if [ -z "$START_SECONDS" ] || [ -z "$END_SECONDS" ]; then
    # Fallback calculation if date parsing fails
    PROMPT_EXECUTION_TIME="0 seconds"
else
    DURATION=$((END_SECONDS - START_SECONDS))
    PROMPT_EXECUTION_TIME="${DURATION} seconds"
fi

# Create JSON result using Python
RESULT=$(python3 <<EOF
import json
result = {
    "prompt-execution-ts-start": "$PROMPT_EXECUTION_START",
    "prompt-execution-ts-end": "$PROMPT_EXECUTION_END",
    "prompt-execution-duration": "$PROMPT_EXECUTION_TIME",
    "aws-region": "$AWS_REGION",
    "cpu-architecture": "$CPU_ARCHITECTURE",
    "processing-units": "$NUMBER_OF_PROCESSING_UNITS",
    "system-information": "$SYSTEM_INFORMATION",
    "ram-usage-and-total-memory": "$RAM_USAGE_AND_TOTAL_MEMORY",
    "disk-space-usage": "$DISK_SPACE_USAGE",
    "java-version": "$JAVA_VERSION",
    "maven-version": "$MAVEN_VERSION",
    "gradle-version": "$GRADLE_VERSION"
}
print(json.dumps(result))
EOF
)

# Output XML fragment
echo "<result>$RESULT</result>"
