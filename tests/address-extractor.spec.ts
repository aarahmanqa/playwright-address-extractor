import { test, expect, Page, BrowserContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { parse } from 'csv-parser';
import { createReadStream } from 'fs';

interface ZipCodeData {
  zipcode: string;
  state: string;
}

interface AddressResult {
  zipcode: string;
  state: string;
  addressline: string;
  city: string;
  valid: boolean;
  error?: string;
}

class GoogleMapsAddressExtractor {
  private page: Page;
  private context: BrowserContext;
  private stepCounter = 0;

  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;
  }

  private async takeStepScreenshot(stepDescription: string): Promise<void> {
    this.stepCounter++;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tests/screenshots/step-${this.stepCounter.toString().padStart(2, '0')}-${timestamp}.png`;
    
    await this.page.screenshot({ 
      path: filename, 
      fullPage: true 
    });
    
    console.log(`📸 Step ${this.stepCounter}: ${stepDescription} - Screenshot saved: ${filename}`);
  }

  private async reportStepFailure(stepNumber: number, error: string): Promise<void> {
    console.error(`❌ FAILURE AT STEP ${stepNumber}: ${error}`);
    await this.takeStepScreenshot(`FAILURE-${error.substring(0, 50)}`);
    throw new Error(`Step ${stepNumber} failed: ${error}`);
  }

  async extractAddress(zipcode: string, state: string): Promise<AddressResult> {
    try {
      // Step 1: Navigate to Google Maps search
      console.log(`🔍 Starting address extraction for ${zipcode}, ${state}`);
      await this.takeStepScreenshot(`Starting extraction for ${zipcode}, ${state}`);

      const searchUrl = `https://www.google.com/maps/search/Petrol+bunk+in+${zipcode},${state}`;
      console.log(`📍 Step 1: Navigating to: ${searchUrl}`);
      
      try {
        await this.page.goto(searchUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: 60000 
        });
        await this.takeStepScreenshot(`Navigated to Google Maps search`);
      } catch (error) {
        await this.reportStepFailure(1, `Navigation failed: ${error}`);
      }

      // Step 2: Wait for page to load and handle any popups
      console.log(`📍 Step 2: Waiting for page to load and handling popups`);
      try {
        await this.page.waitForTimeout(3000);
        
        // Handle cookie consent if present
        const cookieButton = this.page.locator('button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Accept")').first();
        if (await cookieButton.isVisible({ timeout: 5000 })) {
          await cookieButton.click();
          console.log(`✅ Accepted cookies`);
        }
        
        await this.takeStepScreenshot(`Page loaded, popups handled`);
      } catch (error) {
        await this.reportStepFailure(2, `Page loading failed: ${error}`);
      }

      // Step 3: Wait for search results to appear
      console.log(`📍 Step 3: Waiting for search results`);
      try {
        // Wait for any of these selectors that indicate search results
        await this.page.waitForSelector([
          'div[role="article"]',
          '.Nv2PK',
          '.hfpxzc',
          '[data-result-index]',
          '.section-result'
        ].join(','), { timeout: 30000 });
        
        await this.takeStepScreenshot(`Search results appeared`);
      } catch (error) {
        await this.reportStepFailure(3, `No search results found: ${error}`);
      }

      // Step 4: Find and click the first search result
      console.log(`📍 Step 4: Finding and clicking first search result`);
      let resultClicked = false;
      
      const resultSelectors = [
        'div[data-result-index="0"]',
        'div[role="article"]:first-child',
        '.Nv2PK:first-child',
        'a[data-result-index="0"]',
        '.hfpxzc:first-child',
        '.section-result:first-child'
      ];

      for (const selector of resultSelectors) {
        try {
          const element = await this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 5000 })) {
            await element.click();
            await this.page.waitForTimeout(3000);
            resultClicked = true;
            console.log(`✅ Clicked first result using selector: ${selector}`);
            break;
          }
        } catch (error) {
          console.log(`⚠️  Selector ${selector} not found, trying next...`);
          continue;
        }
      }

      if (!resultClicked) {
        await this.reportStepFailure(4, 'No clickable search results found');
      }

      await this.takeStepScreenshot(`First result clicked`);

      // Step 5: Extract address information
      console.log(`📍 Step 5: Extracting address information`);
      try {
        const addressInfo = await this.extractAddressFromPage();
        await this.takeStepScreenshot(`Address extraction completed`);
        
        if (addressInfo.addressline && addressInfo.city) {
          const isValid = this.validateAddress(addressInfo.addressline, addressInfo.city);
          console.log(`✅ Found address: ${addressInfo.addressline}, ${addressInfo.city} (Valid: ${isValid})`);
          
          return {
            zipcode,
            state,
            addressline: addressInfo.addressline,
            city: addressInfo.city,
            valid: isValid
          };
        } else {
          await this.reportStepFailure(5, 'Could not extract valid address information');
        }
      } catch (error) {
        await this.reportStepFailure(5, `Address extraction failed: ${error}`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${zipcode}, ${state}:`, error);
      return {
        zipcode,
        state,
        addressline: 'Error',
        city: 'Error',
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // This should never be reached due to the reportStepFailure calls above
    return {
      zipcode,
      state,
      addressline: 'Not Found',
      city: 'Not Found',
      valid: false,
      error: 'Extraction failed'
    };
  }

  private async extractAddressFromPage(): Promise<{ addressline: string; city: string }> {
    // Multiple selectors to try for address
    const addressSelectors = [
      'button[data-item-id="address"]',
      'div[data-item-id="address"]',
      '.rogA2c .fontBodyMedium',
      '.Io6YTe.fontBodyMedium',
      '.rogA2c',
      '[data-value="Address"]',
      'div.fontBodyMedium span',
      '.AeaXub .fontBodyMedium',
      '.Io6YTe',
      '.fontBodyMedium'
    ];

    let addressText = '';
    
    for (const selector of addressSelectors) {
      try {
        const elements = await this.page.locator(selector).all();
        for (const element of elements) {
          const text = await element.textContent();
          if (text && text.length > 10 && this.looksLikeAddress(text)) {
            addressText = text.trim();
            break;
          }
        }
        if (addressText) break;
      } catch (error) {
        continue;
      }
    }

    if (!addressText) {
      // Try alternative method - look for any text that looks like an address
      const allElements = await this.page.locator('span, div').all();
      for (const element of allElements) {
        const text = await element.textContent();
        if (text && text.length > 15 && text.length < 200 && this.looksLikeAddress(text)) {
          addressText = text.trim();
          break;
        }
      }
    }

    if (addressText) {
      return this.parseAddress(addressText);
    }

    return { addressline: '', city: '' };
  }

  private looksLikeAddress(text: string): boolean {
    // Check if text looks like an address
    return /\d+.*?(St|Ave|Rd|Dr|Blvd|Way|Lane|Ln|Ct|Pl)/i.test(text);
  }

  private parseAddress(fullAddress: string): { addressline: string; city: string } {
    try {
      // Clean the address - remove special characters at the beginning
      fullAddress = fullAddress.replace(/^[·•\-\s]+/, '').trim();
      
      // Split by comma to separate components
      const parts = fullAddress.split(',').map(part => part.trim());
      
      if (parts.length >= 2) {
        // First part is usually the street address
        const addressline = parts[0];
        
        // Second part is usually the city (before state/zip)
        let city = parts[1];
        
        // Clean up city (remove state and zip if present)
        city = city.replace(/\s+[A-Z]{2}\s+\d{5}.*$/, '').trim();
        
        return { addressline, city };
      } else {
        // If no comma, try to extract based on patterns
        const streetMatch = fullAddress.match(/^(\d+.*?(?:St|Ave|Rd|Dr|Blvd|Way|Lane|Ln|Ct|Pl))/i);
        if (streetMatch) {
          const addressline = streetMatch[1];
          const remaining = fullAddress.substring(addressline.length).trim();
          const city = remaining.split(',')[0].trim() || 'Unknown';
          return { addressline, city };
        } else {
          return { addressline: fullAddress, city: 'Unknown' };
        }
      }
    } catch (error) {
      console.error('Error parsing address:', error);
      return { addressline: fullAddress, city: 'Unknown' };
    }
  }

  private validateAddress(addressline: string, city: string): boolean {
    if (!addressline || !city) return false;
    
    // Check if address line contains a number and street type
    const hasNumber = /\d+/.test(addressline);
    const hasStreetType = /\b(St|Ave|Rd|Dr|Blvd|Way|Lane|Ln|Ct|Pl|Street|Avenue|Road|Drive|Boulevard)\b/i.test(addressline);
    
    // Check if city looks reasonable
    const cityValid = city.length > 2 && !/\d{3,}/.test(city) && city !== 'Unknown';
    
    // Check for common invalid patterns
    const invalidPatterns = ['not found', 'error', 'n/a', 'null', 'undefined'];
    const containsInvalid = invalidPatterns.some(pattern => 
      addressline.toLowerCase().includes(pattern) || city.toLowerCase().includes(pattern)
    );
    
    return hasNumber && hasStreetType && cityValid && !containsInvalid;
  }
}

// Helper function to read CSV data
async function readZipCodeData(): Promise<ZipCodeData[]> {
  return new Promise((resolve, reject) => {
    const results: ZipCodeData[] = [];
    createReadStream('ZipcodeStateSmall.csv')
      .pipe(parse({ headers: true }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

test.describe('Google Maps Address Extractor', () => {
  test.beforeEach(async ({ context }) => {
    // Ensure fresh incognito session for each test
    console.log('🔄 Starting fresh incognito session');
  });

  test('should extract petrol bunk address for single ZIP code', async ({ page, context }) => {
    const extractor = new GoogleMapsAddressExtractor(page, context);
    
    // Test with first ZIP code from the CSV
    const result = await extractor.extractAddress('99501', 'AK');
    
    // Assertions
    expect(result.zipcode).toBe('99501');
    expect(result.state).toBe('AK');
    expect(result.addressline).not.toBe('Error');
    expect(result.addressline).not.toBe('Not Found');
    expect(result.city).not.toBe('Error');
    expect(result.city).not.toBe('Not Found');
    
    console.log('\n📋 Test Result:');
    console.log('='.repeat(50));
    console.log(`ZIP Code: ${result.zipcode}`);
    console.log(`State: ${result.state}`);
    console.log(`Address: ${result.addressline}`);
    console.log(`City: ${result.city}`);
    console.log(`Valid: ${result.valid ? '✅' : '❌'}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    console.log('='.repeat(50));
  });

  test('should extract addresses for all ZIP codes in CSV', async ({ page, context }) => {
    const extractor = new GoogleMapsAddressExtractor(page, context);
    const zipCodeData = await readZipCodeData();
    
    console.log(`📊 Processing ${zipCodeData.length} ZIP codes from CSV`);
    
    const results: AddressResult[] = [];
    
    for (const [index, data] of zipCodeData.entries()) {
      console.log(`\n🔄 Processing ${index + 1}/${zipCodeData.length}: ${data.zipcode}, ${data.state}`);
      
      const result = await extractor.extractAddress(data.zipcode, data.state);
      results.push(result);
      
      // Add delay between requests to avoid rate limiting
      if (index < zipCodeData.length - 1) {
        await page.waitForTimeout(2000);
      }
    }
    
    // Summary report
    const validResults = results.filter(r => r.valid);
    const errorResults = results.filter(r => r.error);
    
    console.log('\n📊 FINAL SUMMARY:');
    console.log('='.repeat(60));
    console.log(`Total processed: ${results.length}`);
    console.log(`Valid addresses: ${validResults.length}`);
    console.log(`Errors: ${errorResults.length}`);
    console.log(`Success rate: ${((validResults.length / results.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
    
    // Expect at least 50% success rate
    expect(validResults.length / results.length).toBeGreaterThan(0.5);
  });
});
