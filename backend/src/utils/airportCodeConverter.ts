/**
 * Airport Code Converter Utility
 * Converts province/country names to airport codes using Amadeus API
 * Includes fallback mapping for Thai provinces
 */

import { AmadeusAirportService } from '../services/amadeusAirportService';
import { AirportModel } from '../models/Airport';

/**
 * Fallback mapping for Thai provinces to airport codes
 * Used when Amadeus API fails or doesn't return results
 */
const PROVINCE_TO_AIRPORT_CODE: Record<string, string> = {
  'bangkok': 'BKK',
  'chiang-mai': 'CNX',
  'chiang-rai': 'CEI',
  'phuket': 'HKT',
  'krabi': 'KBV',
  'samui': 'USM',
  'hat-yai': 'HDY',
  'songkhla': 'HDY',
  'udon-thani': 'UTH',
  'khon-kaen': 'KKC',
  'ubon-ratchathani': 'UBP',
  'nakhon-phanom': 'KOP',
  'nakhon-ratchasima': 'NAK',
  'sakon-nakhon': 'SNO',
  'roi-et': 'ROI',
  'loei': 'LOE',
  'buri-ram': 'BFV',
  'rayong': 'UTP',
  'trat': 'TDX',
  'prachuap-khiri-khan': 'HHQ',
  'lampang': 'LPT',
  'mae-hong-son': 'HGN',
  'nan': 'NNT',
  'phrae': 'PRH',
  'phitsanulok': 'PHS',
  'sukhothai': 'THS',
  'tak': 'MAQ',
  'surat-thani': 'URT',
  'nakhon-si-thammarat': 'NST',
  'trang': 'TST',
  'ranong': 'UNN',
  'chumphon': 'CJM',
  'narathiwat': 'NAW',
};

/**
 * Convert location (province, city, country, or airport code) to airport code
 * 
 * @param location - Can be:
 *   - Airport code (3 uppercase letters, e.g., "BKK")
 *   - Province name (e.g., "chiang-mai", "phuket")
 *   - City name (e.g., "Bangkok", "Chiang Mai")
 *   - Country name (e.g., "Thailand")
 * 
 * @param airportService - AmadeusAirportService instance
 * @returns Airport IATA code (e.g., "BKK", "CNX", "HKT")
 * 
 * @throws Error if airport code cannot be found
 */
