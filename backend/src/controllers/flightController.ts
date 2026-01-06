import { Request, Response, NextFunction } from 'express';
import { FlightAnalysisService } from '../services/flightAnalysisService';
import { PricePredictionService } from '../services/pricePredictionService';
import { FlightModel } from '../models/Flight';
import { AmadeusAirportService } from '../services/amadeusAirportService';
import { AmadeusCheapestDateService } from '../services/amadeusCheapestDateService';
import { AmadeusPriceAnalysisService } from '../services/amadeusPriceAnalysisService';
import { convertToAirportCode } from '../utils/airportCodeConverter';
import { logApiError } from '../utils/errorLogger';
import {
  AnalyzeFlightPricesRequest,
  FlightPriceParams,
  PredictPriceRequest,
  PriceTrendRequest,
  PredictPriceRangeRequest,
} from '../types';
import { parseISO, format, addDays } from 'date-fns';

const flightAnalysisService = new FlightAnalysisService();
const pricePredictionService = new PricePredictionService();
const airportService = new AmadeusAirportService();
const cheapestDateService = new AmadeusCheapestDateService();
const priceAnalysisService = new AmadeusPriceAnalysisService();

/**
 * Convert province value to airport code
 * GET /api/flights/airport-code?province=bangkok
 * Note: This is a fallback - should use /api/airports/search instead
 */
export async function getAirportCodeByProvince(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { province } = req.query;
    
    if (!province || typeof province !== 'string') {
      res.status(400).json({
        error: 'Province parameter is required',
      });
      return;
    }

    // Use airport code converter utility
    const airportCode = await convertToAirportCode(province, airportService);
    
    res.json({
      province: province.toLowerCase(),
      airportCode: airportCode,
    });
  } catch (error: any) {
    res.status(404).json({
      error: 'Airport not found',
      message: error.message || `Could not find airport for province: ${province}. Please use /api/airports/search instead.`,
    });
  }
}

/**
 * Analyze flight prices and generate recommendations
 * POST /api/flights/analyze
 */
export async function analyzeFlightPrices(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params: AnalyzeFlightPricesRequest = req.body;

    // Debug: Log travel class from request body
    console.log('[FlightController] Request body travelClass:', {
      travelClass: req.body?.travelClass,
      hasTravelClass: 'travelClass' in (req.body || {}),
      allKeys: Object.keys(req.body || {}),
    });

    const result = await flightAnalysisService.analyzeFlightPrices(params);

    res.json(result);
  } catch (error: any) {
    logApiError('FlightController', 'analyzeFlightPrices', error, {
      requestParams: {
        origin: req.body?.origin,
        destination: req.body?.destination,
        durationRange: req.body?.durationRange,
        startDate: req.body?.startDate,
        endDate: req.body?.endDate,
        tripType: req.body?.tripType,
        passengerCount: req.body?.passengerCount,
        selectedAirlines: req.body?.selectedAirlines,
        travelClass: req.body?.travelClass,
      },
    });
    next(error);
  }
}

/**
 * Get flight prices for specific dates
 * POST /api/flights/prices
 */
