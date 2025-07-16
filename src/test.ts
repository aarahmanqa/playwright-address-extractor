#!/usr/bin/env node

import { AddressExtractor } from './addressExtractor';

async function testSingleExtraction() {
  console.log('🧪 Testing single address extraction...');
  
  const extractor = new AddressExtractor({
    headless: false,  // Show browser for testing
    timeout: 30000
  });

  try {
    await extractor.initialize();
    
    // Test with a sample ZIP code
    const result = await extractor.extractAddress('99501', 'AK');
    
    console.log('\n📋 Test Result:');
    console.log('='.repeat(30));
    console.log(`ZIP Code: ${result.zipcode}`);
    console.log(`State: ${result.state}`);
    console.log(`Address: ${result.addressline}`);
    console.log(`City: ${result.city}`);
    console.log(`Valid: ${result.valid ? '✅' : '❌'}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
    console.log('='.repeat(30));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await extractor.close();
  }
}

if (require.main === module) {
  testSingleExtraction().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}
