import { pool } from '../config/database';

export interface SearchStatisticsRecord {
  id: number;
  origin: string;
  origin_name: string | null;
  destination: string;
  destination_name: string | null;
  duration_range: string | null;
  trip_type: 'one-way' | 'round-trip' | null;
  user_ip: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface PriceStatisticsRecord {
  id: number;
  origin: string;
  origin_name: string | null;
  destination: string;
  destination_name: string | null;
  recommended_price: number;
  season: 'high' | 'normal' | 'low';
  airline: string | null;
  created_at: Date;
}

export class SearchStatisticsModel {
  /**
   * Save a search query to the database
   */
  static async saveSearch(search: {
    origin: string;
    originName?: string;
    destination: string;
    destinationName?: string;
    durationRange?: string;
    tripType?: 'one-way' | 'round-trip' | null;
    userIp?: string;
    userAgent?: string;
  }): Promise<SearchStatisticsRecord> {
    const query = `
      INSERT INTO search_statistics (
        origin, origin_name, destination, destination_name,
        duration_range, trip_type, user_ip, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      search.origin,
      search.originName || null,
      search.destination,
      search.destinationName || null,
      search.durationRange || null,
      search.tripType || null,
      search.userIp || null,
      search.userAgent || null,
    ]);
    
    return result.rows[0];
  }

  /**
   * Get the most searched destination
   */
  static async getMostSearchedDestination(limit: number = 1): Promise<Array<{ destination: string; count: number }>> {
    const query = `
      SELECT destination, COUNT(*) as count
      FROM search_statistics
      GROUP BY destination
      ORDER BY count DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get popular destinations (top N)
   */
  static async getPopularDestinations(limit: number = 5): Promise<Array<{ destination: string; destination_name: string | null; count: number }>> {
    const query = `
      SELECT 
        destination,
        MAX(destination_name) as destination_name,
        COUNT(*) as count
      FROM search_statistics
      GROUP BY destination
      ORDER BY count DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  /**
   * Get monthly search statistics
   */
  static async getMonthlySearchStats(): Promise<Array<{ month: number; month_name: string; count: number }>> {
    const query = `
      SELECT 
        EXTRACT(MONTH FROM created_at)::INTEGER as month,
        TO_CHAR(created_at, 'TMMonth') as month_name,
        COUNT(*)::INTEGER as count
      FROM search_statistics
      GROUP BY EXTRACT(MONTH FROM created_at), TO_CHAR(created_at, 'TMMonth')
      ORDER BY month
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Get total number of searches
   */
  static async getTotalSearches(): Promise<number> {
    const result = await pool.query('SELECT COUNT(*) as count FROM search_statistics');
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get most searched duration (round-trip only)
   */
  static async getMostSearchedDuration(limit: number = 1): Promise<Array<{ duration_range: string; count: number }>> {
    const query = `
      SELECT duration_range, COUNT(*)::INTEGER as count
      FROM search_statistics
      WHERE trip_type = 'round-trip' AND duration_range IS NOT NULL
      GROUP BY duration_range
      ORDER BY count DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    return result.rows;
  }
}

export class PriceStatisticsModel {
  /**
   * Save a price recommendation to the database
   */
  static async savePriceStat(priceStat: {
    origin: string;
    originName?: string;
    destination: string;
    destinationName?: string;
    recommendedPrice: number;
    season: 'high' | 'normal' | 'low';
    airline?: string;
  }): Promise<PriceStatisticsRecord> {
    const query = `
      INSERT INTO price_statistics (
        origin, origin_name, destination, destination_name,
        recommended_price, season, airline
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      priceStat.origin,
      priceStat.originName || null,
      priceStat.destination,
      priceStat.destinationName || null,
      priceStat.recommendedPrice,
      priceStat.season,
      priceStat.airline || null,
    ]);
    
    return result.rows[0];
  }

  /**
   * Get average price for a route
   */
  static async getAveragePrice(origin?: string, destination?: string): Promise<number | null> {
    let query = 'SELECT AVG(recommended_price) as avg_price FROM price_statistics WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (origin) {
      query += ` AND origin = $${paramIndex}`;
      params.push(origin);
      paramIndex++;
    }

    if (destination) {
      query += ` AND destination = $${paramIndex}`;
      params.push(destination);
      paramIndex++;
    }

    const result = await pool.query(query, params);
    const avgPrice = result.rows[0]?.avg_price;
    
    return avgPrice ? parseFloat(avgPrice) : null;
  }

  /**
   * Get price trend for a route
   */
  static async getPriceTrend(origin?: string, destination?: string): Promise<{
    trend: 'up' | 'down' | 'stable';
    percentage: number;
  } | null> {
    let query = `
      SELECT recommended_price, created_at
      FROM price_statistics
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (origin) {
      query += ` AND origin = $${paramIndex}`;
      params.push(origin);
      paramIndex++;
    }

    if (destination) {
      query += ` AND destination = $${paramIndex}`;
      params.push(destination);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC LIMIT 20';

    const result = await pool.query(query, params);
    const prices = result.rows;

    if (prices.length < 2) {
      return null;
    }

    const recentPrices = prices.slice(0, 10);
    const olderPrices = prices.slice(10, 20);

    if (olderPrices.length === 0) {
      return null;
    }

    const recentAvg = recentPrices.reduce((sum, p) => sum + parseFloat(p.recommended_price), 0) / recentPrices.length;
    const olderAvg = olderPrices.reduce((sum, p) => sum + parseFloat(p.recommended_price), 0) / olderPrices.length;

    const percentage = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);

    if (Math.abs(percentage) < 2) {
      return { trend: 'stable', percentage: 0 };
    }

    return {
      trend: percentage > 0 ? 'up' : 'down',
      percentage: Math.abs(percentage),
    };
  }
}

