import { Request, Response, NextFunction } from 'express';
import { AmadeusAirportService } from '../services/amadeusAirportService';
import { AirportModel } from '../models/Airport';

const airportService = new AmadeusAirportService();

/**
 * Search airports and cities
 * GET /api/airports/search?keyword=bangkok&subType=AIRPORT
 */
export async function searchAirports(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { keyword, subType } = req.query;

    if (!keyword || typeof keyword !== 'string') {
      res.status(400).json({
        error: 'keyword parameter is required',
      });
      return;
    }

    // Try database cache first
    const cachedAirports = await AirportModel.searchAirports(keyword);
    
    if (cachedAirports.length > 0) {
      res.json(cachedAirports);
      return;
    }

    // Fetch from Amadeus and cache
    const subTypeParam = (subType as 'AIRPORT' | 'CITY') || 'AIRPORT';
    const amadeusAirports = await airportService.searchAirports(keyword, subTypeParam);
    
    // Cache in database
    const airports = [];
    for (const airport of amadeusAirports) {
      if (airport.iataCode) {
        const cached = await AirportModel.getOrCreateAirport({
          code: airport.iataCode,
          name: airport.name,
          city: airport.address?.cityName || '',
          country: airport.address?.countryCode || '',
          latitude: airport.geoCode?.latitude || null,
          longitude: airport.geoCode?.longitude || null,
        });
        airports.push(cached);
      }
    }
    
    res.json(airports);
  } catch (error) {
    next(error);
  }
}

/**
 * Get airport details by code
 * GET /api/airports/:code
 */
export async function getAirportDetails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code } = req.params;

    if (!code) {
      res.status(400).json({
        error: 'Airport code is required',
      });
      return;
    }

    // Try database cache first
    let airport = await AirportModel.getAirportByCode(code.toUpperCase());

    if (!airport) {
      // Fetch from Amadeus and cache
      const amadeusAirport = await airportService.getAirportByCode(code.toUpperCase());
      
      if (amadeusAirport) {
        airport = await AirportModel.getOrCreateAirport({
          code: amadeusAirport.iataCode,
          name: amadeusAirport.name,
          city: amadeusAirport.address?.cityName || '',
          country: amadeusAirport.address?.countryCode || '',
          latitude: amadeusAirport.geoCode?.latitude || null,
          longitude: amadeusAirport.geoCode?.longitude || null,
        });
      }
    }

    if (!airport) {
      res.status(404).json({
        error: 'Airport not found',
      });
      return;
    }

    res.json(airport);
  } catch (error) {
    next(error);
  }
}

