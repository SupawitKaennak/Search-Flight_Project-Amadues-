/**
 * Fetch flight data from Amadeus API and store in database
 * 
 * Usage:
 *   npm run fetch:amadeus
 *   npm run fetch:amadeus -- --force  (force refresh all data)
 *   tsx src/scripts/fetch-amadeus-flights.ts
 *   tsx src/scripts/fetch-amadeus-flights.ts --force
 */

import dotenv from 'dotenv';
import path from 'path';
import { AmadeusFlightOffersService } from '../services/amadeusFlightOffersService';
import { pool } from '../config/database';
import { addDays, format } from 'date-fns';

// Load environment variables
const envPaths = [
  path.join(__dirname, '../../.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'backend/.env'),
];

for (const envPath of envPaths) {
  try {
    dotenv.config({ path: envPath });
    break;
  } catch (error) {
    // Continue to next path
  }
}

dotenv.config();

// Check for force refresh flag
const forceRefresh = process.argv.includes('--force') || process.argv.includes('-f');

// Popular routes to fetch
const POPULAR_ROUTES = [
  { origin: 'BKK', destination: 'CNX', name: 'กรุงเทพ → เชียงใหม่' },
  { origin: 'BKK', destination: 'HKT', name: 'กรุงเทพ → ภูเก็ต' },
  { origin: 'BKK', destination: 'KBV', name: 'กรุงเทพ → กระบี่' },
  { origin: 'BKK', destination: 'HDY', name: 'กรุงเทพ → สงขลา' },
  { origin: 'BKK', destination: 'KKC', name: 'กรุงเทพ → ขอนแก่น' },
  { origin: 'BKK', destination: 'UTH', name: 'กรุงเทพ → อุดรธานี' },
];

async function fetchAmadeusFlights() {
  const flightService = new AmadeusFlightOffersService();
  const today = new Date();
  const daysForward = 90; // Fetch next 90 days (extended from 30 to cover wider range)
  const endDate = addDays(today, daysForward);

  console.log('\n🚀 Starting Amadeus Flight Data Fetch');
  console.log('='.repeat(70));
  console.log(`Date Range: ${format(today, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
  console.log(`Routes: ${POPULAR_ROUTES.length} routes`);
  if (forceRefresh) {
    console.log('🔄 Force refresh: ENABLED (will fetch all dates regardless of cache)');
  } else {
    console.log('💾 Smart caching: ENABLED (will skip dates updated within last 24 hours)');
  }
  console.log('='.repeat(70) + '\n');

  let totalFetched = 0;
  let totalSkipped = 0;

  for (const route of POPULAR_ROUTES) {
    try {
      console.log(`\n📡 Processing: ${route.origin} → ${route.destination} (${route.name})`);

      const count = await flightService.fetchAndStoreFlights({
        origin: route.origin,
        destination: route.destination,
        startDate: today,
        endDate,
        adults: 1,
        defaultReturnDays: 7,
        forceRefresh,
      });

      if (count === 0) {
        totalSkipped++;
        console.log(`⏭️  Skipped ${route.origin} → ${route.destination} (all dates already cached)`);
      } else {
        totalFetched += count;
        console.log(`✅ Fetched ${count} flights for ${route.origin} → ${route.destination}`);
      }
    } catch (error: any) {
      console.error(`❌ Error fetching ${route.origin} → ${route.destination}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Total flights fetched: ${totalFetched}`);
  if (totalSkipped > 0) {
    console.log(`⏭️  Routes skipped (already cached): ${totalSkipped}`);
  }
  console.log('='.repeat(70));
  await pool.end();
}

fetchAmadeusFlights().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

