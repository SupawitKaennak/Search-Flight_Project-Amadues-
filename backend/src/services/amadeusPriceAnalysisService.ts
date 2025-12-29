import { AmadeusService } from './amadeusService';

export interface PriceAnalysisResult {
  type: string;
  origin: string;
  destination: string;
  departureDate: string;
  priceMetrics: {
    lowest: number;
    median: number;
    highest: number;
  };
}

export class AmadeusPriceAnalysisService extends AmadeusService {
  /**
   * Get price analysis for a specific route and date
   * Note: This API may not be available in test environment
   */
  async getPriceAnalysis(params: {
    origin: string;
    destination: string;
    departureDate: string;
  }): Promise<PriceAnalysisResult | null> {
    try {
      const response = await this.amadeus.analytics.itineraryPriceMetrics.get({
        originIataCode: params.origin,
        destinationIataCode: params.destination,
        departureDate: params.departureDate,
        currencyCode: 'THB',
      });

      return response.data || null;
    } catch (error: any) {
      // This API might not be available in test environment
      console.warn('[AmadeusPriceAnalysisService] Price analysis not available:', error.message);
      return null;
    }
  }
}

