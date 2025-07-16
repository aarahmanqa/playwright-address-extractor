import * as fs from 'fs';
import csv from 'csv-parser';
import * as createCsvWriter from 'csv-writer';
import { ZipCodeData, AddressResult } from './types';

export class CsvUtils {
  static cleanText(text: string): string {
    if (!text) return text;

    // Remove unwanted Unicode characters and normalize text
    return text
      // Remove the specific problematic Unicode character (U+E0C8) and similar
      .replace(/[\uE000-\uF8FF]/g, '') // Remove private use area characters
      // Remove common unwanted characters at the beginning
      .replace(/^[·•\-\s\u2022\u2023\u25E6\u2043\u204C\u204D\u2219\u25AA\u25AB\u25CF\u25CB]+/, '')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Remove other problematic Unicode characters
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Replace various spaces with regular space
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      // Trim whitespace
      .trim();
  }

  static async readZipCodes(filePath: string, sampleSize?: number): Promise<ZipCodeData[]> {
    return new Promise((resolve, reject) => {
      const results: ZipCodeData[] = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data: any) => {
          if (data.zipcode && data.state) {
            results.push({
              zipcode: data.zipcode.trim(),
              state: data.state.trim()
            });
            
            // If we have a sample size limit and reached it, stop reading
            if (sampleSize && results.length >= sampleSize) {
              return;
            }
          }
        })
        .on('end', () => {
          const finalResults = sampleSize ? results.slice(0, sampleSize) : results;
          console.log(`📖 Read ${finalResults.length} ZIP codes from ${filePath}`);
          resolve(finalResults);
        })
        .on('error', (error: any) => {
          reject(error);
        });
    });
  }

  static async writeResults(filePath: string, results: AddressResult[]): Promise<void> {
    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'zipcode', title: 'zipcode' },
        { id: 'state', title: 'state' },
        { id: 'addressline', title: 'addressline' },
        { id: 'city', title: 'city' }
      ]
    });

    // Filter out error entries and clean text for the final output
    const cleanResults = results.map(result => ({
      zipcode: result.zipcode,
      state: result.state,
      addressline: CsvUtils.cleanText(result.addressline === 'Error' ? 'Not Found' : result.addressline),
      city: CsvUtils.cleanText(result.city === 'Error' ? 'Not Found' : result.city)
    }));

    await csvWriter.writeRecords(cleanResults);
    console.log(`💾 Results saved to ${filePath}`);
  }

  static async writeDetailedResults(filePath: string, results: AddressResult[]): Promise<void> {
    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'zipcode', title: 'zipcode' },
        { id: 'state', title: 'state' },
        { id: 'addressline', title: 'addressline' },
        { id: 'city', title: 'city' },
        { id: 'valid', title: 'valid' },
        { id: 'error', title: 'error' }
      ]
    });

    // Clean text in detailed results as well
    const cleanResults = results.map(result => ({
      ...result,
      addressline: CsvUtils.cleanText(result.addressline),
      city: CsvUtils.cleanText(result.city),
      error: result.error ? CsvUtils.cleanText(result.error) : result.error
    }));

    await csvWriter.writeRecords(cleanResults);
    console.log(`💾 Detailed results saved to ${filePath}`);
  }

  static generateSummary(results: AddressResult[]): void {
    const total = results.length;
    const valid = results.filter(r => r.valid).length;
    const notFound = results.filter(r => r.addressline === 'Not Found').length;
    const errors = results.filter(r => r.addressline === 'Error').length;
    
    console.log('\n📊 EXTRACTION SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total processed: ${total}`);
    console.log(`Valid addresses: ${valid} (${((valid / total) * 100).toFixed(1)}%)`);
    console.log(`Not found: ${notFound} (${((notFound / total) * 100).toFixed(1)}%)`);
    console.log(`Errors: ${errors} (${((errors / total) * 100).toFixed(1)}%)`);
    console.log('='.repeat(50));
    
    if (valid > 0) {
      console.log('\n✅ Sample valid addresses:');
      results
        .filter(r => r.valid)
        .slice(0, 3)
        .forEach(r => {
          console.log(`  ${r.zipcode}, ${r.state}: ${r.addressline}, ${r.city}`);
        });
    }
    
    if (errors > 0) {
      console.log('\n❌ Sample errors:');
      results
        .filter(r => r.error)
        .slice(0, 3)
        .forEach(r => {
          console.log(`  ${r.zipcode}, ${r.state}: ${r.error}`);
        });
    }
  }
}
