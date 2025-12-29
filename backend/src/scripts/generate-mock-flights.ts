/**
 * Script to generate mock flight data from Bangkok (BKK) to all 30 provinces and 6 airlines
 * Generates hub-based routes (BKK → all provinces), both one-way and round-trip flights
 * 
 * Usage:
 *   npm run generate:mock-flights
 *   npm run generate:mock-flights -- --start-date="2024-01-01" --end-date="2026-12-31"
 *   npm run generate:mock-flights -- --days-back=180 --days-forward=180
 *   npm run generate:mock-flights -- --routes="BKK-CNX,BKK-HKT"
 */

import dotenv from 'dotenv';
import path from 'path';
import { FlightModel } from '../models/Flight';
import { pool } from '../config/database';
import { addDays, format, parseISO, eachDayOfInterval } from 'date-fns';

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

// 31 Provinces with airport codes
const PROVINCES = [
  // ภาคกลาง & ตะวันออก
  { value: 'bangkok', airportCode: 'BKK' },
  { value: 'rayong', airportCode: 'UTP' },
  { value: 'trat', airportCode: 'TDX' },
  { value: 'prachuap-khiri-khan', airportCode: 'HHQ' },
  
  // ภาคเหนือ
  { value: 'chiang-mai', airportCode: 'CNX' },
  { value: 'chiang-rai', airportCode: 'CEI' },
  { value: 'lampang', airportCode: 'LPT' },
  { value: 'mae-hong-son', airportCode: 'HGN' },
  { value: 'nan', airportCode: 'NNT' },
  { value: 'phrae', airportCode: 'PRH' },
  { value: 'phitsanulok', airportCode: 'PHS' },
  { value: 'sukhothai', airportCode: 'THS' },
  { value: 'tak', airportCode: 'MAQ' },
  
  // ภาคตะวันออกเฉียงเหนือ (อีสาน)
  { value: 'udon-thani', airportCode: 'UTH' },
  { value: 'khon-kaen', airportCode: 'KKC' },
  { value: 'ubon-ratchathani', airportCode: 'UBP' },
  { value: 'nakhon-phanom', airportCode: 'KOP' },
  { value: 'sakon-nakhon', airportCode: 'SNO' },
  { value: 'roi-et', airportCode: 'ROI' },
  { value: 'loei', airportCode: 'LOE' },
  { value: 'buri-ram', airportCode: 'BFV' },
  { value: 'nakhon-ratchasima', airportCode: 'NAK' },
  
  // ภาคใต้
  { value: 'phuket', airportCode: 'HKT' },
  { value: 'songkhla', airportCode: 'HDY' },
  { value: 'krabi', airportCode: 'KBV' },
  { value: 'surat-thani', airportCode: 'URT' },
  { value: 'samui', airportCode: 'USM' },
  { value: 'nakhon-si-thammarat', airportCode: 'NST' },
  { value: 'trang', airportCode: 'TST' },
  { value: 'ranong', airportCode: 'UNN' },
  { value: 'chumphon', airportCode: 'CJM' },
  { value: 'narathiwat', airportCode: 'NAW' },
];

// 6 Airlines
const AIRLINES = [
  { code: 'TG', name: 'Thai Airways', nameTh: 'การบินไทย' },
  { code: 'FD', name: 'Thai AirAsia', nameTh: 'ไทยแอร์เอเชีย' },
  { code: 'SL', name: 'Thai Lion Air', nameTh: 'ไทยไลออนแอร์' },
  { code: 'VZ', name: 'Thai Vietjet Air', nameTh: 'ไทยเวียดเจ็ทแอร์' },
  { code: 'PG', name: 'Bangkok Airways', nameTh: 'บางกอกแอร์เวย์' },
  { code: 'DD', name: 'Nok Air', nameTh: 'นกแอร์' },
];

// Approximate distances between major airports (in km)
// Used for calculating base price and duration
const DISTANCE_MATRIX: Record<string, Record<string, number>> = {
  'BKK': {
    'CNX': 600, 'HKT': 840, 'KBV': 800, 'HDY': 950, 'KKC': 450, 'UTH': 560,
    'CEI': 780, 'UBP': 630, 'USM': 640, 'URT': 650, 'NST': 780, 'TST': 820,
    'UTP': 180, 'TDX': 320, 'HHQ': 280, 'LPT': 600, 'HGN': 900, 'NNT': 680,
    'PRH': 550, 'PHS': 380, 'THS': 430, 'MAQ': 420, 'KOP': 740, 'SNO': 650,
    'ROI': 510, 'LOE': 520, 'BFV': 410, 'NAK': 260, 'UNN': 600, 'CJM': 480,
    'NAW': 1100,
  },
  // Add more if needed, for now use BKK as reference and estimate others
};

