#!/bin/bash

# Test script to validate sharding logic
# Usage: ./test-sharding.sh

echo "🧪 Testing Sharding Logic"
echo "========================"

# Test with small dataset
echo "📝 Creating test dataset..."
cat > test_data.csv << EOF
zipcode,state,address,city
10001,NY,"","" 
10002,NY,"","" 
10003,NY,"","" 
10004,NY,"","" 
10005,NY,"","" 
10006,NY,"","" 
10007,NY,"","" 
10008,NY,"","" 
10009,NY,"","" 
10010,NY,"","" 
EOF

echo "✅ Created test_data.csv with 10 records"

# Test sharding with 3 shards
echo ""
echo "🔀 Testing 3-shard distribution:"

for shard in 0 1 2; do
    export SHARD_INDEX=$shard
    export TOTAL_SHARDS=3
    export MAX_RECORDS_PER_SHARD=5
    
    echo "Shard $shard:"
    
    # Simulate the sharding logic
    node -e "
    const fs = require('fs');
    const csvContent = fs.readFileSync('test_data.csv', 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    const records = lines.slice(1); // Skip header
    
    const SHARD_INDEX = parseInt(process.env.SHARD_INDEX);
    const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS);
    const MAX_RECORDS_PER_SHARD = parseInt(process.env.MAX_RECORDS_PER_SHARD);
    
    const recordsPerShard = Math.ceil(records.length / TOTAL_SHARDS);
    const startIndex = SHARD_INDEX * recordsPerShard;
    const endIndex = Math.min(startIndex + recordsPerShard, records.length);
    const maxEndIndex = Math.min(startIndex + MAX_RECORDS_PER_SHARD, endIndex);
    
    const shardRecords = records.slice(startIndex, maxEndIndex);
    
    console.log('  Records:', startIndex + 1, '-', maxEndIndex, '(', shardRecords.length, 'records)');
    shardRecords.forEach((record, i) => {
        const zipcode = record.split(',')[0];
        console.log('    -', zipcode);
    });
    "
done

echo ""
echo "🔀 Testing 2-shard distribution:"

for shard in 0 1; do
    export SHARD_INDEX=$shard
    export TOTAL_SHARDS=2
    export MAX_RECORDS_PER_SHARD=10
    
    echo "Shard $shard:"
    
    node -e "
    const fs = require('fs');
    const csvContent = fs.readFileSync('test_data.csv', 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    const records = lines.slice(1);
    
    const SHARD_INDEX = parseInt(process.env.SHARD_INDEX);
    const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS);
    const MAX_RECORDS_PER_SHARD = parseInt(process.env.MAX_RECORDS_PER_SHARD);
    
    const recordsPerShard = Math.ceil(records.length / TOTAL_SHARDS);
    const startIndex = SHARD_INDEX * recordsPerShard;
    const endIndex = Math.min(startIndex + recordsPerShard, records.length);
    const maxEndIndex = Math.min(startIndex + MAX_RECORDS_PER_SHARD, endIndex);
    
    const shardRecords = records.slice(startIndex, maxEndIndex);
    
    console.log('  Records:', startIndex + 1, '-', maxEndIndex, '(', shardRecords.length, 'records)');
    shardRecords.forEach((record, i) => {
        const zipcode = record.split(',')[0];
        console.log('    -', zipcode);
    });
    "
done

# Test with actual data size calculation
echo ""
echo "📊 Calculating distribution for 41,273 records:"

node -e "
const totalRecords = 41273;
const configurations = [
    { shards: 10, maxPerShard: 1000 },
    { shards: 20, maxPerShard: 1000 },
    { shards: 30, maxPerShard: 800 },
    { shards: 4, maxPerShard: 500 }  // Local
];

configurations.forEach(config => {
    const recordsPerShard = Math.ceil(totalRecords / config.shards);
    const actualPerShard = Math.min(recordsPerShard, config.maxPerShard);
    const totalProcessed = actualPerShard * config.shards;
    const coverage = (totalProcessed / totalRecords * 100).toFixed(1);
    
    console.log(\`\${config.shards} shards, max \${config.maxPerShard} each:\`);
    console.log(\`  - Records per shard: \${actualPerShard}\`);
    console.log(\`  - Total processed: \${totalProcessed} (\${coverage}% coverage)\`);
    console.log(\`  - Estimated time: \${Math.ceil(actualPerShard * 2 / 60)} minutes per shard\`);
    console.log('');
});
"

# Cleanup
rm -f test_data.csv

echo "✅ Sharding logic test completed!"
echo ""
echo "💡 Recommendations for 41,273 records:"
echo "  - GitHub Actions: 20 shards, 1000 max per shard"
echo "  - Local: 4-6 shards, 500 max per shard"
echo "  - Testing: 2 shards, 100 max per shard"
