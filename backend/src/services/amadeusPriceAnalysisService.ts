import { AmadeusService } from './amadeusService';
import { pool } from '../config/database';

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
   * Get price analysis for a specific route and date with database fallback
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

      // ✅ Step 1: If Amadeus has data, return it
      if (response.data) {
        console.log('[AmadeusPriceAnalysisService] ✅ Got data from Amadeus API');
        return response.data;
      }

      // ⚠️ Step 2: If Amadeus returns empty, fallback to database
      console.log('[AmadeusPriceAnalysisService] ⚠️ Amadeus returned empty, falling back to database');
      return await this.getPriceAnalysisFromDatabase(params);
    } catch (error: any) {
      // This API might not be available in test environment
      console.warn('[AmadeusPriceAnalysisService] ⚠️ Price analysis not available from Amadeus, falling back to database:', error.message);
      return await this.getPriceAnalysisFromDatabase(params);
    }
  }

  /**
   * 🆕 Fallback: Calculate price analysis from our database
   * This is used when Amadeus API returns no data or has errors
   */
  private async getPriceAnalysisFromDatabase(params: {
    origin: string;
    destination: string;
    departureDate: string;
  }): Promise<PriceAnalysisResult | null> {
    try {
      console.log('[AmadeusPriceAnalysisService] 🔍 Querying database for price analysis:', params);

      // Calculate price metrics from database
      const query = `
        SELECT 
          MIN(fp.price) as lowest,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY fp.price) as median,
          MAX(fp.price) as highest
        FROM flight_prices fp
        INNER JOIN routes r ON fp.route_id = r.id
        WHERE r.origin = $1
          AND r.destination = $2
          AND DATE(fp.departure_date) = DATE($3)
      `;
      
      const result = await pool.query(query, [
        params.origin,
        params.destination,
        params.departureDate
      ]);
      
      if (result.rows.length === 0 || result.rows[0].lowest === null) {
        console.log('[AmadeusPriceAnalysisService] ❌ No price data found in database');
        return null;
      }

      console.log('[AmadeusPriceAnalysisService] 📊 Calculated price metrics from database');
      
      return {
        type: 'price-metrics',
        origin: params.origin,
        destination: params.destination,
        departureDate: params.departureDate,
        priceMetrics: {
          lowest: parseFloat(result.rows[0].lowest),
          median: parseFloat(result.rows[0].median),
          highest: parseFloat(result.rows[0].highest),
        },
      };
    } catch (error) {
      console.error('[AmadeusPriceAnalysisService] ❌ Database fallback failed:', error);
      return null;
    }
  }
}

