import { pool } from '../config/database';

export interface DemandStatisticsRecord {
  id: number;
  route_id: number;
  period: string; // YYYY-MM format
  bookings_count: number;
  travelers_count: number;
  flights_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface PriceMetricsRecord {
  id: number;
  route_id: number;
  departure_date: Date;
  lowest_price: number | null;
  median_price: number | null;
  highest_price: number | null;
  created_at: Date;
  updated_at: Date;
}

export class DemandStatisticsModel {
  /**
   * Upsert demand statistics for a route and period
   */
  static async upsertDemandStatistics(params: {
    routeId: number;
    period: string; // YYYY-MM format
    bookingsCount?: number;
    travelersCount?: number;
    flightsCount?: number;
  }): Promise<DemandStatisticsRecord> {
    const query = `
      INSERT INTO demand_statistics (
        route_id, period, bookings_count, travelers_count, flights_count, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (route_id, period)
      DO UPDATE SET
        bookings_count = COALESCE(EXCLUDED.bookings_count, demand_statistics.bookings_count),
        travelers_count = COALESCE(EXCLUDED.travelers_count, demand_statistics.travelers_count),
        flights_count = COALESCE(EXCLUDED.flights_count, demand_statistics.flights_count),
        updated_at = NOW()
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.routeId,
      params.period,
      params.bookingsCount || 0,
      params.travelersCount || 0,
      params.flightsCount || 0,
    ]);

    return result.rows[0];
  }

  /**
   * Get demand statistics for a route and period range
   */
  static async getDemandStatistics(
    routeId: number,
    startPeriod?: string,
    endPeriod?: string
  ): Promise<DemandStatisticsRecord[]> {
    let query = `
      SELECT * FROM demand_statistics
      WHERE route_id = $1
    `;
    const params: any[] = [routeId];

    if (startPeriod) {
      query += ` AND period >= $${params.length + 1}`;
      params.push(startPeriod);
    }

    if (endPeriod) {
      query += ` AND period <= $${params.length + 1}`;
      params.push(endPeriod);
    }

    query += ` ORDER BY period ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get demand statistics for multiple periods (for percentile calculation)
   */
  static async getDemandStatisticsForPeriods(
    routeId: number,
    periods: string[]
  ): Promise<DemandStatisticsRecord[]> {
    if (periods.length === 0) {
      return [];
    }

    const query = `
      SELECT * FROM demand_statistics
      WHERE route_id = $1 AND period = ANY($2)
      ORDER BY period ASC
    `;

    const result = await pool.query(query, [routeId, periods]);
    return result.rows;
  }

  /**
   * Get all demand statistics for a route (all periods)
   */
  static async getAllDemandStatisticsForRoute(
    routeId: number
  ): Promise<DemandStatisticsRecord[]> {
    const query = `
      SELECT * FROM demand_statistics
      WHERE route_id = $1
      ORDER BY period ASC
    `;

    const result = await pool.query(query, [routeId]);
    return result.rows;
  }
}

export class PriceMetricsModel {
  /**
   * Upsert price metrics for a route and date
   */
  static async upsertPriceMetrics(params: {
    routeId: number;
    departureDate: Date;
    lowestPrice?: number | null;
    medianPrice?: number | null;
    highestPrice?: number | null;
  }): Promise<PriceMetricsRecord> {
    const formatDate = (date: Date): string => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const query = `
      INSERT INTO price_metrics (
        route_id, departure_date, lowest_price, median_price, highest_price, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (route_id, departure_date)
      DO UPDATE SET
        lowest_price = COALESCE(EXCLUDED.lowest_price, price_metrics.lowest_price),
        median_price = COALESCE(EXCLUDED.median_price, price_metrics.median_price),
        highest_price = COALESCE(EXCLUDED.highest_price, price_metrics.highest_price),
        updated_at = NOW()
      RETURNING *
    `;

    const result = await pool.query(query, [
      params.routeId,
      formatDate(params.departureDate),
      params.lowestPrice ?? null,
      params.medianPrice ?? null,
      params.highestPrice ?? null,
    ]);

    return result.rows[0];
  }

  /**
   * Get price metrics for a route and date range
   */
  static async getPriceMetrics(
    routeId: number,
    startDate?: Date,
    endDate?: Date
  ): Promise<PriceMetricsRecord[]> {
    let query = `
      SELECT * FROM price_metrics
      WHERE route_id = $1
    `;
    const params: any[] = [routeId];

    if (startDate) {
      const formatDate = (date: Date): string => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      query += ` AND departure_date >= $${params.length + 1}`;
      params.push(formatDate(startDate));
    }

    if (endDate) {
      const formatDate = (date: Date): string => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      query += ` AND departure_date <= $${params.length + 1}`;
      params.push(formatDate(endDate));
    }

    query += ` ORDER BY departure_date ASC`;

    const result = await pool.query(query, params);
    return result.rows;
  }
}