export async function getFlightPrices(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params: FlightPriceParams = req.body;
    const {
      origin,
      destination,
      startDate,
      endDate,
      tripType,
      passengerCount,
      selectedAirlines,
      travelClass = 'economy',
    } = params;

    // Convert province/country values to airport codes using Amadeus
    const originAirportCode = await convertToAirportCode(origin, airportService);
    const destinationAirportCode = await convertToAirportCode(destination, airportService);

    // Parse dates - ใช้เฉพาะส่วนวันที่ (ไม่รวมเวลา) เพื่อหลีกเลี่ยง timezone issues
    // Frontend ส่งมาเป็น "2025-12-11" (date-only string)
    // Parse เป็น UTC date ที่เวลา 00:00:00 เพื่อให้แน่ใจว่าใช้วันที่ที่ถูกต้อง
    const startDateObj = (() => {
      const dateOnly = startDate.split('T')[0]; // เช่น "2025-12-11"
      return parseISO(dateOnly + 'T00:00:00.000Z'); // สร้างเป็น UTC date
    })();
    const endDateObj = endDate ? (() => {
      const dateOnly = endDate.split('T')[0];
      return parseISO(dateOnly + 'T00:00:00.000Z');
    })() : undefined;

    // Get airline IDs if selected
    let airlineIds: number[] | undefined;
    if (selectedAirlines.length > 0) {
      const availableAirlines = await FlightModel.getAvailableAirlines(
        originAirportCode,
        destinationAirportCode
      );
      airlineIds = availableAirlines
        .filter((a) => selectedAirlines.includes(a.code))
        .map((a) => a.id);
    }

    // Get flight prices
    const flightRecords = await FlightModel.getFlightPrices(
      originAirportCode,
      destinationAirportCode,
      startDateObj,
      endDateObj,
      tripType,
      airlineIds,
      travelClass
    );

    // Transform to response format
    // Apply travel class multiplier to economy prices
    // Database currently only has economy data, so always apply multiplier for business/first
    const travelClassMultipliers: Record<'economy' | 'business' | 'first', number> = {
      economy: 1.0,
      business: 2.5,
      first: 4.0,
    };
    const travelClassMultiplier = travelClassMultipliers[travelClass] || 1.0;
    
    const flightPrices = flightRecords.map((fp) => {
      const fpTravelClass = (fp.travel_class || 'economy') as 'economy' | 'business' | 'first';
      
      // Calculate multiplier based on travel class conversion
      // If DB has the exact travel_class, use 1.0, otherwise convert from economy
      let priceMultiplier = 1.0;
      if (fpTravelClass === travelClass) {
        // Database already has correct travel_class data
        priceMultiplier = 1.0;
      } else {
        // Convert from database travel_class to selected travel_class
        const fromMultiplier = travelClassMultipliers[fpTravelClass] || 1.0;
        const toMultiplier = travelClassMultipliers[travelClass] || 1.0;
        priceMultiplier = toMultiplier / fromMultiplier;
      }
      
      return {
        airline: fp.airline_name_th || fp.airline_name,
        airline_code: fp.airline_code || '',
        airline_name: fp.airline_name || '',
        airline_name_th: fp.airline_name_th || '',
        price: Math.round(fp.price * priceMultiplier * passengerCount),
        departureTime: fp.departure_time,
        arrivalTime: fp.arrival_time,
        duration: fp.duration,
        flightNumber: fp.flight_number,
        travelClass: travelClass,
      };
    });

    res.json(flightPrices);
  } catch (error: any) {
    logApiError('FlightController', 'getFlightPrices', error, {
      requestParams: {
        origin: req.body?.origin,
        destination: req.body?.destination,
        startDate: req.body?.startDate,
        endDate: req.body?.endDate,
        tripType: req.body?.tripType,
        passengerCount: req.body?.passengerCount,
        travelClass: req.body?.travelClass,
        selectedAirlines: req.body?.selectedAirlines,
      },
    });
    // Ensure we throw an Error instance
    if (error instanceof Error) {
      next(error);
    } else {
      next(new Error(error?.message || error?.detail || JSON.stringify(error) || 'Failed to get flight prices'));
    }
  }
}

/**
 * Get available airlines for a route
 * GET /api/flights/airlines
 */
export async function getAvailableAirlines(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { origin, destination } = req.query as {
      origin: string;
      destination: string;
    };

    // Convert province/country values to airport codes using Amadeus
    const originAirportCode = await convertToAirportCode(origin, airportService);
    const destinationAirportCode = await convertToAirportCode(destination, airportService);

    const airlines = await FlightModel.getAvailableAirlines(originAirportCode, destinationAirportCode);

    // Return airline codes
    const airlineCodes = airlines.map((a) => a.code);

    res.json(airlineCodes);
  } catch (error) {
    next(error);
  }
}

/**
 * Predict price for a future date
 * POST /api/flights/predict-price
 */
