import { AmadeusService } from './amadeusService';
import { AirportModel } from '../models/Airport';

export interface AmadeusAirport {
  type: string;
  subType: string;
  name: string;
  iataCode: string;
  address?: {
    cityName?: string;
    countryCode?: string;
  };
  geoCode?: {
    latitude?: number;
    longitude?: number;
  };
}

export class AmadeusAirportService extends AmadeusService {
  /**
   * Search airports and cities from Amadeus API
   * Uses retry logic with exponential backoff for rate limit errors
   */
  async searchAirports(keyword: string, subType?: 'AIRPORT' | 'CITY'): Promise<AmadeusAirport[]> {
    try {
      const params: any = {
        keyword,
        'page[limit]': 10,
      };

      // Amadeus API requires subType parameter - if not provided, try both AIRPORT and CITY separately
      // But if subType is not provided, we should not call the API without it (it will return 400)
      // Instead, we'll try AIRPORT first, then CITY if needed
      if (subType) {
        params.subType = subType;
      } else {
        // If no subType specified, default to AIRPORT (most common use case)
        params.subType = 'AIRPORT';
      }

      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: AmadeusAirport[] }>(() =>
        this.amadeus.referenceData.locations.get(params)
      );
      return response.data || [];
    } catch (error: any) {
      console.error('[AmadeusAirportService] Error searching airports:', error);
      // Ensure we throw an Error instance
      if (error instanceof Error) {
        throw error;
      }
      this.handleError(error);
    }
  }

  /**
   * Get airport by IATA code
   */
  async getAirportByCode(code: string): Promise<AmadeusAirport | null> {
    try {
      const airports = await this.searchAirports(code, 'AIRPORT');
      return airports.find(a => a.iataCode === code) || null;
    } catch (error: any) {
      console.error('[AmadeusAirportService] Error getting airport:', error);
      return null;
    }
  }

  /**
   * Search and cache airports
   */
  async searchAndCacheAirports(keyword: string): Promise<any[]> {
    try {
      const amadeusAirports = await this.searchAirports(keyword);
      
      // Cache in database
      const cachedAirports = [];
      for (const airport of amadeusAirports) {
        if (airport.iataCode) {
          const cached = await AirportModel.getOrCreateAirport({
            code: airport.iataCode,
            name: airport.name,
            city: airport.address?.cityName || '',
            country: airport.address?.countryCode || '',
            latitude: airport.geoCode?.latitude || null,
            longitude: airport.geoCode?.longitude || null,
          });
          cachedAirports.push(cached);
        }
      }
      
      return cachedAirports;
    } catch (error: any) {
      console.error('[AmadeusAirportService] Error searching and caching:', error);
      // Ensure we throw an Error instance
      if (error instanceof Error) {
        throw error;
      }
      // Use handleError to wrap non-Error objects
      this.handleError(error);
    }
  }

  /**
   * Find airport code by location (province, city, or country name)
   * Returns the best matching airport code
   */
  async findAirportCodeByLocation(location: string): Promise<string | null> {
    try {
      // Search for airports first (prefer airports over cities)
      const airports = await this.searchAirports(location, 'AIRPORT');
      
      if (airports.length > 0) {
        const locationLower = location.toLowerCase();
        // Find best match
        const bestMatch = airports.find(a => 
          a.name.toLowerCase().includes(locationLower) ||
          a.address?.cityName?.toLowerCase().includes(locationLower) ||
          a.iataCode.toLowerCase() === locationLower
        ) || airports[0];
        
        return bestMatch.iataCode || null;
      }
      
      // If no airports, try cities
      const cities = await this.searchAirports(location, 'CITY');
      if (cities.length > 0) {
        const city = cities[0];
        // Try to find airport in this city
        if (city.address?.cityName) {
          const cityAirports = await this.searchAirports(city.address.cityName, 'AIRPORT');
          if (cityAirports.length > 0 && cityAirports[0].iataCode) {
            return cityAirports[0].iataCode;
          }
        }
      }
      
      return null;
    } catch (error: any) {
      console.error('[AmadeusAirportService] Error finding airport code:', error);
      return null;
    }
  }
}

