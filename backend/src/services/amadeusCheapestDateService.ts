import { AmadeusService } from './amadeusService';
import { format } from 'date-fns';
import { logAmadeusError } from '../utils/errorLogger';

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

      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: CheapestDateResult[] }>(() =>
        this.amadeus.shopping.flightDates.get(searchParams)
      );
      return response.data || [];
    } catch (error: any) {
      logAmadeusError('Flight Dates API', error, {
        origin: params.origin,
        destination: params.destination,
        departureDateRange: params.departureDateRange,
        returnDateRange: params.returnDateRange,
        oneWay: params.oneWay,
        searchParams: searchParams || 'not initialized',
      });
      this.handleError(error);
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
}

