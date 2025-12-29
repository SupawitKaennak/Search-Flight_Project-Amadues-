import { Request, Response, NextFunction } from 'express';
import { AmadeusMostBookedDestinationsService } from '../services/amadeusMostBookedDestinationsService';
import { AmadeusMostTraveledDestinationsService } from '../services/amadeusMostTraveledDestinationsService';
import { AmadeusInspirationSearchService } from '../services/amadeusInspirationSearchService';
import { AmadeusAirportService } from '../services/amadeusAirportService';
import { convertToAirportCode } from '../utils/airportCodeConverter';
import { logApiError } from '../utils/errorLogger';

const mostBookedService = new AmadeusMostBookedDestinationsService();
const mostTraveledService = new AmadeusMostTraveledDestinationsService();
const inspirationService = new AmadeusInspirationSearchService();
const airportService = new AmadeusAirportService();

/**
 * Get most booked destinations from an origin
 * GET /api/destinations/most-booked?origin=BKK&period=2024-01
 */
export async function getMostBookedDestinations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare variable outside try block for error logging
  let originAirportCode: string | null = null;

  try {
    const { origin, period } = req.query;

    if (!origin || typeof origin !== 'string') {
      res.status(400).json({
        error: 'origin parameter is required',
      });
      return;
    }

    // Convert province/country to airport code if needed
    originAirportCode = await convertToAirportCode(origin, airportService);

    if (!originAirportCode) {
      res.status(400).json({
        error: 'Invalid origin provided',
      });
      return;
    }

    const destinations = await mostBookedService.getMostBookedDestinations(
      originAirportCode,
      period as string | undefined
    );

    res.json({
      origin: originAirportCode,
      period: period || 'current',
      destinations,
    });
  } catch (error: any) {
    logApiError('DestinationController', 'getMostBookedDestinations', error, {
      requestParams: {
        origin: req.query?.origin,
        period: req.query?.period,
      },
      convertedCode: {
        originAirportCode: originAirportCode || 'unknown',
      },
    });
    next(error);
  }
}

/**
 * Get most traveled destinations from an origin
 * GET /api/destinations/most-traveled?origin=BKK&period=2024-01
 */
export async function getMostTraveledDestinations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare variable outside try block for error logging
  let originAirportCode: string | null = null;

  try {
    const { origin, period } = req.query;

    if (!origin || typeof origin !== 'string') {
      res.status(400).json({
        error: 'origin parameter is required',
      });
      return;
    }

    // Convert province/country to airport code if needed
    originAirportCode = await convertToAirportCode(origin, airportService);

    if (!originAirportCode) {
      res.status(400).json({
        error: 'Invalid origin provided',
      });
      return;
    }

    const destinations = await mostTraveledService.getMostTraveledDestinations(
      originAirportCode,
      period as string | undefined
    );

    res.json({
      origin: originAirportCode,
      period: period || 'current',
      destinations,
    });
  } catch (error: any) {
    logApiError('DestinationController', 'getMostTraveledDestinations', error, {
      requestParams: {
        origin: req.query?.origin,
        period: req.query?.period,
      },
      convertedCode: {
        originAirportCode: originAirportCode || 'unknown',
      },
    });
    next(error);
  }
}

/**
 * Search destinations by budget (inspiration search)
 * GET /api/destinations/inspiration?origin=BKK&maxPrice=5000&currency=THB&departureDate=2024-06-01&oneWay=false
 */
export async function searchDestinationsByBudget(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Declare variable outside try block for error logging
  let originAirportCode: string | null = null;

  try {
    const { origin, maxPrice, currency, departureDate, oneWay } = req.query;

    if (!origin || typeof origin !== 'string') {
      res.status(400).json({
        error: 'origin parameter is required',
      });
      return;
    }

    // Convert province/country to airport code if needed
    originAirportCode = await convertToAirportCode(origin, airportService);

    if (!originAirportCode) {
      res.status(400).json({
        error: 'Invalid origin provided',
      });
      return;
    }

    const maxPriceNum = maxPrice ? parseInt(maxPrice as string, 10) : undefined;
    const oneWayBool = oneWay === 'true';

    const destinations = await inspirationService.searchDestinationsByBudget(
      originAirportCode,
      maxPriceNum,
      (currency as string) || 'THB',
      departureDate as string | undefined,
      oneWayBool
    );

    res.json({
      origin: originAirportCode,
      maxPrice: maxPriceNum,
      currency: currency || 'THB',
      destinations,
    });
  } catch (error: any) {
    logApiError('DestinationController', 'searchDestinationsByBudget', error, {
      requestParams: {
        origin: req.query?.origin,
        maxPrice: req.query?.maxPrice,
        currency: req.query?.currency,
        departureDate: req.query?.departureDate,
        oneWay: req.query?.oneWay,
      },
      convertedCode: {
        originAirportCode: originAirportCode || 'unknown',
      },
    });
    next(error);
  }
}

