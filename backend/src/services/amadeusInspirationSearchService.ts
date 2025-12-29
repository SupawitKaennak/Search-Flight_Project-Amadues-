import { AmadeusService } from './amadeusService';
import { logAmadeusError } from '../utils/errorLogger';

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

      // Use retry logic for API calls with rate limiting
      const response = await this.executeWithRetry<{ data?: any[] }>(() =>
        this.amadeus.shopping.flightDestinations.get(searchParams)
      );
      
      if (!response.data || response.data.length === 0) {
        return [];
      }

      // Transform response to our format
      return response.data.map((item: any) => ({
        destination: item.destination,
        price: {
          total: item.price?.total || '0',
          currency: item.price?.currency || currency,
        },
        departureDate: item.departureDate,
        returnDate: item.returnDate,
      }));
    } catch (error: any) {
      logAmadeusError('Flight Destinations API (Inspiration Search)', error, {
        origin,
        maxPrice,
        currency,
        departureDate,
        oneWay,
        searchParams: searchParams || 'not initialized',
      });
      this.handleError(error);
    }
  }
}

