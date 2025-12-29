/**
 * Amadeus Sync Service
 * Scheduled sync for Amadeus flight data
 */

import * as cron from 'node-cron';
import { AmadeusFlightOffersService } from './amadeusFlightOffersService';
import { AmadeusDemandDataService } from './amadeusDemandDataService';
import { OpenMeteoService } from './openMeteoService';
import { IAppHolidayService } from './iappHolidayService';
import { WeatherStatisticsModel } from '../models/WeatherStatistics';
import { HolidayStatisticsModel } from '../models/HolidayStatistics';
import { addDays, format } from 'date-fns';

export class AmadeusSyncService {
  private jobs: cron.ScheduledTask[] = [];
  private flightService: AmadeusFlightOffersService;
  private demandService: AmadeusDemandDataService;

  constructor() {
    this.flightService = new AmadeusFlightOffersService();
    this.demandService = new AmadeusDemandDataService();
  }

  /**
   * Start all scheduled sync jobs
   */
  start(): void {
    console.log('\n📅 Starting Amadeus sync jobs...');
    console.log('='.repeat(60));

    // Job: Sync flight prices daily at 2 AM
    this.scheduleFlightPriceSync();

    // Job: Sync demand data monthly on the 1st at 3 AM
    this.scheduleDemandDataSync();

    // Job: Sync weather data monthly on the 1st at 4 AM
    this.scheduleWeatherDataSync();

    // Job: Sync holiday data annually on January 1st at 5 AM
    this.scheduleHolidayDataSync();

    console.log('='.repeat(60));
    console.log(`✅ Started ${this.jobs.length} sync jobs\n`);
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    console.log('🛑 Stopping Amadeus sync jobs...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('✅ All sync jobs stopped');
  }

  /**
   * Schedule daily flight price sync
   * Runs at 2:00 AM Bangkok time
   */
  private scheduleFlightPriceSync(): void {
    const job = cron.schedule('0 2 * * *', async () => {
      const startTime = new Date();
      console.log('\n' + '='.repeat(60));
      console.log(`[AmadeusSync] 🛫 Starting flight price sync at ${startTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
      console.log('='.repeat(60));

      try {
        const today = new Date();
        const endDate = addDays(today, 90); // Sync next 90 days (extended from 30)

        const popularRoutes = [
          { origin: 'BKK', destination: 'CNX' },
          { origin: 'BKK', destination: 'HKT' },
          { origin: 'BKK', destination: 'KBV' },
        ];

        let totalSynced = 0;

        for (const route of popularRoutes) {
          try {
            console.log(`[AmadeusSync] Syncing ${route.origin} → ${route.destination}...`);

            const count = await this.flightService.fetchAndStoreFlights({
              origin: route.origin,
              destination: route.destination,
              startDate: today,
              endDate,
              adults: 1,
            });

            totalSynced += count;
            console.log(`[AmadeusSync] ✅ Synced ${count} flights for ${route.origin} → ${route.destination}`);
          } catch (error: any) {
            console.error(`[AmadeusSync] ❌ Error syncing ${route.origin} → ${route.destination}:`, error.message);
          }
        }

        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        console.log('='.repeat(60));
        console.log(`[AmadeusSync] ✅ Sync completed in ${duration.toFixed(2)}s`);
        console.log(`[AmadeusSync] Total flights synced: ${totalSynced}`);
        console.log('='.repeat(60) + '\n');
      } catch (error: any) {
        console.error('[AmadeusSync] ❌ Fatal error in sync job:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Bangkok',
    });

    this.jobs.push(job);
    job.start();
    console.log('✅ Scheduled: Flight price sync (daily at 02:00 Bangkok time)');
  }

  /**
   * Schedule monthly demand data sync
   * Runs on the 1st of each month at 3:00 AM Bangkok time
   */
  private scheduleDemandDataSync(): void {
    const job = cron.schedule('0 3 1 * *', async () => {
      const startTime = new Date();
      console.log('\n' + '='.repeat(60));
      console.log(`[AmadeusSync] 📊 Starting demand data sync at ${startTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
      console.log('='.repeat(60));

      try {
        const popularRoutes = [
          { origin: 'BKK', destination: 'CNX' },
          { origin: 'BKK', destination: 'HKT' },
          { origin: 'BKK', destination: 'KBV' },
        ];

        let totalStored = 0;

        for (const route of popularRoutes) {
          try {
            console.log(`[AmadeusSync] Fetching demand data for ${route.origin} → ${route.destination}...`);

            // Fetch and store demand data for past 12 months
            const count = await this.demandService.fetchAndStoreDemandData(
              route.origin,
              route.destination,
              12 // months back
            );

            totalStored += count;
            console.log(`[AmadeusSync] ✅ Stored ${count} periods of demand data for ${route.origin} → ${route.destination}`);
          } catch (error: any) {
            console.error(`[AmadeusSync] ❌ Error syncing demand data for ${route.origin} → ${route.destination}:`, error.message);
          }
        }

        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        console.log('='.repeat(60));
        console.log(`[AmadeusSync] ✅ Demand data sync completed in ${duration.toFixed(2)}s`);
        console.log(`[AmadeusSync] Total periods stored: ${totalStored}`);
        console.log('='.repeat(60) + '\n');
      } catch (error: any) {
        console.error('[AmadeusSync] ❌ Fatal error in demand data sync job:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Bangkok',
    });

    this.jobs.push(job);
    job.start();
    console.log('✅ Scheduled: Demand data sync (monthly on 1st at 03:00 Bangkok time)');
  }

  /**
   * Schedule monthly weather data sync
   * Runs on the 1st of each month at 4:00 AM Bangkok time
   */
  private scheduleWeatherDataSync(): void {
    const job = cron.schedule('0 4 1 * *', async () => {
      const startTime = new Date();
      console.log('\n' + '='.repeat(60));
      console.log(`[AmadeusSync] 🌤️ Starting weather data sync at ${startTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
      console.log('='.repeat(60));

      try {
        const weatherService = new OpenMeteoService();
        
        if (!weatherService.isAvailable()) {
          console.log('[AmadeusSync] ⚠️ Open-Meteo service not available, skipping weather sync');
          return;
        }

        // Popular provinces for weather tracking
        const popularProvinces = [
          'bangkok',
          'chiang-mai',
          'phuket',
          'krabi',
          'samui',
          'hat-yai',
        ];

        // Get current period and past 12 months
        const periods = Array.from({ length: 12 }, (_, i) => {
          const date = new Date();
          date.setMonth(date.getMonth() - i);
          return format(date, 'yyyy-MM');
        });

        let totalStored = 0;

        for (const province of popularProvinces) {
          for (const period of periods) {
            try {
              const weatherStats = await weatherService.getWeatherStatisticsForPeriod(province, period);
              
              if (weatherStats) {
                await WeatherStatisticsModel.upsertWeatherStatistics({
                  province,
                  period,
                  avgTemperature: weatherStats.avgTemperature,
                  avgRainfall: weatherStats.avgRainfall,
                  avgHumidity: weatherStats.avgHumidity,
                  weatherScore: weatherStats.weatherScore,
                });

                totalStored++;
              }

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error: any) {
              console.error(`[AmadeusSync] ❌ Error syncing weather for ${province} (${period}):`, error.message);
            }
          }
        }

        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        console.log('='.repeat(60));
        console.log(`[AmadeusSync] ✅ Weather data sync completed in ${duration.toFixed(2)}s`);
        console.log(`[AmadeusSync] Total periods stored: ${totalStored}`);
        console.log('='.repeat(60) + '\n');
      } catch (error: any) {
        console.error('[AmadeusSync] ❌ Fatal error in weather data sync job:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Bangkok',
    });

    this.jobs.push(job);
    job.start();
    console.log('✅ Scheduled: Weather data sync (monthly on 1st at 04:00 Bangkok time)');
  }

  /**
   * Schedule annual holiday data sync
   * Runs on January 1st at 5:00 AM Bangkok time
   */
  private scheduleHolidayDataSync(): void {
    const job = cron.schedule('0 5 1 1 *', async () => {
      const startTime = new Date();
      console.log('\n' + '='.repeat(60));
      console.log(`[AmadeusSync] 🎉 Starting holiday data sync at ${startTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
      console.log('='.repeat(60));

      try {
        const holidayService = new IAppHolidayService();
        
        if (!holidayService.isAvailable()) {
          console.log('[AmadeusSync] ⚠️ iApp API key not configured, skipping holiday sync');
          return;
        }

        const currentYear = new Date().getFullYear();
        
        // Fetch holidays for multiple years at once (current year + 2 years ahead)
        const startYear = currentYear;
        const endYear = currentYear + 2; // ดึง 3 ปีพร้อมกัน (2024, 2025, 2026)
        
        console.log(`[AmadeusSync] Fetching holidays for years ${startYear}-${endYear}...`);
        
        // ดึงข้อมูลหลายปีพร้อมกันใน 1 API call
        const holidays = await holidayService.getHolidaysForYears(startYear, endYear);
        
        console.log(`[AmadeusSync] ✅ Fetched ${holidays.length} holidays for ${endYear - startYear + 1} years`);
        
        // Group holidays by month
        const holidaysByMonth = new Map<string, typeof holidays>();
        
        holidays.forEach(holiday => {
          const holidayDate = new Date(holiday.date);
          const period = format(holidayDate, 'yyyy-MM');
          
          if (!holidaysByMonth.has(period)) {
            holidaysByMonth.set(period, []);
          }
          
          holidaysByMonth.get(period)!.push(holiday);
        });

        // Store statistics for each month
        let totalStored = 0;
        for (const [period, monthHolidays] of holidaysByMonth) {
          try {
            // Calculate statistics directly from monthHolidays instead of calling API again
            const longWeekends = monthHolidays.filter(holiday => {
              const holidayDate = new Date(holiday.date);
              return holidayService.isLongWeekend(holidayDate);
            }).length;

            const holidayScore = holidayService.calculateHolidayBoost(monthHolidays);

            await HolidayStatisticsModel.upsertHolidayStatistics({
              period,
              holidaysCount: monthHolidays.length,
              longWeekendsCount: longWeekends,
              holidayScore,
              holidaysDetail: monthHolidays,
            });

            totalStored++;
            
            // Rate limiting (น้อยลงเพราะดึงครั้งเดียว)
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error: any) {
            console.error(`[AmadeusSync] ❌ Error storing holidays for period ${period}:`, error.message);
          }
        }

        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;
        console.log('='.repeat(60));
        console.log(`[AmadeusSync] ✅ Holiday data sync completed in ${duration.toFixed(2)}s`);
        console.log(`[AmadeusSync] Total periods stored: ${totalStored}`);
        console.log('='.repeat(60) + '\n');
      } catch (error: any) {
        console.error('[AmadeusSync] ❌ Fatal error in holiday data sync job:', error);
      }
    }, {
      scheduled: false,
      timezone: 'Asia/Bangkok',
    });

    this.jobs.push(job);
    job.start();
    console.log('✅ Scheduled: Holiday data sync (annually on January 1st at 05:00 Bangkok time)');
  }
}

export const amadeusSyncService = new AmadeusSyncService();