/**
 * Calculate approximate distance between two airports
 * Uses distance matrix or estimates based on region
 */
function calculateDistance(origin: string, destination: string): number {
  // Check distance matrix first
  if (DISTANCE_MATRIX[origin] && DISTANCE_MATRIX[origin][destination]) {
    return DISTANCE_MATRIX[origin][destination];
  }
  if (DISTANCE_MATRIX[destination] && DISTANCE_MATRIX[destination][origin]) {
    return DISTANCE_MATRIX[destination][origin];
  }
  
  // Estimate based on region (rough approximation)
  // Bangkok to anywhere: 200-1100 km
  // Northern to Northern: 100-300 km
  // Southern to Southern: 100-400 km
  // Northeast to Northeast: 100-500 km
  // Cross-region: 400-1000 km
  
  const regions: Record<string, string> = {
    'BKK': 'central', 'UTP': 'central', 'TDX': 'central', 'HHQ': 'central',
    'CNX': 'north', 'CEI': 'north', 'LPT': 'north', 'HGN': 'north', 'NNT': 'north',
    'PRH': 'north', 'PHS': 'north', 'THS': 'north', 'MAQ': 'north',
    'UTH': 'northeast', 'KKC': 'northeast', 'UBP': 'northeast', 'KOP': 'northeast',
    'SNO': 'northeast', 'ROI': 'northeast', 'LOE': 'northeast', 'BFV': 'northeast', 'NAK': 'northeast',
    'HKT': 'south', 'HDY': 'south', 'KBV': 'south', 'URT': 'south', 'USM': 'south',
    'NST': 'south', 'TST': 'south', 'UNN': 'south', 'CJM': 'south', 'NAW': 'south',
  };
  
  const originRegion = regions[origin] || 'central';
  const destRegion = regions[destination] || 'central';
  
  if (originRegion === destRegion) {
    // Same region: 100-400 km
    return 200 + Math.random() * 200;
  } else if (origin === 'BKK' || destination === 'BKK') {
    // From/to Bangkok: 200-1100 km
    return 300 + Math.random() * 800;
  } else {
    // Cross-region: 400-1000 km
    return 500 + Math.random() * 500;
  }
}

/**
 * Calculate base price based on distance
 */
function calculateBasePrice(distance: number): number {
  // Base price: ~1-2 THB per km
  // Minimum: 1000 THB, Maximum: 15000 THB
  const basePrice = Math.max(1000, Math.min(15000, distance * 1.5 + (Math.random() * distance * 0.5)));
  return Math.round(basePrice);
}

/**
 * Calculate flight duration in minutes based on distance
 */
function calculateDuration(distance: number): number {
  // Average speed: ~600 km/h
  // Minimum: 30 minutes, Maximum: 180 minutes
  const duration = Math.max(30, Math.min(180, (distance / 600) * 60));
  return Math.round(duration);
}

/**
 * NOTE: Season, airline, and holiday multipliers are removed from data generation.
 * The system will calculate season from raw prices (base_price) and apply multipliers
 * dynamically based on:
 * - Multi-factor season calculation (Price 40% + Demand 30% + Holiday 20% + Weather 10%)
 * - Airline pricing differences
 * - Holiday data from database
 * 
 * This ensures no circular logic: season is calculated from raw prices, not from prices
 * that already include season multipliers.
 */

/**
 * Generate flight number
 */
function generateFlightNumber(airlineCode: string, routeHash: number, flightIndex: number): string {
  // Format: AirlineCode + 3-4 digits
  // Use route hash and flight index to generate unique numbers
  const number = 100 + (routeHash % 900) + (flightIndex % 10);
  return `${airlineCode}${number}`;
}

/**
 * Generate departure time (HH:MM format)
 */
