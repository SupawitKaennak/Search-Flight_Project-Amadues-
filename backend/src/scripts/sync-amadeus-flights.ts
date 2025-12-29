/**
 * Scheduled sync script for Amadeus flight data
 * Syncs popular routes daily to keep data fresh
 * 
 * Usage:
 *   npm run sync:amadeus
 *   tsx src/scripts/sync-amadeus-flights.ts
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

// Popular routes to sync daily
const POPULAR_ROUTES = [
  { origin: 'BKK', destination: 'CNX' },
  { origin: 'BKK', destination: 'HKT' },
  { origin: 'BKK', destination: 'KBV' },
];

async function syncAmadeusFlights() {
  const flightService = new AmadeusFlightOffersService();
  const today = new Date();
  const daysForward = 30; // Sync next 30 days
  const endDate = addDays(today, daysForward);

  console.log('\n🔄 Starting Amadeus Flight Data Sync');
  console.log('='.repeat(70));
  console.log(`Date Range: ${format(today, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
  console.log('💾 Smart caching: ENABLED (will skip dates updated within last 24 hours)');
  console.log('='.repeat(70) + '\n');

  let totalSynced = 0;
  let totalSkipped = 0;

  for (const route of POPULAR_ROUTES) {
    try {
      console.log(`📡 Syncing: ${route.origin} → ${route.destination}`);

      const count = await flightService.fetchAndStoreFlights({
        origin: route.origin,
        destination: route.destination,
        startDate: today,
        endDate,
        adults: 1,
        defaultReturnDays: 7,
        forceRefresh: false, // Never force refresh in sync (only update stale data)
      });

      if (count === 0) {
        totalSkipped++;
        console.log(`⏭️  Skipped ${route.origin} → ${route.destination} (all dates already cached)`);
      } else {
        totalSynced += count;
        console.log(`✅ Synced ${count} flights`);
      }
    } catch (error: any) {
      console.error(`❌ Error syncing ${route.origin} → ${route.destination}:`, error.message);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Total flights synced: ${totalSynced}`);
  if (totalSkipped > 0) {
    console.log(`⏭️  Routes skipped (already cached): ${totalSkipped}`);
  }
  console.log('='.repeat(70));
  await pool.end();
}

syncAmadeusFlights().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