export async function convertToAirportCode(
  location: string,
  airportService: AmadeusAirportService
): Promise<string> {
  if (!location || typeof location !== 'string') {
    throw new Error('Location must be a non-empty string');
  }

  const locationLower = location.toLowerCase().trim();
  
  // 1. Check if already airport code (3 uppercase letters)
  if (/^[A-Z]{3}$/.test(location.toUpperCase())) {
    // Verify it exists in database or Amadeus
    const airport = await AirportModel.getAirportByCode(location.toUpperCase());
    if (airport) {
      return location.toUpperCase();
    }
    
    // Try to get from Amadeus
    const amadeusAirport = await airportService.getAirportByCode(location.toUpperCase());
    if (amadeusAirport) {
      // Cache it
      await AirportModel.getOrCreateAirport({
        code: amadeusAirport.iataCode,
        name: amadeusAirport.name,
        city: amadeusAirport.address?.cityName || '',
        country: amadeusAirport.address?.countryCode || '',
        latitude: amadeusAirport.geoCode?.latitude || null,
        longitude: amadeusAirport.geoCode?.longitude || null,
      });
      return location.toUpperCase();
    }
  }

  // 2. Try fallback mapping for Thai provinces first (fastest, no API call)
  const normalizedLocation = locationLower.replace(/\s+/g, '-');
  if (PROVINCE_TO_AIRPORT_CODE[normalizedLocation]) {
    const airportCode = PROVINCE_TO_AIRPORT_CODE[normalizedLocation];
    // Verify it exists in database or cache it
    const airport = await AirportModel.getAirportByCode(airportCode);
    if (airport) {
      return airportCode;
    }
    // Try to get from Amadeus and cache it
    const amadeusAirport = await airportService.getAirportByCode(airportCode);
    if (amadeusAirport) {
      await AirportModel.getOrCreateAirport({
        code: amadeusAirport.iataCode,
        name: amadeusAirport.name,
        city: amadeusAirport.address?.cityName || '',
        country: amadeusAirport.address?.countryCode || '',
        latitude: amadeusAirport.geoCode?.latitude || null,
        longitude: amadeusAirport.geoCode?.longitude || null,
      });
      return airportCode;
    }
    // If Amadeus doesn't have it, return the code anyway (from our mapping)
    return airportCode;
  }

  // 3. Try database cache (search by name, city, or code)
  const cachedAirports = await AirportModel.searchAirports(location);
  if (cachedAirports.length > 0) {
    // Prefer exact code match, then name match
    const exactMatch = cachedAirports.find(a => 
      a.code.toLowerCase() === locationLower ||
      a.name.toLowerCase() === locationLower ||
      a.city.toLowerCase() === locationLower
    );
    
    if (exactMatch) {
      return exactMatch.code;
    }
    
    // Return first result if no exact match
    return cachedAirports[0].code;
  }

  // 4. Search from Amadeus API (only if fallback mapping doesn't work)
  try {
    // Search for airports first (prefer airports over cities)
    const airports = await airportService.searchAirports(location, 'AIRPORT');
    
    if (airports.length > 0) {
      // Find best match
      const bestMatch = airports.find(a => 
        a.name.toLowerCase().includes(locationLower) ||
        a.address?.cityName?.toLowerCase().includes(locationLower) ||
        a.iataCode.toLowerCase() === locationLower
      ) || airports[0];
      
      if (bestMatch.iataCode) {
        // Cache in database
        await AirportModel.getOrCreateAirport({
          code: bestMatch.iataCode,
          name: bestMatch.name,
          city: bestMatch.address?.cityName || '',
          country: bestMatch.address?.countryCode || '',
          latitude: bestMatch.geoCode?.latitude || null,
          longitude: bestMatch.geoCode?.longitude || null,
        });
        
        return bestMatch.iataCode;
      }
    }
    
    // If no airports found, try searching cities
    const cities = await airportService.searchAirports(location, 'CITY');
    if (cities.length > 0) {
      // Cities might have airport codes in their name or we need to search for airports in that city
      const city = cities[0];
      
      // Try to find airport in this city
      if (city.address?.cityName) {
        const cityAirports = await airportService.searchAirports(city.address.cityName, 'AIRPORT');
        if (cityAirports.length > 0 && cityAirports[0].iataCode) {
          const airport = cityAirports[0];
          await AirportModel.getOrCreateAirport({
            code: airport.iataCode,
            name: airport.name,
            city: airport.address?.cityName || '',
            country: airport.address?.countryCode || '',
            latitude: airport.geoCode?.latitude || null,
            longitude: airport.geoCode?.longitude || null,
          });
          return airport.iataCode;
        }
      }
    }
    
    // If still no match, try fallback mapping again (in case location format is different)
    const fallbackCode = PROVINCE_TO_AIRPORT_CODE[normalizedLocation];
    if (fallbackCode) {
      return fallbackCode;
    }
    
    throw new Error(`Could not find airport code for location: ${location}`);
  } catch (error: any) {
    // Try fallback mapping as last resort before throwing error
    const fallbackCode = PROVINCE_TO_AIRPORT_CODE[normalizedLocation];
    if (fallbackCode) {
      console.warn(`[AirportCodeConverter] Amadeus API failed for "${location}", using fallback mapping: ${fallbackCode}`);
      return fallbackCode;
    }
    
    // Ensure error is an Error instance
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[AirportCodeConverter] Error converting "${location}" to airport code:`, errorMessage);
    throw new Error(`Failed to convert "${location}" to airport code: ${errorMessage}`);
  }
}

/**
 * Convert multiple locations to airport codes
 * Useful for batch processing
 */
export async function convertToAirportCodes(
  locations: string[],
  airportService: AmadeusAirportService
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  for (const location of locations) {
    try {
      results[location] = await convertToAirportCode(location, airportService);
    } catch (error: any) {
      console.error(`[AirportCodeConverter] Failed to convert "${location}":`, error.message);
      // Continue with other locations
    }
  }
  
  return results;
}