function generateDepartureTime(): string {
  // Random time between 06:00 and 22:00
  const hour = 6 + Math.floor(Math.random() * 16);
  const minute = Math.floor(Math.random() * 4) * 15; // 0, 15, 30, 45
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Calculate arrival time based on departure time and duration
 */
function calculateArrivalTime(departureTime: string, durationMinutes: number): string {
  const [hour, minute] = departureTime.split(':').map(Number);
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const arrivalHour = Math.floor(totalMinutes / 60) % 24;
  const arrivalMinute = totalMinutes % 60;
  return `${String(arrivalHour).padStart(2, '0')}:${String(arrivalMinute).padStart(2, '0')}`;
}

/**
 * Calculate raw price (base price only, no multipliers)
 * Multipliers (season, airline, holiday) will be applied by the system after season calculation
 */
function calculateRawPrice(
  basePrice: number,
  tripType: 'one-way' | 'round-trip'
): number {
  let price = basePrice;
  
  // Round-trip is typically 1.8x one-way (not 2x due to discounts)
  // This is the only multiplier we apply at data generation time
  if (tripType === 'round-trip') {
    price *= 1.8;
  }
  
  // Add small random variation (±2-3%) for realism
  // This simulates natural price variation without affecting season calculation
  const variation = 0.98 + Math.random() * 0.04; // 0.98-1.02 (±2%)
  price *= variation;
  
  return Math.round(price);
}

/**
 * Setup airlines in database
 */
async function setupAirlines(): Promise<Map<string, any>> {
  console.log('\n📦 Setting up airlines...');
  const airlineMap = new Map<string, any>();
  
  for (const airline of AIRLINES) {
    try {
      const dbAirline = await FlightModel.getOrCreateAirline(
        airline.code,
        airline.name,
        airline.nameTh
      );
      airlineMap.set(airline.code, dbAirline);
      console.log(`  ✅ ${airline.code} - ${airline.name}`);
    } catch (error: any) {
      console.error(`  ❌ Error setting up airline ${airline.code}:`, error.message);
    }
  }
  
  return airlineMap;
}

/**
 * Generate routes from Bangkok (BKK) to all provinces
 * Only generates routes where origin is Bangkok (hub-based routing)
 */
function generateRoutes(): Array<{ origin: string; destination: string; airportCode: string }> {
  const routes: Array<{ origin: string; destination: string; airportCode: string }> = [];
  const BANGKOK_CODE = 'BKK';
  
  // Generate routes from Bangkok to all other provinces
  for (const destProv of PROVINCES) {
    if (destProv.airportCode !== BANGKOK_CODE) {
      routes.push({
        origin: BANGKOK_CODE,
        destination: destProv.airportCode,
        airportCode: `${BANGKOK_CODE}-${destProv.airportCode}`,
      });
    }
  }
  
  return routes;
}

/**
 * Setup routes in database
 */
async function setupRoutes(
  routes: Array<{ origin: string; destination: string; airportCode: string }>
): Promise<Map<string, any>> {
  console.log(`\n🛣️  Setting up routes (${routes.length} routes)...`);
  const routeMap = new Map<string, any>();
  let processed = 0;
  
  for (const route of routes) {
    try {
      const distance = calculateDistance(route.origin, route.destination);
      const basePrice = calculateBasePrice(distance);
      const avgDuration = calculateDuration(distance);
      
      const dbRoute = await FlightModel.getOrCreateRoute(
        route.origin,
        route.destination,
        basePrice,
        avgDuration
      );
      
      routeMap.set(route.airportCode, dbRoute);
      processed++;
      
      if (processed % 100 === 0) {
        console.log(`  📊 Progress: ${processed}/${routes.length} routes`);
      }
    } catch (error: any) {
      console.error(`  ❌ Error setting up route ${route.airportCode}:`, error.message);
    }
  }
  
  console.log(`  ✅ Created/updated ${processed} routes`);
  return routeMap;
}

/**
 * Generate flight prices for a route
 * Generates raw prices (base_price only) without multipliers
 * The system will calculate season from raw prices and apply multipliers later
 */
async function generateFlightPrices(
  route: { origin: string; destination: string; airportCode: string },
  routeRecord: any,
  airlineMap: Map<string, any>,
  startDate: Date,
  endDate: Date
): Promise<number> {
  const dates = eachDayOfInterval({ start: startDate, end: endDate });
  let generated = 0;
  
  for (const airline of AIRLINES) {
    const airlineRecord = airlineMap.get(airline.code);
    if (!airlineRecord) continue;
    
    for (const date of dates) {
      const distance = calculateDistance(route.origin, route.destination);
      const basePrice = calculateBasePrice(distance);
      
      // Generate one-way flight
      // Store raw price (base_price only, no multipliers)
      // System will calculate season from raw prices and apply multipliers
      try {
        // One-way: price = base_price (raw price, no multipliers)
        const oneWayPrice = calculateRawPrice(basePrice, 'one-way');
        const departureTime = generateDepartureTime();
        const duration = calculateDuration(distance);
        const arrivalTime = calculateArrivalTime(departureTime, duration);
        const routeHash = (route.origin.charCodeAt(0) + route.destination.charCodeAt(0) + route.origin.charCodeAt(1) + route.destination.charCodeAt(1)) % 1000;
        const flightNumber = generateFlightNumber(airline.code, routeHash, generated);
        
        await FlightModel.upsertFlightPrice(
          routeRecord.id,
          airlineRecord.id,
          date,
          null, // return_date for one-way
          oneWayPrice,  // price = base_price (raw price)
          basePrice,    // base_price
          departureTime,
          arrivalTime,
          duration,
          flightNumber,
          'one-way',
          'normal' // Default season - system will recalculate from raw prices
        );
        
        generated++;
      } catch (error: any) {
        // Skip duplicates (UNIQUE constraint)
        if (!error.message.includes('duplicate') && !error.message.includes('UNIQUE')) {
          console.error(`  ⚠️  Error generating one-way flight:`, error.message);
        }
      }
      
      // Generate round-trip flight (return after 7 days)
      try {
        const returnDate = addDays(date, 7);
        if (returnDate <= endDate) {
          // Round-trip: price = base_price × 1.8 (raw price with round-trip discount only)
          const roundTripPrice = calculateRawPrice(basePrice, 'round-trip');
          const departureTime = generateDepartureTime();
          const duration = calculateDuration(distance);
          const arrivalTime = calculateArrivalTime(departureTime, duration);
          const routeHash = (route.origin.charCodeAt(0) + route.destination.charCodeAt(0) + route.origin.charCodeAt(1) + route.destination.charCodeAt(1)) % 1000;
          const flightNumber = generateFlightNumber(airline.code, routeHash, generated);
          
          await FlightModel.upsertFlightPrice(
            routeRecord.id,
            airlineRecord.id,
            date,
            returnDate,
            roundTripPrice,  // price = base_price × 1.8 (raw price)
            basePrice,       // base_price (one-way base)
            departureTime,
            arrivalTime,
            duration,
            flightNumber,
            'round-trip',
            'normal' // Default season - system will recalculate from raw prices
          );
          
          generated++;
        }
      } catch (error: any) {
        // Skip duplicates (UNIQUE constraint)
        if (!error.message.includes('duplicate') && !error.message.includes('UNIQUE')) {
          console.error(`  ⚠️  Error generating round-trip flight:`, error.message);
        }
      }
    }
  }
  
  return generated;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const startDateArg = args.find(arg => arg.startsWith('--start-date='))?.split('=')[1];
  const endDateArg = args.find(arg => arg.startsWith('--end-date='))?.split('=')[1];
  const daysBackArg = parseInt(args.find(arg => arg.startsWith('--days-back='))?.split('=')[1] || '180');
  const daysForwardArg = parseInt(args.find(arg => arg.startsWith('--days-forward='))?.split('=')[1] || '180');
  const routesArg = args.find(arg => arg.startsWith('--routes='))?.split('=')[1];
  
  // Calculate date range
  let startDate: Date;
  let endDate: Date;
  
  if (startDateArg && endDateArg) {
    startDate = parseISO(startDateArg);
    endDate = parseISO(endDateArg);
  } else {
    const today = new Date();
    startDate = addDays(today, -daysBackArg);
    endDate = addDays(today, daysForwardArg);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✈️  Mock Flight Data Generator');
  console.log('='.repeat(70));
  console.log(`📅 Date Range: ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);
  console.log(`🛫 Origin: Bangkok (BKK) - Hub-based routing`);
  console.log(`📍 Destinations: ${PROVINCES.length - 1} provinces (all except Bangkok)`);
  console.log(`✈️  Airlines: ${AIRLINES.length}`);
  console.log('='.repeat(70) + '\n');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Setup airlines
    const airlineMap = await setupAirlines();
    
    // Step 2: Generate routes
    let routes = generateRoutes();
    
    // Filter routes if specified
    if (routesArg) {
      const routeList = routesArg.split(',').map(r => r.trim());
      routes = routes.filter(r => routeList.includes(r.airportCode));
      console.log(`\n🔍 Filtered to ${routes.length} routes: ${routesArg}`);
    }
    
    // Step 3: Setup routes
    const routeMap = await setupRoutes(routes);
    
    // Step 4: Generate flight prices
    console.log(`\n✈️  Generating flight prices for ${routes.length} routes...`);
    let totalFlights = 0;
    let processedRoutes = 0;
    
    for (const route of routes) {
      const routeRecord = routeMap.get(route.airportCode);
      if (!routeRecord) continue;
      
      try {
        const count = await generateFlightPrices(route, routeRecord, airlineMap, startDate, endDate);
        totalFlights += count;
        processedRoutes++;
        
        if (processedRoutes % 50 === 0) {
          console.log(`  📊 Progress: ${processedRoutes}/${routes.length} routes, ${totalFlights} flights generated`);
        }
      } catch (error: any) {
        console.error(`  ❌ Error generating flights for ${route.airportCode}:`, error.message);
      }
    }
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Generation completed!');
    console.log('='.repeat(70));
    console.log(`  📦 Airlines: ${airlineMap.size}`);
    console.log(`  🛣️  Routes: ${routeMap.size}`);
    console.log(`  ✈️  Flights: ${totalFlights}`);
    console.log(`  ⏱️  Duration: ${duration}s`);
    console.log('='.repeat(70) + '\n');
    
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

