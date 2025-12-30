import { AmadeusService } from './amadeusService';
import { logAmadeusError } from '../utils/errorLogger';
import { pool } from '../config/database';

export interface InspirationDestination {
  destination: string;
  price: {
    total: string;
    currency: string;
  };
  departureDate?: string;
  returnDate?: string;
}

export interface InspirationSearchResult {
  type: string;
  origin: string;
  data: Array<{
    destination: string;
    departureDate: string;
    returnDate?: string;
    price: {
      total: string;
      currency: string;
    };
  }>;
}

export class AmadeusInspirationSearchService extends AmadeusService {
  /**
   * Search destinations by budget (inspiration search)
   * @param origin - Origin airport code (e.g., 'BKK')
   * @param maxPrice - Maximum price in THB (optional)
   * @param currency - Currency code (default: 'THB')
   * @param departureDate - Departure date in YYYY-MM-DD format (optional)
   * @param oneWay - One-way trip (default: false)
   */
  async searchDestinationsByBudget(
    origin: string,
    maxPrice?: number,
    currency: string = 'THB',
    departureDate?: string,
    oneWay: boolean = false
  ): Promise<InspirationDestination[]> {
    // Declare searchParams outside try block for error logging
    let searchParams: any = null;

    try {
      searchParams = {
        origin: origin,
        currencyCode: currency,
        oneWay: oneWay,
      };

      if (maxPrice) {
        searchParams.maxPrice = maxPrice;
      }

      if (departureDate) {
        searchParams.departureDate = departureDate;
      }

      // Log parameters being sent to API
      console.log('[AmadeusInspirationSearchService] Calling Flight Destinations API with params:', JSON.stringify(searchParams, null, 2));

      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: any[] }>(() =>
        this.amadeus.shopping.flightDestinations.get(searchParams)
      );
      
      console.log('[AmadeusInspirationSearchService] API Response:', {
        hasData: !!response.data,
        dataLength: response.data?.length || 0,
        firstItem: response.data?.[0] || null,
      });
      
      // ✅ Step 1: If Amadeus has data, return it
      if (response.data && response.data.length > 0) {
        console.log('[AmadeusInspirationSearchService] ✅ Got data from Amadeus API');
        return response.data.map((item: any) => ({
          destination: item.destination,
          price: {
            total: item.price?.total || '0',
            currency: item.price?.currency || currency,
          },
          departureDate: item.departureDate,
          returnDate: item.returnDate,
        }));
      }

      // ⚠️ Step 2: If Amadeus returns empty, fallback to database
      console.log('[AmadeusInspirationSearchService] ⚠️ Amadeus returned empty, falling back to database');
      return await this.searchDestinationsFromDatabase(origin, maxPrice, departureDate, oneWay, currency);
    } catch (error: any) {
      // Check if it's an Amadeus internal error (code 38189)
      // After executeWithRetry wraps the error, we need to check multiple possible structures
      const errorCode = error.code || error.response?.body?.errors?.[0]?.code || error.description?.[0]?.code;
      const statusCode = error.statusCode || error.response?.statusCode;
      const isAmadeusInternalError = statusCode === 500 && errorCode === 38189;

      // Also check if error message contains code 38189
      const errorMessageHas38189 = error.message?.includes('"code":38189') || 
                                     error.message?.includes('"code": 38189');

      if (isAmadeusInternalError || errorMessageHas38189) {
        // Amadeus Test API internal error - this is expected for some queries
        // Fallback to database instead of returning empty array
        console.warn('[AmadeusInspirationSearchService] ⚠️ Amadeus API Internal Error (38189) - Falling back to database:', {
          origin,
          maxPrice,
          currency,
          departureDate,
          oneWay,
        });
        return await this.searchDestinationsFromDatabase(origin, maxPrice, departureDate, oneWay, currency);
      }

      // For other errors, log and throw
      logAmadeusError('Flight Destinations API (Inspiration Search)', error, {
        origin,
        maxPrice,
        currency,
        departureDate,
        oneWay,
        searchParams: searchParams || 'not initialized',
      });
      // handleError always throws (return type: never), ensuring proper error propagation
      this.handleError(error);
      // TypeScript should understand that handleError never returns, but if it doesn't,
      // the function will implicitly return undefined which could cause issues
      // So we add an unreachable return to satisfy TypeScript
      return [] as never;
    }
  }

  /**
   * 🆕 Fallback: Query destinations from database
   * This is used when Amadeus API returns no data or has errors
   */
  private async searchDestinationsFromDatabase(
    origin: string,
    maxPrice?: number,
    departureDate?: string,
    oneWay: boolean = false,
    currency: string = 'THB'
  ): Promise<InspirationDestination[]> {
    try {
      console.log('[AmadeusInspirationSearchService] 🔍 Querying database for destinations:', {
        origin,
        maxPrice,
        departureDate,
        oneWay,
      });

      // Build query dynamically based on parameters
      let query = `
        SELECT DISTINCT
          r.destination,
          MIN(fp.price) as min_price,
          fp.currency
        FROM flight_prices fp
        INNER JOIN routes r ON fp.route_id = r.id
        WHERE r.origin = $1
          AND fp.trip_type = $2
      `;
      
      const params: any[] = [origin, oneWay ? 'one-way' : 'round-trip'];
      let paramIndex = 3;
      
      // Add price filter if specified
      if (maxPrice) {
        query += ` AND fp.price <= $${paramIndex}`;
        params.push(maxPrice);
        paramIndex++;
      }
      
      // Add date filter if specified
      if (departureDate) {
        query += ` AND DATE(fp.departure_date) = DATE($${paramIndex})`;
        params.push(departureDate);
        paramIndex++;
      }
      
      query += `
        GROUP BY r.destination, fp.currency
        ORDER BY min_price ASC
        LIMIT 20
      `;
      
      const result = await pool.query(query, params);
      
      console.log(`[AmadeusInspirationSearchService] 📊 Found ${result.rows.length} destinations in database`);
      
      // Transform to Amadeus format
      return result.rows.map(row => ({
        destination: row.destination,
        price: {
          total: row.min_price.toString(),
          currency: row.currency || currency,
        },
        departureDate: departureDate,
      }));
    } catch (error) {
      console.error('[AmadeusInspirationSearchService] ❌ Database fallback failed:', error);
      // Return empty array on database error (don't throw to prevent cascading failures)
      return [];
    }
  }
}

