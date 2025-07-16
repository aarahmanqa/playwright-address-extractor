export interface ZipCodeData {
  zipcode: string;
  state: string;
}

export interface AddressResult {
  zipcode: string;
  state: string;
  addressline: string;
  city: string;
  valid: boolean;
  error?: string;
}

export interface ExtractorConfig {
  headless: boolean;
  maxConcurrency: number;
  timeout: number;
  retries: number;
  sampleSize?: number;
}
