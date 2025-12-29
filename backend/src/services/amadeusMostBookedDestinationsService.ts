import { AmadeusService } from './amadeusService';

export interface BookedDestination {
  destination: string;
  analytics: {
    flights: number;
    travelers: number;
  };
}

export interface MostBookedDestinationsResult {
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

export class AmadeusMostBookedDestinationsService extends AmadeusService {
  /**
   * Get most booked destinations from an origin
   * @param origin - Origin airport code (e.g., 'BKK')
   * @param period - Period in YYYY-MM format (optional, defaults to current month)
   */
  async getMostBookedDestinations(
    origin: string,
    period?: string
  ): Promise<BookedDestination[]> {
    try {
      const searchParams: any = {
        originCityCode: origin,
        period: period || this.getCurrentPeriod(),
      };

      // Use travel.analytics.airTraffic.booked.get for most booked destinations
      const response = await this.amadeus.travel.analytics.airTraffic.booked.get(searchParams);
      
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
      console.error('[AmadeusMostBookedDestinationsService] Error getting most booked destinations:', error);
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

