import { AmadeusService } from './amadeusService';

export interface TraveledDestination {
  destination: string;
  analytics: {
    flights: number;
    travelers: number;
  };
}

export interface MostTraveledDestinationsResult {
  type: string;
  origin: string;
  period: string;
  data: Array<{
    destination: string;
    analytics: {
      flights: {
        score: number;
      };
      travelers: {
        score: number;
      };
    };
  }>;
}

export class AmadeusMostTraveledDestinationsService extends AmadeusService {
  /**
   * Get most traveled destinations from an origin
   * @param origin - Origin airport code (e.g., 'BKK')
   * @param period - Period in YYYY-MM format (optional, defaults to current month)
   */
  async getMostTraveledDestinations(
    origin: string,
    period?: string
  ): Promise<TraveledDestination[]> {
    try {
      const searchParams: any = {
        originCityCode: origin,
        period: period || this.getCurrentPeriod(),
      };

      const response = await this.amadeus.travel.analytics.airTraffic.traveled.get(searchParams);
      
      if (!response.data || response.data.length === 0) {
        return [];
      }

      // Transform response to our format
      return response.data.map((item: any) => ({
        destination: item.destination,
        analytics: {
          flights: item.analytics?.flights?.score || 0,
          travelers: item.analytics?.travelers?.score || 0,
        },
      }));
    } catch (error: any) {
      console.error('[AmadeusMostTraveledDestinationsService] Error getting most traveled destinations:', error);
      this.handleError(error);
    }
  }

  /**
   * Get current period in YYYY-MM format
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}

