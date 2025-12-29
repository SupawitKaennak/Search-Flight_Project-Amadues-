import { AmadeusService } from './amadeusService';
import { FlightModel } from '../models/Flight';
import { pool } from '../config/database';

export interface AmadeusAirline {
  type: string;
  iataCode: string;
  businessName: string;
}

export class AmadeusAirlineService extends AmadeusService {
  /**
   * Get airline information by code
   * Uses retry logic with exponential backoff for rate limit errors
   */
  async getAirlineByCode(code: string): Promise<AmadeusAirline | null> {
    try {
      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: AmadeusAirline[] }>(() =>
        this.amadeus.referenceData.airlines.get({
          airlineCodes: code,
        })
      );
      
      const airlines = response.data || [];
      return airlines.length > 0 ? airlines[0] : null;
    } catch (error: any) {
      console.error('[AmadeusAirlineService] Error getting airline:', error);
      return null;
    }
  }

  /**
   * Get multiple airlines by codes
   * Uses retry logic with exponential backoff for rate limit errors
   */
  async getAirlinesByCodes(codes: string[]): Promise<AmadeusAirline[]> {
    try {
      if (codes.length === 0) return [];
      
      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: AmadeusAirline[] }>(() =>
        this.amadeus.referenceData.airlines.get({
          airlineCodes: codes.join(','),
        })
      );
      
      return response.data || [];
    } catch (error: any) {
      console.error('[AmadeusAirlineService] Error getting airlines:', error);
      return [];
    }
  }

  /**
   * Get or create airline in database
   */
  async getOrCreateAirline(code: string): Promise<any> {
    // Check database first - query directly by code
    const query = `
      SELECT * FROM airlines WHERE code = $1
    `;
    const result = await pool.query(query, [code.toUpperCase()]);
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Fetch from Amadeus
    const amadeusAirline = await this.getAirlineByCode(code);
    
    if (amadeusAirline) {
      return await FlightModel.getOrCreateAirline(
        amadeusAirline.iataCode,
        amadeusAirline.businessName,
        amadeusAirline.businessName // Use business name as Thai name if not available
      );
    }

    // Fallback: create with code only
    return await FlightModel.getOrCreateAirline(
      code.toUpperCase(),
      code.toUpperCase(),
      code.toUpperCase()
    );
  }
}

