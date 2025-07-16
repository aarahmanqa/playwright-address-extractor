import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { ZipCodeData, AddressResult } from './types';

export class AddressExtractor {
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];

  constructor(private config: { headless: boolean; timeout: number }) {}

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
  }

  async createContext(): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    this.contexts.push(context);
    return context;
  }

async extractAddress(zipcode: string, state: string): Promise<AddressResult> {
    const context = await this.createContext();
    const page = await context.newPage();

    try {
      console.log(`🔍 Searching for gas station in ${zipcode}, ${state}`);
      
      // Navigate to Google Maps search with more robust approach
      const searchUrl = `https://www.google.com/maps/search/gas+station+in+${zipcode}+${state}`;
      console.log(`🌐 Navigating to: ${searchUrl}`);

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: this.config.timeout });
        console.log(`✅ Page loaded successfully`);
      } catch (error) {
        console.log(`⚠️ Trying alternative navigation approach...`);
        await page.goto(searchUrl, { waitUntil: 'load', timeout: this.config.timeout });
      }

      // Wait for search results to load
      await page.waitForTimeout(3000);

      // Try multiple search results to find a proper address
      const addressInfo = await this.tryMultipleResults(page, zipcode, state);
      
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
        console.log(`❌ Could not extract address for ${zipcode}, ${state}`);
        return {
          zipcode,
          state,
          addressline: 'Not Found',
          city: 'Not Found',
          valid: false,
          error: 'Address extraction failed'
        };
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
    } finally {
      await context.close();
      // Remove context from tracking
      this.contexts = this.contexts.filter(ctx => ctx !== context);
    }
  }

  private async tryMultipleResults(page: Page, zipcode: string, state: string): Promise<{ addressline: string; city: string }> {
    const resultSelectors = [
      'div[data-result-index="0"]',
      'div[data-result-index="1"]',
      'div[data-result-index="2"]',
      'div[role="article"]',
      '.Nv2PK',
      'a[data-result-index="0"]',
      'a[data-result-index="1"]',
      '.hfpxzc'
    ];

    // Try up to 3 different results to find a proper address
    for (let attempt = 0; attempt < 3; attempt++) {
      let resultClicked = false;

      // Try to click a search result
      for (const selector of resultSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > attempt) {
            await elements[attempt].click();
            await page.waitForTimeout(2000);
            resultClicked = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }

      if (!resultClicked) {
        if (attempt === 0) {
          console.log(`⚠️  No search results found for ${zipcode}, ${state}`);
        }
        break;
      }

      // Extract address from this result
      const addressInfo = await this.extractAddressFromPage(page);

      if (addressInfo.addressline && addressInfo.city) {
        // Check if this is a proper address (not a hotel, etc.)
        if (this.isProperAddress(addressInfo.addressline)) {
          return addressInfo;
        } else {
          console.log(`⚠️  Improper address found (attempt ${attempt + 1}): ${addressInfo.addressline}`);
          // Go back to search results to try next result
          await page.goBack();
          await page.waitForTimeout(1000);
        }
      }
    }

    return { addressline: '', city: '' };
  }

  private isProperAddress(addressline: string): boolean {
    // Check for improper address patterns
    const improperPatterns = [
      /hotel/i,
      /inn/i,
      /suites/i,
      /motel/i,
      /resort/i,
      /lodge/i,
      /\d+\.\d+\(\d+\)/,  // Rating patterns like "3.2(458)"
      /\d+-star/i,
      /restaurant/i,
      /cafe/i,
      /mall/i,
      /center/i,
      /plaza/i
    ];

    return !improperPatterns.some(pattern => pattern.test(addressline));
  }

  private async extractAddressFromPage(page: Page): Promise<{ addressline: string; city: string }> {
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
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await element.textContent();
          if (text && text.length > 10 && this.looksLikeAddress(text)) {
            addressText = this.cleanAddressText(text);
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
      const allElements = await page.$$('span, div');
      for (const element of allElements) {
        const text = await element.textContent();
        if (text && text.length > 15 && text.length < 200 && this.looksLikeAddress(text)) {
          addressText = this.cleanAddressText(text);
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

  private cleanAddressText(text: string): string {
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

  private parseAddress(fullAddress: string): { addressline: string; city: string } {
    try {
      // Clean the address - remove unwanted characters and normalize text
      fullAddress = this.cleanAddressText(fullAddress);

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

  async close(): Promise<void> {
    // Close all contexts
    await Promise.all(this.contexts.map(context => context.close()));
    this.contexts = [];
    
    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
