import { AmadeusService } from './amadeusService';
import { FlightModel } from '../models/Flight';
import { AmadeusAirlineService } from './amadeusAirlineService';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { CacheService } from './cacheService';
import { pool } from '../config/database';

export interface AmadeusFlightOffer {
  id: string;
  price: {
    total: string;
    currency: string;
  };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      duration: string;
    }>;
  }>;
  numberOfBookableSeats?: number;
}

export class AmadeusFlightOffersService extends AmadeusService {
  private airlineService: AmadeusAirlineService;

  constructor() {
    super();
    this.airlineService = new AmadeusAirlineService();
  }

  /**
   * Search flight offers from Amadeus API with database fallback
   * Uses retry logic with exponential backoff for rate limit errors
   */
  async searchFlightOffers(params: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    max?: number;
  }): Promise<AmadeusFlightOffer[]> {
    try {
      const searchParams: any = {
        originLocationCode: params.origin,
        destinationLocationCode: params.destination,
        departureDate: params.departureDate,
        adults: params.adults,
        currencyCode: 'THB',
        max: params.max || 250,
      };

      if (params.returnDate) {
        searchParams.returnDate = params.returnDate;
      }

      // Use retry logic for API calls
      const response = await this.executeWithRetry<{ data?: AmadeusFlightOffer[] }>(() =>
        this.amadeus.shopping.flightOffersSearch.get(searchParams)
      );
      
      // ✅ Step 1: If Amadeus has data, return it
      if (response.data && response.data.length > 0) {
        console.log('[AmadeusFlightOffersService] ✅ Got data from Amadeus API');
        return response.data;
      }
      
      // ⚠️ Step 2: If Amadeus returns empty, fallback to database
      console.log('[AmadeusFlightOffersService] ⚠️ Amadeus returned empty, falling back to database');
      return await this.searchFlightOffersFromDatabase(params);
    } catch (error: any) {
      console.error('[AmadeusFlightOffersService] ❌ Error searching flights, falling back to database:', error);
      // Fallback to database on error
      return await this.searchFlightOffersFromDatabase(params);
    }
  }

  /**
   * Convert Amadeus flight offer to database format
   */
  convertToFlightPrice(
    offer: AmadeusFlightOffer,
    routeId: number,
    airlineId: number,
    departureDate: Date,
    returnDate: Date | null,
    tripType: 'one-way' | 'round-trip',
    season: 'high' | 'normal' | 'low'
  ) {
    const itinerary = offer.itineraries[0];
    if (!itinerary || !itinerary.segments || itinerary.segments.length === 0) {
      throw new Error('Invalid flight offer: missing itinerary or segments');
    }

    const segment = itinerary.segments[0];
    const durationMinutes = this.parseDuration(segment.duration);
    
    const departureTime = parseISO(segment.departure.at);
    const arrivalTime = parseISO(segment.arrival.at);
    const price = parseFloat(offer.price.total);

    return {
      route_id: routeId,
      airline_id: airlineId,
      departure_date: departureDate,
      return_date: returnDate,
      price: Math.round(price),
      base_price: Math.round(price),
      departure_time: format(departureTime, 'HH:mm:ss'),
      arrival_time: format(arrivalTime, 'HH:mm:ss'),
      duration: durationMinutes,
      flight_number: `${segment.carrierCode}${segment.number}`,
      trip_type: tripType,
      season,
    };
  }

  /**
   * Fetch and store flights for a date range with smart caching
   */
  async fetchAndStoreFlights(params: {
    origin: string;
    destination: string;
    startDate: Date;
    endDate: Date;
    adults?: number;
    defaultReturnDays?: number;
    forceRefresh?: boolean;
  }): Promise<number> {
    const { origin, destination, startDate, endDate, adults = 1, defaultReturnDays = 7, forceRefresh = false } = params;
    
    // Get or create route (basePrice and avgDuration will be calculated from actual prices)
    const route = await FlightModel.getOrCreateRoute(
      origin,
      destination,
      0, // Will be calculated from actual prices
      0  // Will be calculated from actual prices
    );

    // If force refresh, skip cache check and fetch all dates
    if (forceRefresh) {
      console.log(`🔄 Force refresh enabled - fetching all dates for ${origin} → ${destination}`);
      const allDates: Date[] = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        allDates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return await this.fetchDatesFromAmadeus(allDates, origin, destination, adults, defaultReturnDays, route.id);
    }

    // Check what dates we already have in cache
    // ✅ Check both one-way and round-trip flights to determine missing dates
    // We fetch both types, so we need to check if we have data for both
    const existingRoundTripFlights = await FlightModel.getFlightPrices(
      origin,
      destination,
      startDate,
      endDate,
      'round-trip'
    );
    const existingOneWayFlights = await FlightModel.getFlightPrices(
      origin,
      destination,
      startDate,
      endDate,
      'one-way'
    );
    
    // Combine both trip types for cache checking
    const existingFlights = [...existingRoundTripFlights, ...existingOneWayFlights];

    // Find missing dates (missing or older than 24 hours)
    const missingDates: Date[] = [];
    const cachedDates: Date[] = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const existingForDate = existingFlights.filter(
        fp => format(new Date(fp.departure_date), 'yyyy-MM-dd') === dateStr
      );
      
      if (existingForDate.length === 0) {
        // No data for this date
        missingDates.push(new Date(currentDate));
      } else {
        // Check if data is fresh (updated within last 24 hours)
        const mostRecent = existingForDate.reduce((latest, current) => {
          const latestTime = new Date(latest.updated_at || latest.created_at).getTime();
          const currentTime = new Date(current.updated_at || current.created_at).getTime();
          return currentTime > latestTime ? current : latest;
        });

        const hoursSinceUpdate = differenceInDays(
          new Date(), 
          new Date(mostRecent.updated_at || mostRecent.created_at)
        ) * 24; // Convert days to hours (approximate)

        if (hoursSinceUpdate > 24) {
          // Data is older than 24 hours, fetch again
          missingDates.push(new Date(currentDate));
        } else {
          // Data is fresh (within 24 hours)
          cachedDates.push(new Date(currentDate));
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (missingDates.length === 0) {
      console.log(`✅ All dates already cached (${cachedDates.length} dates) for ${origin} → ${destination}`);
      return 0;
    }

    console.log(`📡 Fetching ${missingDates.length} missing/stale dates from Amadeus (${cachedDates.length} dates already cached)...`);

    return await this.fetchDatesFromAmadeus(missingDates, origin, destination, adults, defaultReturnDays, route.id);
  }

  /**
   * Helper method to fetch dates from Amadeus and store in database
   * Fetches both one-way and round-trip flights for each date
   */
  private async fetchDatesFromAmadeus(
    dates: Date[],
    origin: string,
    destination: string,
    adults: number,
    defaultReturnDays: number,
    routeId: number
  ): Promise<number> {
    let totalFetched = 0;
    
    for (const date of dates) {
      try {
        const month = date.getMonth();
        const season = this.getSeasonFromMonth(month);
        const dateStr = format(date, 'yyyy-MM-dd');

        // ✅ Fetch ONE-WAY flights (no returnDate)
        try {
          const oneWayOffers = await this.searchFlightOffers({
            origin,
            destination,
            departureDate: dateStr,
            // No returnDate = one-way
            adults,
          });

          for (const offer of oneWayOffers) {
            try {
              const segment = offer.itineraries[0]?.segments[0];
              if (!segment) continue;

              // Use AmadeusAirlineService to get full airline names from Amadeus API
              const airline = await this.airlineService.getOrCreateAirline(segment.carrierCode);

              const flightPrice = this.convertToFlightPrice(
                offer,
                routeId,
                airline.id,
                date,
                null, // No return date for one-way
                'one-way',
                season
              );

              await FlightModel.upsertFlightPrice(
                flightPrice.route_id,
                flightPrice.airline_id,
                flightPrice.departure_date,
                flightPrice.return_date,
                flightPrice.price,
                flightPrice.base_price,
                flightPrice.departure_time,
                flightPrice.arrival_time,
                flightPrice.duration,
                flightPrice.flight_number,
                flightPrice.trip_type,
                flightPrice.season
              );

              totalFetched++;
            } catch (error: any) {
              console.error(`Error processing one-way offer for ${dateStr}:`, error.message);
            }
          }
        } catch (error: any) {
          console.error(`Error fetching one-way flights for ${dateStr}:`, error.message);
        }

        // Rate limiting between one-way and round-trip requests
        await this.rateLimit(500);

        // ✅ Fetch ROUND-TRIP flights (with returnDate)
        try {
          const returnDate = addDays(date, defaultReturnDays);
          const roundTripOffers = await this.searchFlightOffers({
            origin,
            destination,
            departureDate: dateStr,
            returnDate: format(returnDate, 'yyyy-MM-dd'),
            adults,
          });

          for (const offer of roundTripOffers) {
            try {
              const segment = offer.itineraries[0]?.segments[0];
              if (!segment) continue;

              // Use AmadeusAirlineService to get full airline names from Amadeus API
              const airline = await this.airlineService.getOrCreateAirline(segment.carrierCode);

              const flightPrice = this.convertToFlightPrice(
                offer,
                routeId,
                airline.id,
                date,
                returnDate,
                'round-trip',
                season
              );

              await FlightModel.upsertFlightPrice(
                flightPrice.route_id,
                flightPrice.airline_id,
                flightPrice.departure_date,
                flightPrice.return_date,
                flightPrice.price,
                flightPrice.base_price,
                flightPrice.departure_time,
                flightPrice.arrival_time,
                flightPrice.duration,
                flightPrice.flight_number,
                flightPrice.trip_type,
                flightPrice.season
              );

              totalFetched++;
            } catch (error: any) {
              console.error(`Error processing round-trip offer for ${dateStr}:`, error.message);
            }
          }
        } catch (error: any) {
          console.error(`Error fetching round-trip flights for ${dateStr}:`, error.message);
        }

        // Rate limiting - increased delay to prevent 429 errors
        await this.rateLimit(500);
      } catch (error: any) {
        console.error(`Error fetching ${format(date, 'yyyy-MM-dd')}:`, error.message);
      }
    }

    return totalFetched;
  }

  /**
   * Get season from month (temporary - will be calculated from prices dynamically)
   */
  private getSeasonFromMonth(month: number): 'high' | 'normal' | 'low' {
    // This is a temporary fallback
    // Season should be calculated dynamically from actual prices
    if (month >= 10 || month <= 1) return 'high'; // Nov-Feb
    if (month >= 4 && month <= 8) return 'low';   // May-Sep
    return 'normal'; // Mar-Apr, Oct
  }

  /**
   * 🆕 Fallback: Query flight offers from our database
   * This is used when Amadeus API returns no data or has errors
   */
  private async searchFlightOffersFromDatabase(params: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    adults: number;
    max?: number;
  }): Promise<AmadeusFlightOffer[]> {
    try {
      console.log('[AmadeusFlightOffersService] 🔍 Querying database for flight offers:', {
        origin: params.origin,
        destination: params.destination,
        departureDate: params.departureDate,
        returnDate: params.returnDate,
      });

      const tripType = params.returnDate ? 'round-trip' : 'one-way';
      
      // Query from flight_prices table
      const query = `
        SELECT 
          fp.*,
          r.origin,
          r.destination,
          a.code as airline_code,
          a.name as airline_name
        FROM flight_prices fp
        INNER JOIN routes r ON fp.route_id = r.id
        INNER JOIN airlines a ON fp.airline_id = a.id
        WHERE r.origin = $1
          AND r.destination = $2
          AND DATE(fp.departure_date) = DATE($3)
          AND fp.trip_type = $4
        ORDER BY fp.price ASC
        LIMIT $5
      `;
      
      const result = await pool.query(query, [
        params.origin,
        params.destination,
        params.departureDate,
        tripType,
        params.max || 250
      ]);
      
      console.log(`[AmadeusFlightOffersService] 📊 Found ${result.rows.length} flights in database`);
      
      // Transform database records to Amadeus format
      const flightOffers: AmadeusFlightOffer[] = result.rows.map((row, index) => {
        const departureDateTime = new Date(row.departure_date);
        const [depHours, depMinutes] = row.departure_time.split(':');
        departureDateTime.setHours(parseInt(depHours), parseInt(depMinutes), 0);
        
        const arrivalDateTime = new Date(departureDateTime);
        arrivalDateTime.setMinutes(arrivalDateTime.getMinutes() + row.duration);
        
        const segments = [{
          departure: {
            iataCode: row.origin,
            at: departureDateTime.toISOString(),
          },
          arrival: {
            iataCode: row.destination,
            at: arrivalDateTime.toISOString(),
          },
          carrierCode: row.airline_code,
          number: row.flight_number.replace(row.airline_code, ''),
          duration: `PT${Math.floor(row.duration / 60)}H${row.duration % 60}M`,
        }];
        
        const itineraries = [{ duration: segments[0].duration, segments }];
        
        // Add return itinerary if round-trip
        if (tripType === 'round-trip' && row.return_date) {
          const returnDateTime = new Date(row.return_date);
          returnDateTime.setHours(parseInt(depHours), parseInt(depMinutes), 0);
          
          const returnArrivalDateTime = new Date(returnDateTime);
          returnArrivalDateTime.setMinutes(returnArrivalDateTime.getMinutes() + row.duration);
          
          itineraries.push({
            duration: segments[0].duration,
            segments: [{
              departure: {
                iataCode: row.destination,
                at: returnDateTime.toISOString(),
              },
              arrival: {
                iataCode: row.origin,
                at: returnArrivalDateTime.toISOString(),
              },
              carrierCode: row.airline_code,
              number: row.flight_number.replace(row.airline_code, ''),
              duration: `PT${Math.floor(row.duration / 60)}H${row.duration % 60}M`,
            }]
          });
        }
        
        return {
          id: `db-${row.id}`,
          price: {
            total: row.price.toString(),
            currency: row.currency || 'THB',
          },
          itineraries,
          numberOfBookableSeats: 9,
        };
      });
      
      return flightOffers;
    } catch (error) {
      console.error('[AmadeusFlightOffersService] ❌ Database fallback failed:', error);
      // Return empty array on database error (don't throw to prevent cascading failures)
      return [];
    }
  }
}

