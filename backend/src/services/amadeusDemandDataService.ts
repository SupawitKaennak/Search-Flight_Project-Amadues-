import { AmadeusService } from './amadeusService';
import { AmadeusMostBookedDestinationsService } from './amadeusMostBookedDestinationsService';
import { AmadeusMostTraveledDestinationsService } from './amadeusMostTraveledDestinationsService';
import { AmadeusPriceAnalysisService } from './amadeusPriceAnalysisService';
import { FlightModel } from '../models/Flight';
import { DemandStatisticsModel, PriceMetricsModel } from '../models/DemandStatistics';
import { format, subMonths, parseISO } from 'date-fns';

export interface DemandData {
  period: string; // YYYY-MM
  bookingsCount: number;
  travelersCount: number;
  flightsCount: number;
}

export interface HistoricalDemandData {
  routeId: number;
  origin: string;
  destination: string;
  demandData: DemandData[];
}

/**
 * Service for fetching and storing demand data from Amadeus Analytics APIs
 * Used for dynamic season calculation based on actual demand trends
 */
export class AmadeusDemandDataService extends AmadeusService {
  private bookedService: AmadeusMostBookedDestinationsService;
  private traveledService: AmadeusMostTraveledDestinationsService;
  private priceAnalysisService: AmadeusPriceAnalysisService;

  constructor() {
    super();
    this.bookedService = new AmadeusMostBookedDestinationsService();
    this.traveledService = new AmadeusMostTraveledDestinationsService();
    this.priceAnalysisService = new AmadeusPriceAnalysisService();
  }

  /**
   * Fetch and store demand data for a route for multiple periods
   * @param origin - Origin airport code
   * @param destination - Destination airport code
   * @param monthsBack - Number of months to fetch (default: 12)
   */
  async fetchAndStoreDemandData(
    origin: string,
    destination: string,
    monthsBack: number = 12
  ): Promise<number> {
    // Get or create route
    const route = await FlightModel.getOrCreateRoute(origin, destination, 0, 0);
    
    let totalStored = 0;

    // Fetch demand data for each month
    for (let i = 0; i < monthsBack; i++) {
      const targetDate = subMonths(new Date(), i);
      const period = format(targetDate, 'yyyy-MM');

      try {
        // Fetch booked destinations data
        const bookedData = await this.bookedService.getMostBookedDestinations(origin, period);
        const destinationBooked = bookedData.find(d => d.destination === destination);

        // Fetch traveled destinations data
        const traveledData = await this.traveledService.getMostTraveledDestinations(origin, period);
        const destinationTraveled = traveledData.find(d => d.destination === destination);

        // Store demand statistics
        await DemandStatisticsModel.upsertDemandStatistics({
          routeId: route.id,
          period,
          bookingsCount: destinationBooked?.analytics.travelers || 0,
          travelersCount: destinationTraveled?.analytics.travelers || 0,
          flightsCount: destinationTraveled?.analytics.flights || 0,
        });

        totalStored++;
        
        // Rate limiting
        await this.rateLimit(500);
      } catch (error: any) {
        console.error(`[AmadeusDemandDataService] Error fetching demand data for ${period}:`, error.message);
        // Continue with next period
      }
    }

    return totalStored;
  }

  /**
   * Fetch and store price metrics for a route for a date range
   * @param origin - Origin airport code
   * @param destination - Destination airport code
   * @param startDate - Start date
   * @param endDate - End date
   * @param sampleDays - Number of days to sample (default: sample every 7 days)
   */
  async fetchAndStorePriceMetrics(
    origin: string,
    destination: string,
    startDate: Date,
    endDate: Date,
    sampleDays: number = 7
  ): Promise<number> {
    // Get or create route
    const route = await FlightModel.getOrCreateRoute(origin, destination, 0, 0);
    
    let totalStored = 0;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      try {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        
        // Fetch price metrics from Amadeus
        const priceAnalysis = await this.priceAnalysisService.getPriceAnalysis({
          origin,
          destination,
          departureDate: dateStr,
        });

        if (priceAnalysis && priceAnalysis.priceMetrics) {
          await PriceMetricsModel.upsertPriceMetrics({
            routeId: route.id,
            departureDate: currentDate,
            lowestPrice: priceAnalysis.priceMetrics.lowest,
            medianPrice: priceAnalysis.priceMetrics.median,
            highestPrice: priceAnalysis.priceMetrics.highest,
          });

          totalStored++;
        }

        // Move to next sample date
        currentDate.setDate(currentDate.getDate() + sampleDays);
        
        // Rate limiting
        await this.rateLimit(500);
      } catch (error: any) {
        console.error(`[AmadeusDemandDataService] Error fetching price metrics for ${format(currentDate, 'yyyy-MM-dd')}:`, error.message);
        // Continue with next date
        currentDate.setDate(currentDate.getDate() + sampleDays);
      }
    }

    return totalStored;
  }

  /**
   * Get demand percentile for a specific period
   * Compares current period demand with historical data
   */
  async getDemandPercentile(
    routeId: number,
    period: string
  ): Promise<number> {
    // Get all historical demand data for this route
    const allDemandData = await DemandStatisticsModel.getAllDemandStatisticsForRoute(routeId);
    
    if (allDemandData.length === 0) {
      return 50; // Default to median if no data
    }

    // Get current period demand
    const currentDemand = allDemandData.find(d => d.period === period);
    if (!currentDemand) {
      return 50; // Default to median if no current data
    }

    // Calculate demand score (weighted: travelers 60%, bookings 40%)
    const currentScore = (currentDemand.travelers_count * 0.6) + (currentDemand.bookings_count * 0.4);
    
    // Calculate scores for all periods
    const allScores = allDemandData.map(d => 
      (d.travelers_count * 0.6) + (d.bookings_count * 0.4)
    ).sort((a, b) => a - b);

    // Calculate percentile
    const percentile = (allScores.filter(s => s <= currentScore).length / allScores.length) * 100;
    
    return Math.round(percentile);
  }

  /**
   * Get demand data for multiple periods (for season calculation)
   */
  async getDemandDataForPeriods(
    routeId: number,
    periods: string[]
  ): Promise<Map<string, DemandData>> {
    const demandStats = await DemandStatisticsModel.getDemandStatisticsForPeriods(routeId, periods);
    
    const demandMap = new Map<string, DemandData>();
    
    demandStats.forEach(stat => {
      demandMap.set(stat.period, {
        period: stat.period,
        bookingsCount: stat.bookings_count,
        travelersCount: stat.travelers_count,
        flightsCount: stat.flights_count,
      });
    });

    return demandMap;
  }
}

