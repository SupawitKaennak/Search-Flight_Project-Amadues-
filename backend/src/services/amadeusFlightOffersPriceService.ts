import { AmadeusService } from './amadeusService';

export interface OfferPriceResult {
  type: string;
  id: string;
  source: string;
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  lastTicketingDate: string;
  numberOfBookableSeats: number;
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      aircraft?: {
        code: string;
      };
      duration: string;
      numberOfStops: number;
      blacklistedInEU: boolean;
    }>;
  }>;
  price: {
    currency: string;
    total: string;
    base: string;
    fees: Array<{
      amount: string;
      type: string;
    }>;
    grandTotal: string;
  };
  pricingOptions: {
    fareType: string[];
    includedCheckedBagsOnly: boolean;
  };
  validatingAirlineCodes: string[];
  travelerPricings: Array<{
    travelerId: string;
    fareOption: string;
    travelerType: string;
    price: {
      currency: string;
      total: string;
      base: string;
    };
    fareDetailsBySegment: Array<{
      segmentId: string;
      cabin: string;
      fareBasis: string;
      class: string;
      includedCheckedBags: {
        quantity: number;
      };
    }>;
  }>;
}

export class AmadeusFlightOffersPriceService extends AmadeusService {
  /**
   * Get updated price for a specific flight offer
   * @param offerId - Flight offer ID from search results
   * @param offerData - Full offer data from search (required for pricing)
   */
  async getOfferPrice(
    offerId: string,
    offerData: any
  ): Promise<OfferPriceResult | null> {
    try {
      // Note: Pricing API requires the full offer object, not just ID
      const response = await this.amadeus.shopping.flightOffersSearch.pricing.post({
        data: {
          type: 'flight-offers-pricing',
          flightOffers: [offerData],
        },
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      return response.data[0] as OfferPriceResult;
    } catch (error: any) {
      console.error('[AmadeusFlightOffersPriceService] Error getting offer price:', error);
      // Don't throw error, return null instead (pricing might not always be available)
      return null;
    }
  }

  /**
   * Get updated prices for multiple flight offers
   * @param offers - Array of flight offer objects from search
   */
  async getOffersPrices(offers: any[]): Promise<OfferPriceResult[]> {
    try {
      if (offers.length === 0) {
        return [];
      }

      const response = await this.amadeus.shopping.flightOffersSearch.pricing.post({
        data: {
          type: 'flight-offers-pricing',
          flightOffers: offers,
        },
      });

      return (response.data || []) as OfferPriceResult[];
    } catch (error: any) {
      console.error('[AmadeusFlightOffersPriceService] Error getting offers prices:', error);
      return [];
    }
  }
}

