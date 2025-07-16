import { test } from "@playwright/test";
import { writeFileSync, existsSync, readFileSync } from 'fs';

// Configuration - Set the target state(s) here
// Examples:
// const TARGET_STATE: string | string[] = 'DC';           // Single state
// const TARGET_STATE: string | string[] = ['DC', 'CO'];   // Multiple states
// const TARGET_STATE: string | string[] = 'ALL';          // All states
const TARGET_STATE: string | string[] = 'ALL'; // Change this to run for specific state(s) or 'ALL' for all states

// GitHub Actions sharding configuration
const SHARD_INDEX = parseInt(process.env.SHARD_INDEX || '0');
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '1');
const IS_CI = process.env.CI === 'true';
const MAX_RECORDS_PER_SHARD = parseInt(process.env.MAX_RECORDS_PER_SHARD || '1000'); // Limit per shard for efficiency

// Search types in order of preference
const SEARCH_TYPES = [
  'post office',
  'schools',
  'colleges',
  'petrol stations',
  'government office',
  'apartments',
  'hospitals',
  "pharmacies",
  "police station"
];

// Validation function for address line
function isValidAddressLine(addressLine: string | null | undefined): boolean {
  if (!addressLine || addressLine.trim().length === 0) {
    return false;
  }

  // Check if it contains a number (street number)
  const hasNumber = /\d/.test(addressLine);

  // Check if it contains common street suffixes
  const streetSuffixes = /\b(St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Way|Lane|Ln|Ct|Court|Pl|Place|Cir|Circle|Pkwy|Parkway|Hwy|Highway)\b/i;
  const hasStreetSuffix = streetSuffixes.test(addressLine);

  // Check for improper patterns (business names, ratings, etc.)
  const improperPatterns = [
    /\d+\.\d+\(\d+\)/, // Rating patterns like "4.2(123)"
    /\d+-star/i,       // Star ratings
    /hotel|inn|suites|motel|resort|lodge/i, // Accommodation types
    /restaurant|cafe|mall|center|plaza/i,   // Business types
    /gas station|convenience store/i,       // Business descriptions
    /open \d+|closed|hours/i               // Operating hours
  ];

  const hasImproperPattern = improperPatterns.some(pattern => pattern.test(addressLine));

  // Valid if has number AND street suffix AND no improper patterns
  return hasNumber && hasStreetSuffix && !hasImproperPattern;
}

