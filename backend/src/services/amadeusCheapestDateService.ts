import { AmadeusService } from './amadeusService';
import { format, parseISO } from 'date-fns';
import { logAmadeusError } from '../utils/errorLogger';
import { pool } from '../config/database';

export interface CheapestDateResult {
  type: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  price: {
    total: string;
    currency: string;
  };
}

export class AmadeusCheapestDateService extends AmadeusService {
  /**
   * Find cheapest dates for a route within a date range
   */
  async findCheapestDates(params: {
    origin: string;
    destination: string;
    departureDateRange: {
      start: string; // YYYY-MM-DD
      end: string;   // YYYY-MM-DD
    };
    returnDateRange?: {
      start: string;
      end: string;
    };
    oneWay?: boolean;
  }): Promise<CheapestDateResult[]> {
    // Declare searchParams outside try block for error logging
    let searchParams: any = null;

    try {
      searchParams = {
        origin: params.origin,
        destination: params.destination,
        departureDate: `${params.departureDateRange.start},${params.departureDateRange.end}`,
        currencyCode: 'THB',
      };

      if (!params.oneWay && params.returnDateRange) {
        searchParams.returnDate = `${params.returnDateRange.start},${params.returnDateRange.end}`;
      } else {
        searchParams.oneWay = true;
      }

      // Log parameters being sent to API
      console.log('[AmadeusCheapestDateService] Calling Flight Dates API with params:', JSON.stringify(searchParams, null, 2));

      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: CheapestDateResult[] }>(() =>
        this.amadeus.shopping.flightDates.get(searchParams)
      );
      
      console.log('[AmadeusCheapestDateService] API Response:', {
        hasData: !!response.data,
        dataLength: response.data?.length || 0,
        firstItem: response.data?.[0] || null,
      });
      
      // ✅ Step 1: If Amadeus has data, return it
      if (response.data && response.data.length > 0) {
        console.log('[AmadeusCheapestDateService] ✅ Got data from Amadeus API');
        return response.data;
      }
      
      // ⚠️ Step 2: If Amadeus returns empty, fallback to database
      console.log('[AmadeusCheapestDateService] ⚠️ Amadeus returned empty, falling back to database');
      return await this.findCheapestDatesFromDatabase(params);
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
        // Amadeus Test API internal error - this is expected for some routes/dates
        // Fallback to database instead of returning empty array
        console.warn('[AmadeusCheapestDateService] ⚠️ Amadeus API Internal Error (38189) - Falling back to database:', {
          origin: params.origin,
          destination: params.destination,
          departureDateRange: params.departureDateRange,
          returnDateRange: params.returnDateRange,
        });
        return await this.findCheapestDatesFromDatabase(params);
      }

      // For other errors, log and throw
      logAmadeusError('Flight Dates API', error, {
        origin: params.origin,
        destination: params.destination,
        departureDateRange: params.departureDateRange,
        returnDateRange: params.returnDateRange,
        oneWay: params.oneWay,
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
   * Get cheapest date for a specific route
   */
  async getCheapestDate(params: {
    origin: string;
    destination: string;
    startDate: Date;
    endDate: Date;
    oneWay?: boolean;
  }): Promise<CheapestDateResult | null> {
    try {
      const results = await this.findCheapestDates({
        origin: params.origin,
        destination: params.destination,
        departureDateRange: {
          start: format(params.startDate, 'yyyy-MM-dd'),
          end: format(params.endDate, 'yyyy-MM-dd'),
        },
        oneWay: params.oneWay,
      });

      if (results.length === 0) {
        return null;
      }

      // Return the cheapest one
      return results.reduce((cheapest, current) => {
        const currentPrice = parseFloat(current.price.total);
        const cheapestPrice = parseFloat(cheapest.price.total);
        return currentPrice < cheapestPrice ? current : cheapest;
      });
    } catch (error: any) {
      console.error('[AmadeusCheapestDateService] Error getting cheapest date:', error);
      return null;
    }
  }

  /**
   * 🆕 Fallback: Query cheapest dates from our database
   * This is used when Amadeus API returns no data or has errors
   */
  private async findCheapestDatesFromDatabase(params: {
    origin: string;
    destination: string;
    departureDateRange: {
      start: string; // YYYY-MM-DD
      end: string;   // YYYY-MM-DD
    };
    returnDateRange?: {
      start: string;
      end: string;
    };
    oneWay?: boolean;
  }): Promise<CheapestDateResult[]> {
    try {
      const { origin, destination, departureDateRange, oneWay } = params;
      
      console.log('[AmadeusCheapestDateService] 🔍 Querying database for cheapest dates:', {
        origin,
        destination,
        departureDateRange,
        oneWay,
      });
      
      // Query from flight_prices table
      // Group by date and get the minimum price for each date
      const query = `
        SELECT 
          fp.origin,
          fp.destination,
          fp.departure_date as "departureDate",
          fp.return_date as "returnDate",
          MIN(fp.price) as min_price,
          fp.currency
        FROM flight_prices fp
        INNER JOIN routes r ON fp.route_id = r.id
        WHERE r.origin = $1
          AND r.destination = $2
          AND DATE(fp.departure_date) >= DATE($3)
          AND DATE(fp.departure_date) <= DATE($4)
          AND fp.trip_type = $5
        GROUP BY fp.origin, fp.destination, fp.departure_date, fp.return_date, fp.currency
        ORDER BY min_price ASC
        LIMIT 20
      `;
      
      const tripType = oneWay ? 'one-way' : 'round-trip';
      const result = await pool.query(query, [
        origin,
        destination,
        departureDateRange.start,
        departureDateRange.end,
        tripType
      ]);
      
      console.log(`[AmadeusCheapestDateService] 📊 Found ${result.rows.length} dates in database`);
      
      // Transform to Amadeus format
      const transformedResults = result.rows.map(row => ({
        type: 'flight-date',
        origin: row.origin,
        destination: row.destination,
        departureDate: format(parseISO(row.departureDate), 'yyyy-MM-dd'),
        returnDate: row.returnDate ? format(parseISO(row.returnDate), 'yyyy-MM-dd') : undefined,
        price: {
          total: row.min_price.toString(),
          currency: row.currency || 'THB',
        },
      }));
      
      return transformedResults;
    } catch (error) {
      console.error('[AmadeusCheapestDateService] ❌ Database fallback failed:', error);
      // Return empty array on database error (don't throw to prevent cascading failures)
      return [];
    }
  }
}