export async function predictPrice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params: PredictPriceRequest = req.body;
    const {
      origin,
      destination,
      targetDate,
      tripType = 'round-trip',
      daysOfHistory = 90,
    } = params;

    // Convert province/country values to airport codes using Amadeus
    const originAirportCode = await convertToAirportCode(origin, airportService);
    const destinationAirportCode = await convertToAirportCode(destination, airportService);

    // Parse target date - ใช้เฉพาะส่วนวันที่ (ไม่รวมเวลา) เพื่อหลีกเลี่ยง timezone issues
    // Frontend ส่งมาเป็น "2025-12-11" (date-only string)
    // Parse เป็น UTC date ที่เวลา 00:00:00 เพื่อให้แน่ใจว่าใช้วันที่ที่ถูกต้อง
    const targetDateObj = (() => {
      const dateOnly = targetDate.split('T')[0]; // เช่น "2025-12-11"
      return parseISO(dateOnly + 'T00:00:00.000Z'); // สร้างเป็น UTC date
    })();

    // Predict price
    const prediction = await pricePredictionService.predictPrice(
      originAirportCode,
      destinationAirportCode,
      targetDateObj,
      tripType,
      daysOfHistory
    );

    if (!prediction) {
      res.status(404).json({
        error: 'Insufficient data for prediction',
        message: 'Not enough historical data available for this route',
      });
      return;
    }

    res.json(prediction);
  } catch (error) {
    next(error);
  }
}

/**
 * Get price trend analysis
 * POST /api/flights/price-trend
 */
export async function getPriceTrend(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params: PriceTrendRequest = req.body;
    const {
      origin,
      destination,
      tripType = 'round-trip',
      daysAhead = 30,
    } = params;

    // Convert province/country values to airport codes using Amadeus
    const originAirportCode = await convertToAirportCode(origin, airportService);
    const destinationAirportCode = await convertToAirportCode(destination, airportService);

    // Get price trend
    const trend = await pricePredictionService.getPriceTrend(
      originAirportCode,
      destinationAirportCode,
      tripType,
      daysAhead
    );

    if (!trend) {
      res.status(404).json({
        error: 'Insufficient data for trend analysis',
        message: 'Not enough historical data available for this route',
      });
      return;
    }

    res.json(trend);
  } catch (error) {
    next(error);
  }
}

/**
 * Predict prices for a date range (price forecast)
 * POST /api/flights/predict-price-range
 */
export async function predictPriceRange(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const params: PredictPriceRangeRequest = req.body;
    const {
      origin,
      destination,
      startDate,
      endDate,
      tripType = 'round-trip',
    } = params;

    // Convert province/country values to airport codes using Amadeus
    const originAirportCode = await convertToAirportCode(origin, airportService);
    const destinationAirportCode = await convertToAirportCode(destination, airportService);

    // Parse dates - ใช้เฉพาะส่วนวันที่ (ไม่รวมเวลา) เพื่อหลีกเลี่ยง timezone issues
    // Frontend ส่งมาเป็น "2025-12-11" (date-only string)
    // Parse เป็น UTC date ที่เวลา 00:00:00 เพื่อให้แน่ใจว่าใช้วันที่ที่ถูกต้อง
    const startDateObj = (() => {
      const dateOnly = startDate.split('T')[0]; // เช่น "2025-12-11"
      return parseISO(dateOnly + 'T00:00:00.000Z'); // สร้างเป็น UTC date
    })();
    const endDateObj = (() => {
      const dateOnly = endDate.split('T')[0];
      return parseISO(dateOnly + 'T00:00:00.000Z');
    })();

    // Validate date range
    if (startDateObj >= endDateObj) {
      res.status(400).json({
        error: 'Invalid date range',
        message: 'Start date must be before end date',
      });
      return;
    }

    // Predict prices for range
    const forecast = await pricePredictionService.predictPriceRange(
      originAirportCode,
      destinationAirportCode,
      startDateObj,
      endDateObj,
      tripType
    );

    // Format dates as ISO strings
    const formattedForecast = forecast.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      predictedPrice: item.predictedPrice,
      minPrice: item.minPrice,
      maxPrice: item.maxPrice,
    }));

    res.json({ forecast: formattedForecast });
  } catch (error) {
    next(error);
  }
}

/**
 * Get cheapest dates for a route
 * POST /api/flights/cheapest-dates
 */