// Validation function for US city names
function isValidCity(city: string | null | undefined): boolean {
  if (!city || city.trim().length === 0) {
    return false;
  }

  const cleanCity = city.trim();

  // Check minimum length (at least 2 characters)
  if (cleanCity.length < 2) {
    return false;
  }

  // Check if it contains only valid characters for US city names
  // Letters, spaces, apostrophes, hyphens, and periods (for abbreviations like St.)
  const cityPattern = /^[a-zA-Z\s'\-\.]+$/;
  if (!cityPattern.test(cleanCity)) {
    return false;
  }

  // Reject common invalid patterns
  const invalidPatterns = [
    /^unknown$/i,           // "Unknown"
    /^n\/a$/i,             // "N/A"
    /^null$/i,             // "null"
    /^undefined$/i,        // "undefined"
    /^\d+$/,               // Only numbers
    /^[^a-zA-Z]*$/,        // No letters at all
    /\d{5}/,               // Contains ZIP code pattern
    /\b(gas|station|store|shop|mart|center|plaza)\b/i, // Business terms
    /\b(open|closed|hours|24\/7)\b/i, // Operating hours terms
    /\d+\.\d+\(\d+\)/      // Rating patterns like "4.2(123)"
  ];

  const hasInvalidPattern = invalidPatterns.some(pattern => pattern.test(cleanCity));
  if (hasInvalidPattern) {
    return false;
  }

  // Check for reasonable length (most US city names are under 50 characters)
  if (cleanCity.length > 50) {
    return false;
  }

  // Must start with a letter
  if (!/^[a-zA-Z]/.test(cleanCity)) {
    return false;
  }

  return true;
}

// Function to update data in FinalZipcodeState.csv file
function updateFinalCSV(zipcode: string, state: string, addressLine: string, city: string) {
  // Use sharded output file in CI mode, regular file locally
  const csvFilePath = TOTAL_SHARDS > 1 ? `FinalZipcodeState_shard_${SHARD_INDEX}.csv` : 'FinalZipcodeState.csv';

  if (!existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    return;
  }

  // Read the entire CSV file
  let csvContent = readFileSync(csvFilePath, 'utf-8');
  let lines = csvContent.split('\n');

  // Check if the header already has address and city columns
  let header = lines[0];
  let headerColumns = header.split(',');
  let hasAddressColumn = headerColumns.includes('address');
  let hasCityColumn = headerColumns.includes('city');

  // Update header if needed
  if (!hasAddressColumn || !hasCityColumn) {
    header = 'zipcode,state,address,city';
    lines[0] = header;
    headerColumns = header.split(',');
  }

  // Find the row with matching zipcode and state
  let rowIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;

    const columns = lines[i].split(',');
    if (columns.length >= 2 && columns[0] === zipcode && columns[1] === state) {
      rowIndex = i;
      break;
    }
  }

  if (rowIndex === -1) {
    console.error(`❌ Row not found for zipcode ${zipcode}, state ${state}`);
    return;
  }

  // Ensure the row has at least 4 columns
  const rowColumns = lines[rowIndex].split(',');
  while (rowColumns.length < 4) {
    rowColumns.push('""');
  }

  // Update the row with new address and city
  const columns = rowColumns.map((col: string) => col.replace(/^"|"$/g, '')); // Remove quotes for processing

  // Update address and city columns
  columns[2] = addressLine; // address column
  columns[3] = city;        // city column

  // Rebuild the row with proper quoting
  lines[rowIndex] = `${columns[0]},${columns[1]},"${columns[2]}","${columns[3]}"`;

  // Write the updated content back to the file
  writeFileSync(csvFilePath, lines.join('\n'));
  console.log(`💾 Updated data for ${zipcode}, ${state} in ${csvFilePath}`);
}

