import { pool } from '../config/database';

/**
 * Price prediction service using linear regression
 * 
 * This service predicts future flight prices based on historical data.
 * For production, consider using more advanced ML models (TensorFlow.js, etc.)
 */
export class PricePredictionService {
  constructor() {
    // No dependencies on removed services
  }
  /**
   * Simple linear regression to predict price based on days until departure
   * Formula: y = mx + b
   */
  private linearRegression(x: number[], y: number[]): {
    slope: number;
    intercept: number;
    rSquared: number; // Coefficient of determination
  } {
    if (x.length === 0 || y.length === 0 || x.length !== y.length) {
      throw new Error('Invalid input data for linear regression');
    }

    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    // const sumYY = y.reduce((sum, yi) => sum + yi * yi, 0); // Not used currently

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared (coefficient of determination)
    const yMean = sumY / n;
    const ssRes = x.reduce((sum, xi, i) => {
      const predicted = slope * xi + intercept;
      return sum + Math.pow(y[i] - predicted, 2);
    }, 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

    return { slope, intercept, rSquared };
  }

  /**
   * Predict price for a future date based on historical data
   * 
   * @param origin - Origin airport code
   * @param destination - Destination airport code
   * @param targetDate - Target departure date
   * @param tripType - Trip type (one-way or round-trip)
   * @param daysOfHistory - Number of days of historical data to use (default: 90)
   * @returns Predicted price or 0 if insufficient data
   */
  async predictPrice(
    origin: string,
    destination: string,
    targetDate: Date,
    tripType: 'one-way' | 'round-trip' = 'round-trip',
    daysOfHistory: number = 90
  ): Promise<{
    predictedPrice: number;
    confidence: 'high' | 'medium' | 'low';
    rSquared: number;
    minPrice: number;
    maxPrice: number;
  } | null> {
    // Get historical prices (last N days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysOfHistory);
    
    // ถ้า targetDate อยู่ในอดีตหรือใกล้เกินไป ให้ใช้วันที่ในอนาคตแทน
    // เพื่อให้มีข้อมูลเพียงพอสำหรับ prediction
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDateNormalized = new Date(targetDate);
    targetDateNormalized.setHours(0, 0, 0, 0);
    
    // ถ้า targetDate อยู่ในอดีตหรือน้อยกว่า 7 วันข้างหน้า ให้ใช้ 30 วันข้างหน้าแทน
    const daysUntilTarget = (targetDateNormalized.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    const effectiveTargetDate = daysUntilTarget < 7
      ? (() => {
          const futureDate = new Date();
          futureDate.setDate(futureDate.getDate() + 30);
          return futureDate;
        })()
      : targetDateNormalized;

    const query = `
      SELECT 
        fp.price,
        fp.departure_date,
        (fp.departure_date::DATE - CURRENT_DATE::DATE) as days_until_departure
      FROM flight_prices fp
      INNER JOIN routes r ON fp.route_id = r.id
      WHERE r.origin = $1
        AND r.destination = $2
        AND fp.trip_type = $3
        AND fp.departure_date >= $4
        AND fp.departure_date <= $5
      ORDER BY fp.departure_date
    `;

    const result = await pool.query(query, [
      origin,
      destination,
      tripType,
      startDate,
      effectiveTargetDate,
    ]);

    if (result.rows.length < 10) {
      // Not enough data for reliable prediction
      return null;
    }

    // Prepare data for regression
    const daysUntilDeparture = result.rows.map((r: any) => parseFloat(r.days_until_departure));
    const prices = result.rows.map((r: any) => parseFloat(r.price));

    // Train linear regression model
    // Note: Prices from database may already include seasonal/holiday adjustments
    // The regression will learn the general price trend including these patterns
    const { slope, intercept, rSquared } = this.linearRegression(daysUntilDeparture, prices);

    // Predict for effective target date (use effectiveTargetDate instead of original targetDate)
    // This ensures consistency: we query data up to effectiveTargetDate, so we should predict for it too
    const effectiveTargetDateNormalized = new Date(effectiveTargetDate);
    effectiveTargetDateNormalized.setHours(0, 0, 0, 0);
    const todayNormalized = new Date();
    todayNormalized.setHours(0, 0, 0, 0);
    
    const targetDaysUntilDeparture =
      (effectiveTargetDateNormalized.getTime() - todayNormalized.getTime()) / (1000 * 60 * 60 * 24);
    const predictedPrice = slope * targetDaysUntilDeparture + intercept;

    // ✅ ไม่ต้องใช้ holiday correction อีก เพราะราคาใน DB มี holiday multiplier รวมอยู่แล้ว
    // (ดู seed.ts บรรทัด 203: price = basePrice * seasonMultiplier * holidayMultiplier * priceVariation)
    // Linear regression จะเรียนรู้ pattern ของ holiday multiplier จากข้อมูล historical แล้ว
    // ดังนั้น predictedPrice จะสะท้อน holiday effect ออกมาอยู่แล้ว
    console.log(`[PricePrediction] Predicted price: ฿${Math.round(predictedPrice)} (holiday multiplier already in DB prices)`);

    // Calculate confidence intervals (±20% for simplicity)
    const minPrice = Math.max(0, predictedPrice * 0.8);
    const maxPrice = predictedPrice * 1.2;

    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low';
    if (rSquared >= 0.7) {
      confidence = 'high';
    } else if (rSquared >= 0.4) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      predictedPrice: Math.max(0, Math.round(predictedPrice)),
      confidence,
      rSquared: Math.round(rSquared * 100) / 100,
      minPrice: Math.round(minPrice),
      maxPrice: Math.round(maxPrice),
    };
  }

  /**
   * Get price trend (increasing/decreasing/stable)
   * 
   * @param origin - Origin airport code
   * @param destination - Destination airport code
   * @param daysAhead - Number of days ahead to analyze (default: 30)
   * @returns Price trend analysis
   */
  async getPriceTrend(
    origin: string,
    destination: string,
    tripType: 'one-way' | 'round-trip' = 'round-trip',
    daysAhead: number = 30
  ): Promise<{
    trend: 'increasing' | 'decreasing' | 'stable';
    changePercent: number;
    currentAvgPrice: number;
    futureAvgPrice: number;
  } | null> {
    // Get prices for last 30 days and next N days
    const query = `
      SELECT 
        fp.price,
        fp.departure_date,
        CASE 
          WHEN fp.departure_date < CURRENT_DATE THEN 'past'
          ELSE 'future'
        END as period
      FROM flight_prices fp
      INNER JOIN routes r ON fp.route_id = r.id
      WHERE r.origin = $1
        AND r.destination = $2
        AND fp.trip_type = $3
        AND fp.departure_date >= CURRENT_DATE - INTERVAL '30 days'
        AND fp.departure_date <= CURRENT_DATE + INTERVAL '${daysAhead} days'
      ORDER BY fp.departure_date
    `;

    const result = await pool.query(query, [origin, destination, tripType]);

    const pastPrices = result.rows
      .filter((r: any) => r.period === 'past')
      .map((r: any) => parseFloat(r.price));
    const futurePrices = result.rows
      .filter((r: any) => r.period === 'future')
      .map((r: any) => parseFloat(r.price));

    if (pastPrices.length === 0 || futurePrices.length === 0) {
      return null;
    }

    const currentAvgPrice = pastPrices.reduce((a, b) => a + b, 0) / pastPrices.length;
    const futureAvgPrice = futurePrices.reduce((a, b) => a + b, 0) / futurePrices.length;

    const changePercent = ((futureAvgPrice - currentAvgPrice) / currentAvgPrice) * 100;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (changePercent > 5) {
      trend = 'increasing';
    } else if (changePercent < -5) {
      trend = 'decreasing';
    } else {
      trend = 'stable';
    }

    return {
      trend,
      changePercent: Math.round(changePercent * 100) / 100,
      currentAvgPrice: Math.round(currentAvgPrice),
      futureAvgPrice: Math.round(futureAvgPrice),
    };
  }

  /**
   * Predict prices for multiple dates (price forecast)
   */
  async predictPriceRange(
    origin: string,
    destination: string,
    startDate: Date,
    endDate: Date,
    tripType: 'one-way' | 'round-trip' = 'round-trip'
  ): Promise<Array<{
    date: Date;
    predictedPrice: number;
    minPrice: number;
    maxPrice: number;
  }>> {
    const predictions = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const prediction = await this.predictPrice(
        origin,
        destination,
        new Date(currentDate),
        tripType
      );

      if (prediction) {
        predictions.push({
          date: new Date(currentDate),
          predictedPrice: prediction.predictedPrice,
          minPrice: prediction.minPrice,
          maxPrice: prediction.maxPrice,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return predictions;
  }
}

