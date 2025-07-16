import { ZipCodeData, AddressResult, ExtractorConfig } from './types';
import { AddressExtractor } from './addressExtractor';

export class ParallelProcessor {
  private extractors: AddressExtractor[] = [];
  
  constructor(private config: ExtractorConfig) {}

  async initialize(): Promise<void> {
    console.log(`🚀 Initializing ${this.config.maxConcurrency} parallel extractors...`);
    
    for (let i = 0; i < this.config.maxConcurrency; i++) {
      const extractor = new AddressExtractor({
        headless: this.config.headless,
        timeout: this.config.timeout
      });
      await extractor.initialize();
      this.extractors.push(extractor);
    }
    
    console.log(`✅ ${this.extractors.length} extractors ready`);
  }

  async processInParallel(data: ZipCodeData[], saveCallback?: (results: AddressResult[]) => Promise<void>): Promise<AddressResult[]> {
    const results: AddressResult[] = [];
    const chunks = this.chunkArray(data, this.config.maxConcurrency);

    console.log(`📊 Processing ${data.length} records in ${chunks.length} batches`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n🔄 Processing batch ${i + 1}/${chunks.length} (${chunk.length} items)`);

      const batchPromises = chunk.map((item, index) => {
        const extractorIndex = index % this.extractors.length;
        return this.processWithRetry(
          this.extractors[extractorIndex],
          item.zipcode,
          item.state
        );
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Progress update
      const processed = results.length;
      const total = data.length;
      const percentage = ((processed / total) * 100).toFixed(1);
      console.log(`📈 Progress: ${processed}/${total} (${percentage}%)`);

      // Save incrementally every 50 batches (250 records) or at the end
      if (saveCallback && (i % 50 === 0 || i === chunks.length - 1)) {
        console.log(`💾 Saving incremental progress...`);
        await saveCallback(results);
      }

      // Small delay between batches to avoid overwhelming the server
      if (i < chunks.length - 1) {
        await this.delay(1000);
      }
    }

    return results;
  }

  private async processWithRetry(
    extractor: AddressExtractor,
    zipcode: string,
    state: string
  ): Promise<AddressResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        const result = await extractor.extractAddress(zipcode, state);
        
        // If we got a valid result or it's clearly not found, return it
        if (result.valid || result.addressline === 'Not Found') {
          return result;
        }
        
        // If it's an error and we have retries left, try again
        if (attempt < this.config.retries && result.error) {
          console.log(`🔄 Retry ${attempt}/${this.config.retries} for ${zipcode}, ${state}`);
          await this.delay(2000 * attempt); // Exponential backoff
          continue;
        }
        
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.config.retries) {
          console.log(`🔄 Retry ${attempt}/${this.config.retries} for ${zipcode}, ${state} due to error:`, error);
          await this.delay(2000 * attempt);
        }
      }
    }
    
    // All retries failed
    return {
      zipcode,
      state,
      addressline: 'Error',
      city: 'Error',
      valid: false,
      error: lastError?.message || 'Max retries exceeded'
    };
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    console.log('🔄 Closing all extractors...');
    await Promise.all(this.extractors.map(extractor => extractor.close()));
    this.extractors = [];
    console.log('✅ All extractors closed');
  }
}
