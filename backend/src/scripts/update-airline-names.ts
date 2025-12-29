/**
 * Update airline names in database from Amadeus API
 * 
 * This script fetches all airline codes from the database and updates them
 * with full names from Amadeus API.
 * 
 * Usage:
 *   npm run update:airlines
 *   tsx src/scripts/update-airline-names.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import { AmadeusAirlineService } from '../services/amadeusAirlineService';
import { pool } from '../config/database';

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

async function updateAirlineNames() {
  const airlineService = new AmadeusAirlineService();

  console.log('\n🔄 Starting Airline Names Update');
  console.log('='.repeat(70));

  try {
    // Get all airlines from database
    const query = 'SELECT id, code, name, name_th FROM airlines ORDER BY code';
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      console.log('No airlines found in database.');
      return;
    }

    console.log(`Found ${result.rows.length} airlines in database.\n`);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const airline of result.rows) {
      const { id, code, name, name_th } = airline;

      // Skip if already has full name (not just code)
      if (name !== code && name_th !== code) {
        console.log(`⏭️  Skipping ${code}: Already has full names (${name})`);
        skipped++;
        continue;
      }

      try {
        console.log(`📡 Fetching airline info for ${code}...`);

        // Fetch from Amadeus API
        const amadeusAirline = await airlineService.getAirlineByCode(code);

        if (!amadeusAirline) {
          console.log(`⚠️  No data from Amadeus for ${code}`);
          failed++;
          continue;
        }

        const businessName = amadeusAirline.businessName || code;
        const updateQuery = `
          UPDATE airlines
          SET name = $1, name_th = $2, updated_at = NOW()
          WHERE id = $3
        `;

        await pool.query(updateQuery, [businessName, businessName, id]);

        console.log(`✅ Updated ${code}: ${businessName}`);
        updated++;

        // Rate limiting to avoid 429 errors - increased to 1 second for better safety
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`❌ Error updating ${code}:`, error.message);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 Update Summary:');
    console.log(`  Total airlines: ${result.rows.length}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed: ${failed}`);
    console.log('='.repeat(70) + '\n');
  } catch (error: any) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

updateAirlineNames().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