export async function getCheapestDates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare variables outside try block for error logging
  let originAirportCode: string | null = null;
  let destinationAirportCode: string | null = null;

  try {
    const { origin, destination, startDate, endDate, tripType = 'round-trip' } = req.body;

    if (!origin || !destination || !startDate || !endDate) {
      res.status(400).json({
        error: 'Missing required fields: origin, destination, startDate, endDate',
      });
      return;
    }

    // Convert province/country values to airport codes using Amadeus
    originAirportCode = await convertToAirportCode(origin, airportService);
    destinationAirportCode = await convertToAirportCode(destination, airportService);

    if (!originAirportCode || !destinationAirportCode) {
      res.status(400).json({
        error: 'Invalid origin or destination provided.',
      });
      return;
    }

    // Parse dates
    const startDateObj = (() => {
      const dateOnly = startDate.split('T')[0];
      return parseISO(dateOnly + 'T00:00:00.000Z');
    })();
    const endDateObj = (() => {
      const dateOnly = endDate.split('T')[0];
      return parseISO(dateOnly + 'T00:00:00.000Z');
    })();

    // Validate date range
    if (startDateObj >= endDateObj) {
      res.status(400).json({
        error: 'Invalid date range',
        message: 'Start date must be before end date',
      });
      return;
    }

    // Calculate return date range (default: 7 days after departure)
    const returnStartDate = addDays(startDateObj, 7);
    const returnEndDate = addDays(endDateObj, 7);

    // Find cheapest dates
    const cheapestDates = await cheapestDateService.findCheapestDates({
      origin: originAirportCode,
      destination: destinationAirportCode,
      departureDateRange: {
        start: format(startDateObj, 'yyyy-MM-dd'),
        end: format(endDateObj, 'yyyy-MM-dd'),
      },
      returnDateRange: tripType === 'round-trip' ? {
        start: format(returnStartDate, 'yyyy-MM-dd'),
        end: format(returnEndDate, 'yyyy-MM-dd'),
      } : undefined,
      oneWay: tripType === 'one-way',
    });

    if (!cheapestDates || cheapestDates.length === 0) {
      res.status(404).json({
        error: 'No flights found',
        message: 'Could not find any flights for the specified route and date range',
      });
      return;
    }

    // Format response
    const formattedResults = cheapestDates.map((result) => ({
      departureDate: result.departureDate,
      returnDate: result.returnDate || null,
      price: parseFloat(result.price.total),
      currency: result.price.currency,
    }));

    res.json({
      origin: originAirportCode,
      destination: destinationAirportCode,
      cheapestDates: formattedResults,
    });
  } catch (error: any) {
    logApiError('FlightController', 'getCheapestDates', error, {
      requestParams: {
        origin: req.body?.origin,
        destination: req.body?.destination,
        startDate: req.body?.startDate,
        endDate: req.body?.endDate,
        tripType: req.body?.tripType,
      },
      convertedCodes: {
        originAirportCode,
        destinationAirportCode,
      },
    });
    next(error);
  }
}

/**
 * Get price analysis for a specific route and date
 * POST /api/flights/price-analysis
 */
export async function getPriceAnalysis(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare variables outside try block for error logging
  let originAirportCode: string | null = null;
  let destinationAirportCode: string | null = null;

  try {
    const params: PriceAnalysisRequest = req.body;
    const { origin, destination, departureDate } = params;

    if (!origin || !destination || !departureDate) {
      res.status(400).json({
        error: 'Missing required fields: origin, destination, departureDate',
      });
      return;
    }

    // Convert province/country values to airport codes using Amadeus
    originAirportCode = await convertToAirportCode(origin, airportService);
    destinationAirportCode = await convertToAirportCode(destination, airportService);

    if (!originAirportCode || !destinationAirportCode) {
      res.status(400).json({
        error: 'Invalid origin or destination provided',
      });
      return;
    }

    // Format departure date
    const dateOnly = departureDate.split('T')[0]; // YYYY-MM-DD

    // Get price analysis from Amadeus
    const analysis = await priceAnalysisService.getPriceAnalysis({
      origin: originAirportCode,
      destination: destinationAirportCode,
      departureDate: dateOnly,
    });

    if (!analysis) {
      res.status(404).json({
        error: 'Price analysis not available',
        message: 'Price analysis API may not be available in test environment or insufficient data',
      });
      return;
    }

    res.json({
      origin: originAirportCode,
      destination: destinationAirportCode,
      departureDate: dateOnly,
      analysis,
    });
  } catch (error: any) {
    logApiError('FlightController', 'getPriceAnalysis', error, {
      requestParams: {
        origin: req.body?.origin,
        destination: req.body?.destination,
        departureDate: req.body?.departureDate,
      },
      convertedCodes: {
        originAirportCode: originAirportCode || 'unknown',
        destinationAirportCode: destinationAirportCode || 'unknown',
      },
    });
    next(error);
  }
}

