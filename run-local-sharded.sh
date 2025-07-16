#!/bin/bash

# Local sharded execution script for address extraction
# Usage: ./run-local-sharded.sh [TOTAL_SHARDS] [TARGET_STATE] [MAX_RECORDS_PER_SHARD]

set -e

# Default values
TOTAL_SHARDS=${1:-4}
TARGET_STATE=${2:-"ALL"}
MAX_RECORDS_PER_SHARD=${3:-500}

echo "🚀 Local Sharded Address Extraction"
echo "=================================="
echo "Total Shards: $TOTAL_SHARDS"
echo "Target State: $TARGET_STATE"
echo "Max Records per Shard: $MAX_RECORDS_PER_SHARD"
echo "=================================="

# Create logs directory
mkdir -p logs

# Function to run a single shard
run_shard() {
    local shard_index=$1
    echo "🔄 Starting shard $((shard_index + 1))/$TOTAL_SHARDS..."
    
    # Set environment variables for this shard
    export SHARD_INDEX=$shard_index
    export TOTAL_SHARDS=$TOTAL_SHARDS
    export MAX_RECORDS_PER_SHARD=$MAX_RECORDS_PER_SHARD
    export CI=false
    
    # Update target state in test file if not ALL
    if [ "$TARGET_STATE" != "ALL" ]; then
        if [[ "$TARGET_STATE" == *","* ]]; then
            # Multiple states: convert "CA,NY,TX" to ["CA", "NY", "TX"]
            FORMATTED_STATE="[$(echo "$TARGET_STATE" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')"]"
        else
            # Single state
            FORMATTED_STATE="\"$TARGET_STATE\""
        fi
        
        # Backup original file
        cp tests/MyScript.spec.ts tests/MyScript.spec.ts.backup
        
        # Update the target state
        sed -i.tmp "s/const TARGET_STATE: string | string\[\] = 'ALL';/const TARGET_STATE: string | string[] = $FORMATTED_STATE;/" tests/MyScript.spec.ts
    fi
    
    # Run the test for this shard
    npx playwright test tests/MyScript.spec.ts \
        --workers=2 \
        --timeout=120000 \
        --retries=1 \
        --reporter=list \
        --output=test-results-shard-$shard_index \
        > logs/shard_${shard_index}.log 2>&1
    
    local exit_code=$?
    
    # Restore original file if we modified it
    if [ "$TARGET_STATE" != "ALL" ] && [ -f tests/MyScript.spec.ts.backup ]; then
        mv tests/MyScript.spec.ts.backup tests/MyScript.spec.ts
        rm -f tests/MyScript.spec.ts.tmp
    fi
    
    if [ $exit_code -eq 0 ]; then
        echo "✅ Shard $((shard_index + 1)) completed successfully"
    else
        echo "❌ Shard $((shard_index + 1)) failed with exit code $exit_code"
    fi
    
    return $exit_code
}

# Run shards in parallel (limit to 4 concurrent processes to avoid overwhelming the system)
MAX_PARALLEL=4
PIDS=()
FAILED_SHARDS=()

for ((i=0; i<TOTAL_SHARDS; i++)); do
    # Wait if we've reached the maximum parallel processes
    while [ ${#PIDS[@]} -ge $MAX_PARALLEL ]; do
        for j in "${!PIDS[@]}"; do
            if ! kill -0 "${PIDS[j]}" 2>/dev/null; then
                wait "${PIDS[j]}"
                exit_code=$?
                if [ $exit_code -ne 0 ]; then
                    FAILED_SHARDS+=($j)
                fi
                unset PIDS[j]
            fi
        done
        PIDS=("${PIDS[@]}")  # Reindex array
        sleep 1
    done
    
    # Start the shard in background
    run_shard $i &
    PIDS+=($!)
    
    echo "🚀 Started shard $((i + 1)) (PID: ${PIDS[-1]})"
    sleep 2  # Small delay between starting shards
done

# Wait for all remaining processes to complete
echo "⏳ Waiting for all shards to complete..."
for pid in "${PIDS[@]}"; do
    wait $pid
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo "⚠️ A shard process failed"
    fi
done

echo "🔄 Merging results from all shards..."

# Create merged file with header
echo "zipcode,state,address,city" > FinalZipcodeState_merged.csv

# Merge all shard files
MERGED_COUNT=0
SUCCESSFUL_SHARDS=0

for ((i=0; i<TOTAL_SHARDS; i++)); do
    SHARD_FILE="FinalZipcodeState_shard_${i}.csv"
    if [ -f "$SHARD_FILE" ]; then
        # Skip header and append data
        tail -n +2 "$SHARD_FILE" >> FinalZipcodeState_merged.csv
        SHARD_COUNT=$(tail -n +2 "$SHARD_FILE" | wc -l)
        MERGED_COUNT=$((MERGED_COUNT + SHARD_COUNT))
        SUCCESSFUL_SHARDS=$((SUCCESSFUL_SHARDS + 1))
        echo "✅ Merged shard $((i + 1)): $SHARD_COUNT records"
    else
        echo "⚠️ Shard file $SHARD_FILE not found"
    fi
done

# Generate summary
echo ""
echo "📊 EXTRACTION SUMMARY"
echo "===================="
echo "Successful Shards: $SUCCESSFUL_SHARDS/$TOTAL_SHARDS"
echo "Total Records Processed: $MERGED_COUNT"

if [ -f "FinalZipcodeState_merged.csv" ]; then
    SUCCESSFUL_RECORDS=$(tail -n +2 FinalZipcodeState_merged.csv | grep -v "Not Found\|Error" | wc -l)
    NOT_FOUND_RECORDS=$(tail -n +2 FinalZipcodeState_merged.csv | grep "Not Found" | wc -l)
    ERROR_RECORDS=$(tail -n +2 FinalZipcodeState_merged.csv | grep "Error" | wc -l)
    
    echo "Successful Extractions: $SUCCESSFUL_RECORDS"
    echo "Not Found: $NOT_FOUND_RECORDS"
    echo "Errors: $ERROR_RECORDS"
    
    if [ $MERGED_COUNT -gt 0 ]; then
        SUCCESS_RATE=$(echo "scale=2; $SUCCESSFUL_RECORDS * 100 / $MERGED_COUNT" | bc -l 2>/dev/null || echo "N/A")
        echo "Success Rate: $SUCCESS_RATE%"
    fi
fi

echo ""
echo "📁 Output Files:"
echo "- FinalZipcodeState_merged.csv (merged results)"
echo "- FinalZipcodeState_shard_*.csv (individual shard results)"
echo "- logs/shard_*.log (execution logs)"

if [ ${#FAILED_SHARDS[@]} -gt 0 ]; then
    echo ""
    echo "⚠️ Failed shards: ${FAILED_SHARDS[*]}"
    echo "Check the corresponding log files for details."
    exit 1
else
    echo ""
    echo "🎉 All shards completed successfully!"
fi