// Function to read ZIP codes and states from CSV file
function readZipCodesFromCSV(): { zipcode: string, state: string }[] {
  const csvFilePath = 'FinalZipcodeState.csv';

  if (!existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    return [];
  }

  const csvContent = readFileSync(csvFilePath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');

  // Get header to determine column indices
  const header = lines[0].split(',');
  const addressIndex = header.indexOf('address');
  const cityIndex = header.indexOf('city');

  if (addressIndex === -1 || cityIndex === -1) {
    console.error(`❌ CSV file does not have address or city columns`);
    return [];
  }

  // Skip header row and parse data
  let zipCodes = lines.slice(1).map(line => {
    const columns = line.split(',').map(item => item.trim().replace(/^"|"$/g, '')); // Remove quotes
    const zipcode = columns[0];
    const state = columns[1];
    const address = columns[addressIndex];
    const city = columns[cityIndex];

    return { zipcode, state, address, city };
  }).filter(item => item.zipcode && item.state); // Filter out empty rows

  // Filter by target state(s) if specified
  let stateFiltered = zipCodes;
  if (TARGET_STATE !== 'ALL') {
    if (Array.isArray(TARGET_STATE)) {
      // Multiple states specified
      stateFiltered = zipCodes.filter(item => TARGET_STATE.includes(item.state));
      console.log(`📖 Filtered to ${stateFiltered.length} ZIP codes for states: ${TARGET_STATE.join(', ')}`);
    } else {
      // Single state specified
      stateFiltered = zipCodes.filter(item => item.state === TARGET_STATE);
      console.log(`📖 Filtered to ${stateFiltered.length} ZIP codes for state: ${TARGET_STATE}`);
    }
  } else {
    console.log(`📖 Read ${stateFiltered.length} ZIP codes from ${csvFilePath}`);
  }

  // Filter out records that already have address and city
  const noAddressRecords = stateFiltered.filter(item =>
    !item.address || item.address === '' ||
    !item.city || item.city === '' //||
    // item.address === 'Not Found' || item.city === 'Not Found' ||
    // item.address === 'Error' || item.city === 'Error'
  );

  console.log(`📖 Found ${noAddressRecords.length} ZIP codes without address/city data`);

  // Apply sharding for GitHub Actions
  let finalRecords = noAddressRecords;
  if (TOTAL_SHARDS > 1) {
    const recordsPerShard = Math.ceil(noAddressRecords.length / TOTAL_SHARDS);
    const startIndex = SHARD_INDEX * recordsPerShard;
    const endIndex = Math.min(startIndex + recordsPerShard, noAddressRecords.length);

    // Apply max records per shard limit for efficiency, but ensure we don't skip records
    const actualEndIndex = Math.min(endIndex, startIndex + MAX_RECORDS_PER_SHARD);

    finalRecords = noAddressRecords.slice(startIndex, actualEndIndex);

    console.log(`🔀 Shard ${SHARD_INDEX + 1}/${TOTAL_SHARDS}: Processing records ${startIndex + 1}-${actualEndIndex} (${finalRecords.length} records)`);
    console.log(`📊 Total records available: ${noAddressRecords.length}, This shard range: ${startIndex}-${actualEndIndex-1}`);

    if (IS_CI) {
      console.log(`🤖 Running in CI mode with optimized settings`);
    }

    // Warn if we're not processing all records due to MAX_RECORDS_PER_SHARD limit
    if (actualEndIndex < endIndex) {
      console.log(`⚠️ Limiting to ${MAX_RECORDS_PER_SHARD} records per shard. Increase MAX_RECORDS_PER_SHARD or add more shards to process all data.`);
    }
  }

  // Return only zipcode and state for compatibility with the rest of the code
  return finalRecords.map(item => ({ zipcode: item.zipcode, state: item.state }));
}

// Function to search for a specific type of location
async function searchForLocationType(page: any, zipcode: string, state: string, searchType: string): Promise<{ addressLine: string, city: string } | null> {
  console.log(`🔍 Searching for ${searchType} in ${zipcode}, ${state}`);

  try {
    const searchQuery = `${searchType}+in+${zipcode}+${state}+USA`;
    await page.goto(`https://www.google.com/maps/search/${searchQuery}`);

    // Wait for search results to load
    await page.waitForTimeout(2000);

    let searchResults = await page.locator("//div/a[contains(@href,'https://www.google.com/maps')]").all();

    for (let searchResult of searchResults) {
      try {
        await searchResult.click();
        await page.waitForTimeout(1000);

        let completeAddress = await page.locator("button[data-item-id='address']").getAttribute("aria-label");

        if (!completeAddress) continue;

        let addressLine = completeAddress?.replace("Address: ", "")?.split(",")[0].trim();
        let city = completeAddress?.split(",")[1]?.trim();
        let stateInCompleteAddress = completeAddress?.split(',')[2]?.trim().split(" ")[0]?.trim();
        let zipcodeInCompleteAddress = completeAddress?.split(',')[2]?.trim().split(" ")[1]?.trim();

        // Check if the address matches the expected state and zipcode
        if(stateInCompleteAddress !== state || zipcodeInCompleteAddress !== zipcode) {
          console.log(`${zipcode}: Address mismatch - Expected: ${zipcode}, ${state} | Found: ${zipcodeInCompleteAddress}, ${stateInCompleteAddress}`);
          continue;
        }

        // Validate address line and city
        const isAddressValid = isValidAddressLine(addressLine);
        const isCityValid = isValidCity(city);

        console.log(`${zipcode}: ${searchType} - Address: ${addressLine} (Valid: ${isAddressValid}), City: ${city} (Valid: ${isCityValid})`);

        if (isAddressValid && isCityValid) {
          console.log(`${zipcode}: ✅ Valid ${searchType} address found!`);
          return { addressLine: addressLine || "", city: city || "" };
        }
      } catch (innerError) {
        console.log(`${zipcode}: Error processing search result for ${searchType}:`, innerError);
        continue;
      }
    }

    console.log(`${zipcode}: ❌ No valid ${searchType} address found`);
    return null;

  } catch (error) {
    console.error(`${zipcode}: ❌ Error searching for ${searchType}:`, error);
    return null;
  }
}

// Function to process a single ZIP code with multiple search types
async function processZipCode(page: any, zipcode: string, state: string) {
  console.log(`🔍 Processing: ${zipcode}, ${state} (no existing address/city data)`);

  try {
    let foundValidAddress = false;
    let finalAddress = "";
    let finalCity = "";

    // Try each search type in order until we find a valid address
    for (const searchType of SEARCH_TYPES) {
      const result = await searchForLocationType(page, zipcode, state, searchType);

      if (result) {
        foundValidAddress = true;
        finalAddress = result.addressLine;
        finalCity = result.city;
        console.log(`${zipcode}: ✅ Successfully found address using ${searchType}: ${finalAddress}, ${finalCity}`);
        break;
      }
    }

    if (foundValidAddress) {
      // Update the CSV file with the found address
      updateFinalCSV(zipcode, state, finalAddress, finalCity);
    } else {
      console.log(`${zipcode}: ⚠️ No valid address found after trying all search types`);
      // Update record with "Not Found" values
      updateFinalCSV(zipcode, state, "Not Found", "Not Found");
    }

  } catch (error) {
    console.error(`${zipcode}: ❌ Error processing ${zipcode}, ${state}:`, error);
    // Update record with "Error" values
    updateFinalCSV(zipcode, state, "Error", "Error");
  }
}

// Function to initialize CSV with proper headers
function initializeCSVHeaders() {
  const csvFilePath = TOTAL_SHARDS > 1 ? `FinalZipcodeState_shard_${SHARD_INDEX}.csv` : 'FinalZipcodeState.csv';

  // For sharded processing, create a new file with just the header if it doesn't exist
  if (TOTAL_SHARDS > 1 && !existsSync(csvFilePath)) {
    writeFileSync(csvFilePath, 'zipcode,state,address,city\n');
    console.log(`📝 Created new shard file: ${csvFilePath}`);
    return;
  }

  if (!existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    return;
  }

  let csvContent = readFileSync(csvFilePath, 'utf-8');
  let lines = csvContent.split('\n');

  // Check if the header already has address and city columns
  let header = lines[0];
  let headerColumns = header.split(',');
  let hasAddressColumn = headerColumns.includes('address');
  let hasCityColumn = headerColumns.includes('city');

  // Update header if needed
  if (!hasAddressColumn || !hasCityColumn) {
    header = 'zipcode,state,address,city';
    lines[0] = header;
    console.log(`📝 Updated CSV header to include address and city columns`);
  } else {
    console.log(`✅ CSV headers already properly configured in ${csvFilePath}`);
  }

  // Ensure all data rows have the correct number of columns and remove corrupted rows
  let updatedRows = 0;
  let cleanedLines = [lines[0]]; // Keep the header

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;

    const columns = lines[i].split(',');

    // Skip corrupted rows that start with empty values
    if (columns[0] === '' || columns[0] === '""') {
      continue;
    }

    // Ensure we have exactly 4 columns
    if (columns.length === 2) {
      // Add empty address and city columns
      columns.push('""', '""');
      updatedRows++;
    } else if (columns.length === 3) {
      // Add empty city column
      columns.push('""');
      updatedRows++;
    }

    cleanedLines.push(columns.join(','));
  }

  if (updatedRows > 0 || cleanedLines.length !== lines.length) {
    console.log(`📝 Updated ${updatedRows} rows and cleaned ${lines.length - cleanedLines.length} corrupted rows`);
    // Write the updated content back to the file
    writeFileSync(csvFilePath, cleanedLines.join('\n'));
    console.log(`📝 Initialized CSV structure in ${csvFilePath}`);
  }
}

// Initialize CSV headers before processing
initializeCSVHeaders();

// Read ZIP codes once and create dynamic tests
const zipCodes = readZipCodesFromCSV();

// Log configuration
const stateDisplay = Array.isArray(TARGET_STATE) ? TARGET_STATE.join(', ') : TARGET_STATE;
console.log(`🔧 Configuration: Target State(s) = ${stateDisplay}`);
console.log(`🔧 Search Types (in order): ${SEARCH_TYPES.join(', ')}`);
console.log(`🔧 Total ZIP codes to process (without existing addresses): ${zipCodes.length}`);

// Create individual test cases for parallel execution
for (let i = 0; i < zipCodes.length; i++) {
  const { zipcode, state } = zipCodes[i];
  test(`Extract address for ${zipcode}, ${state} [${i}]`, async ({ page }) => {
    await processZipCode(page, zipcode, state);
  });
}