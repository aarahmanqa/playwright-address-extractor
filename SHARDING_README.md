# 🚀 Sharded Address Extraction Guide

This guide explains how to efficiently process your 41,273 ZIP code records using both local sharding and GitHub Actions with parallel execution.

## 🎯 Overview

The sharded approach splits your data into multiple chunks (shards) that run in parallel, dramatically reducing processing time:

- **Local Execution**: 4-8 parallel shards on your machine
- **GitHub Actions**: Up to 20 parallel shards in the cloud
- **Estimated Time**: 2-4 hours instead of 12+ hours

## 🏠 Local Sharded Execution

### Quick Start
```bash
# Run with default settings (4 shards, 500 records each)
./run-local-sharded.sh

# Custom configuration
./run-local-sharded.sh 8 "CA,NY,TX" 1000
#                      ^  ^         ^
#                      |  |         Max records per shard
#                      |  Target states (or "ALL")
#                      Number of shards
```

### Local Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `TOTAL_SHARDS` | 4 | Number of parallel processes (2-8 recommended) |
| `TARGET_STATE` | "ALL" | States to process: "ALL", "CA", or "CA,NY,TX" |
| `MAX_RECORDS_PER_SHARD` | 500 | Limit per shard (prevents memory issues) |

### Local Examples
```bash
# Process all states with 6 shards
./run-local-sharded.sh 6 "ALL" 800

# Process only California and Texas
./run-local-sharded.sh 4 "CA,TX" 1000

# Process single state with high concurrency
./run-local-sharded.sh 8 "NY" 500
```

## ☁️ GitHub Actions Execution

### How to Run

1. **Go to your repository on GitHub**
2. **Click "Actions" tab**
3. **Select "Address Extraction with Sharding"**
4. **Click "Run workflow"**
5. **Configure parameters:**

| Parameter | Recommended | Description |
|-----------|-------------|-------------|
| `target_state` | "ALL" | States to process |
| `total_shards` | 20 | Number of parallel runners (1-50) |
| `max_records_per_shard` | 1000 | Records per shard |

### GitHub Actions Benefits

✅ **Massive Parallelization**: Up to 20 simultaneous runners  
✅ **No Local Resource Usage**: Runs entirely in the cloud  
✅ **Automatic Merging**: Combines all results automatically  
✅ **Artifact Storage**: Results stored for 90 days  
✅ **Failure Resilience**: Failed shards don't stop others  

### Recommended GitHub Actions Configurations

#### For 41,273 Records (All States)
```yaml
target_state: "ALL"
total_shards: 20
max_records_per_shard: 1000
```
**Estimated Time**: 2-3 hours  
**Expected Results**: ~20,000 records per shard × 20 shards

#### For Specific States
```yaml
target_state: "CA,NY,TX,FL"
total_shards: 10
max_records_per_shard: 800
```

#### For Testing
```yaml
target_state: "DC"
total_shards: 2
max_records_per_shard: 100
```

## 📊 Performance Comparison

| Method | Time | Parallel Jobs | Resource Usage |
|--------|------|---------------|----------------|
| **Original Sequential** | 12+ hours | 1 | High local CPU |
| **Local Sharded** | 3-4 hours | 4-8 | Moderate local CPU |
| **GitHub Actions** | 2-3 hours | 20 | Zero local resources |

## 🔧 How Sharding Works

### Data Distribution
```
Original: [Record 1, Record 2, ..., Record 41273]

Sharded (20 shards):
Shard 0:  [Records 1-2064]
Shard 1:  [Records 2065-4128]
Shard 2:  [Records 4129-6192]
...
Shard 19: [Records 39209-41273]
```

### Parallel Processing
- Each shard runs independently
- No shared state between shards
- Results are merged automatically
- Failed shards can be retried individually

## 📁 Output Files

### Local Execution
```
FinalZipcodeState_merged.csv          # Complete merged results
FinalZipcodeState_shard_0.csv         # Individual shard results
FinalZipcodeState_shard_1.csv
...
logs/shard_0.log                      # Execution logs
logs/shard_1.log
...
```

### GitHub Actions
- Download the `final-merged-results` artifact
- Contains merged CSV + individual shard files
- Includes detailed summary report

## 🛠️ Troubleshooting

### Local Issues

**Problem**: "Permission denied" error
```bash
chmod +x run-local-sharded.sh
```

**Problem**: High CPU usage
```bash
# Reduce concurrent shards
./run-local-sharded.sh 2 "ALL" 500
```

**Problem**: Memory issues
```bash
# Reduce records per shard
./run-local-sharded.sh 4 "ALL" 300
```

### GitHub Actions Issues

**Problem**: Workflow fails to start
- Check if you have Actions enabled in repository settings
- Ensure you have push access to the repository

**Problem**: Some shards fail
- Failed shards don't affect successful ones
- Check individual shard logs in artifacts
- Re-run the workflow to retry failed shards

**Problem**: Rate limiting
- Reduce `total_shards` to 10-15
- Increase `max_records_per_shard` to compensate

## 📈 Optimization Tips

### For Maximum Speed
- Use GitHub Actions with 20 shards
- Set `max_records_per_shard` to 1000
- Process all states at once

### For Reliability
- Use fewer shards (10-15)
- Lower `max_records_per_shard` (500-800)
- Test with a single state first

### For Resource Conservation
- Use local execution with 4 shards
- Set `max_records_per_shard` to 300
- Process states individually

## 🔍 Monitoring Progress

### Local Monitoring
```bash
# Watch overall progress
tail -f logs/shard_*.log

# Check specific shard
tail -f logs/shard_0.log

# Monitor file sizes
watch -n 30 'ls -lh FinalZipcodeState_shard_*.csv'
```

### GitHub Actions Monitoring
- Watch the Actions tab for real-time progress
- Each shard shows individual progress
- Download partial results from artifacts

## 🎉 Expected Results

With 41,273 records and optimized sharding:

- **Processing Time**: 2-4 hours (vs 12+ hours sequential)
- **Success Rate**: 60-80% (varies by location data availability)
- **Output Size**: ~25-35MB CSV file
- **Valid Addresses**: ~25,000-33,000 records
- **Cost**: Free (GitHub Actions free tier: 2,000 minutes/month)

## 🚨 Important Notes

1. **Rate Limiting**: Google Maps may rate limit aggressive requests
2. **Data Quality**: Results depend on Google Maps data availability
3. **Retries**: Built-in retry logic handles temporary failures
4. **Backup**: Original data is never modified
5. **Artifacts**: GitHub stores results for 90 days automatically
