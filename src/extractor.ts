#!/usr/bin/env node

import { ParallelProcessor } from './parallelProcessor';
import { CsvUtils } from './csvUtils';
import { ExtractorConfig, AddressResult } from './types';

async function main() {
  const args = process.argv.slice(2);
  const isSample = args.includes('--sample');
  
  // Configuration optimized for large-scale processing
  const config: ExtractorConfig = {
    headless: true,  // Run in headless mode as requested
    maxConcurrency: 5,  // Increased parallel browsers for faster processing
    timeout: 45000,  // 45 second timeout (balanced for reliability and speed)
    retries: 2,  // Retry failed extractions twice for better success rate
    sampleSize: isSample ? 10 : undefined  // Process only 10 records for sample
  };

  const inputFile = 'ZipcodeState.csv';
  const outputFile = isSample ? 'sample_addresses.csv' : 'ZipcodeState_with_addresses.csv';
  const detailedOutputFile = isSample ? 'sample_addresses_detailed.csv' : 'ZipcodeState_with_addresses_detailed.csv';

  console.log('🗺️  Google Maps Address Extractor');
  console.log('='.repeat(50));
  console.log(`Mode: ${isSample ? 'SAMPLE (10 records)' : 'FULL PROCESSING'}`);
  console.log(`Headless: ${config.headless}`);
  console.log(`Concurrency: ${config.maxConcurrency}`);
  console.log(`Input: ${inputFile}`);
  console.log(`Output: ${outputFile}`);
  console.log('='.repeat(50));

  const processor = new ParallelProcessor(config);

  try {
    // Read input data
    console.log('\n📖 Reading input data...');
    const zipCodes = await CsvUtils.readZipCodes(inputFile, config.sampleSize);
    
    if (zipCodes.length === 0) {
      console.error('❌ No data found in input file');
      process.exit(1);
    }

    // Initialize parallel processor
    await processor.initialize();

    // Process the data with incremental saving
    console.log('\n🚀 Starting address extraction...');
    const startTime = Date.now();

    // Create incremental save callback
    const saveCallback = async (results: AddressResult[]) => {
      await CsvUtils.writeResults(outputFile, results);
      await CsvUtils.writeDetailedResults(detailedOutputFile, results);
    };

    const results = await processor.processInParallel(zipCodes, saveCallback);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Final save (in case the last batch wasn't saved)
    console.log('\n💾 Saving final results...');
    await CsvUtils.writeResults(outputFile, results);
    await CsvUtils.writeDetailedResults(detailedOutputFile, results);

    // Generate summary
    CsvUtils.generateSummary(results);
    
    console.log(`\n⏱️  Total time: ${duration.toFixed(1)} seconds`);
    console.log(`⚡ Average time per record: ${(duration / results.length).toFixed(2)} seconds`);
    
    console.log('\n🎉 Extraction completed successfully!');
    
    if (isSample) {
      console.log('\n💡 To process all records, run: npm run extract');
    }

  } catch (error) {
    console.error('❌ Error during extraction:', error);
    process.exit(1);
  } finally {
    await processor.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received interrupt signal, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received terminate signal, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
