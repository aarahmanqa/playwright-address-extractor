# Google Maps Address Extractor (Playwright TypeScript)

A fast, reliable, and parallel address extraction solution using Playwright and TypeScript. Extracts real petrol bunk addresses from Google Maps for given ZIP codes and states.

## 🚀 Features

- **Parallel Processing**: Runs multiple browsers concurrently for faster extraction
- **Headless Mode**: Runs in background for maximum speed
- **TypeScript**: Type-safe and maintainable code
- **Retry Logic**: Automatically retries failed extractions
- **Progress Tracking**: Real-time progress updates and detailed logging
- **Sample Mode**: Test with small datasets before full processing
- **Validation**: Validates extracted addresses for quality assurance

## 📋 Requirements

- Node.js 16+ 
- npm or yarn

## 🛠️ Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npm run setup
   ```

## 🎯 Usage

### Quick Test (Sample Mode)
Process only 10 records to test the setup:
```bash
npm run extract-sample
```

### Full Processing
Process all records in your CSV file:
```bash
npm run extract
```

### Single Test (with visible browser)
Test with one ZIP code to see the browser in action:
```bash
npx ts-node src/test.ts
```

## ⚙️ Configuration

Edit `src/extractor.ts` to customize:

```typescript
const config: ExtractorConfig = {
  headless: true,        // Set to false to see browsers
  maxConcurrency: 3,     // Number of parallel browsers
  timeout: 30000,        // Timeout per extraction (ms)
  retries: 2,           // Number of retries for failed extractions
  sampleSize: 10        // For sample mode only
};
```

## 📁 Input/Output

### Input Format
Your `ZipcodeState.csv` should have:
```csv
zipcode,state
99501,AK
99502,AK
35004,AL
85001,AZ
```

### Output Files
- `ZipcodeState_with_addresses.csv` - Clean results
- `ZipcodeState_with_addresses_detailed.csv` - Detailed results with validation info

### Output Format
```csv
zipcode,state,addressline,city
99501,AK,1234 Main St,Anchorage
99502,AK,5678 Oak Ave,Anchorage
35004,AL,Not Found,Not Found
85001,AZ,9012 Central Blvd,Phoenix
```

## 🏃‍♂️ Performance

- **Parallel Processing**: 3 browsers running simultaneously
- **Headless Mode**: ~2-3 seconds per record
- **Sample Processing**: ~30 seconds for 10 records
- **Full Processing**: Estimated 3-4 hours for 41,000 records

## 📊 Progress Tracking

The extractor provides real-time updates:
```
🔍 Searching for petrol bunk in 99501, AK
✅ Found address: 901 E 15th Ave, Anchorage (Valid: true)
📈 Progress: 3/10 (30.0%)
```

## 🔧 Troubleshooting

### Common Issues

1. **Browser not found**
   ```bash
   npm run setup
   ```

2. **Memory issues with large datasets**
   - Reduce `maxConcurrency` to 2 or 1
   - Process in smaller batches

3. **Rate limiting**
   - The script includes delays between batches
   - Reduce `maxConcurrency` if needed

### Logs and Debugging

- Set `headless: false` to see browser actions
- Check console output for detailed progress
- Use sample mode first to verify setup

## 📈 Sample vs Full Processing

### Sample Mode (`npm run extract-sample`)
- Processes 10 records
- Takes ~30 seconds
- Perfect for testing and validation
- Outputs: `sample_addresses.csv`

### Full Mode (`npm run extract`)
- Processes all 41,000+ records
- Takes 3-4 hours
- Runs in parallel with 3 browsers
- Outputs: `ZipcodeState_with_addresses.csv`

## 🎛️ Advanced Usage

### Custom Sample Size
```bash
# Edit src/extractor.ts and change sampleSize
sampleSize: 50  // Process 50 records instead of 10
```

### Different Concurrency
```bash
# Edit src/extractor.ts
maxConcurrency: 5  // Use 5 parallel browsers
```

### Visible Browsers (for debugging)
```bash
# Edit src/extractor.ts
headless: false  // Show browser windows
```

## 📋 Project Structure

```
src/
├── types.ts              # TypeScript interfaces
├── addressExtractor.ts   # Core extraction logic
├── parallelProcessor.ts  # Parallel processing manager
├── csvUtils.ts          # CSV reading/writing utilities
├── extractor.ts         # Main application entry point
└── test.ts             # Single extraction test
```

## 🚦 Getting Started

1. **Quick test:**
   ```bash
   npm install
   npm run setup
   npm run extract-sample
   ```

2. **If sample works well:**
   ```bash
   npm run extract
   ```

3. **Monitor progress and wait for completion**

## 💡 Tips

- Start with sample mode to verify everything works
- Monitor the first few extractions to ensure quality
- The script can be interrupted and resumed (manual restart needed)
- Results are saved progressively, so partial results are preserved

## 🆘 Support

If you encounter issues:
1. Try sample mode first
2. Check that your CSV file format is correct
3. Ensure you have a stable internet connection
4. Reduce concurrency if you see errors
