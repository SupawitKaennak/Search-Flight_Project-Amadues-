/**
 * Script to fetch weather data from Open-Meteo Historical API and save to CSV
 * Uses free Open-Meteo Archive API (no API key required, 10,000 requests/day)
 * Then optionally imports to database
 * 
 * Usage:
 *   npm run fetch:weather
 *   npm run fetch:weather -- --import
 *   npm run fetch:weather -- --all-provinces --months=12
 *   npm run fetch:weather -- --all-provinces --start-year=2020 --end-year=2024
 *   npm run fetch:weather -- --provinces="bangkok,chiang-mai,phuket" --start-year=2022 --end-year=2024
 *   npm run fetch:weather -- --import --csv="./data/weather_data_2024_01_20241229.csv"
 */

import dotenv from 'dotenv';
import path from 'path';
import { format, subMonths, parseISO } from 'date-fns';
import { OpenMeteoService } from '../services/openMeteoService';
import { WeatherStatisticsModel } from '../models/WeatherStatistics';
import * as fs from 'fs';

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

// All 31 Thai provinces with airports
const ALL_PROVINCES = [
  // Central & East
  'bangkok',
  'rayong',
  'trat',
  'prachuap-khiri-khan',
  
  // North
  'chiang-mai',
  'chiang-rai',
  'lampang',
  'mae-hong-son',
  'nan',
  'phrae',
  'phitsanulok',
  'sukhothai',
  'tak',
  
  // Northeast (Isan)
  'udon-thani',
  'khon-kaen',
  'ubon-ratchathani',
  'nakhon-phanom',
  'sakon-nakhon',
  'roi-et',
  'loei',
  'buri-ram',
  'nakhon-ratchasima',
  
  // South
  'phuket',
  'songkhla',
  'krabi',
  'surat-thani',
  'samui',
  'hat-yai',
  'pattani',
  'yala',
  'narathiwat',
];

interface WeatherCSVRow {
  province: string;
  period: string;
  avgTemperature: string;
  avgRainfall: string;
  avgHumidity: string;
  weatherScore: string;
  year: string;
  month: string;
}

/**
 * Convert weather statistics array to CSV format
 */
function weatherToCSV(weatherStats: Array<{
  province: string;
  period: string;
  avgTemperature: number;
  avgRainfall: number;
  avgHumidity: number;
  weatherScore: number;
}>): string {
  const rows: WeatherCSVRow[] = weatherStats.map(stat => {
    const [year, month] = stat.period.split('-');

    return {
      province: stat.province,
      period: stat.period,
      avgTemperature: stat.avgTemperature.toFixed(2),
      avgRainfall: stat.avgRainfall.toFixed(2),
      avgHumidity: stat.avgHumidity.toFixed(2),
      weatherScore: String(stat.weatherScore),
      year,
      month,
    };
  });

  // CSV Header
  const headers = ['province', 'period', 'avgTemperature', 'avgRainfall', 'avgHumidity', 'weatherScore', 'year', 'month'];
  
  // CSV Rows
  const csvRows = [
    headers.join(','),
    ...rows.map(row => [
      `"${row.province}"`,
      `"${row.period}"`,
      row.avgTemperature,
      row.avgRainfall,
      row.avgHumidity,
      row.weatherScore,
      row.year,
      row.month,
    ].join(','))
  ];

  return csvRows.join('\n');
}

/**
 * Read CSV and parse weather statistics
 */
function parseCSV(csvContent: string): WeatherCSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: WeatherCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    rows.push(row as WeatherCSVRow);
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields with commas
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote ("")
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  values.push(current.trim());

  return values.map(v => v.replace(/^"|"$/g, ''));
}

/**
 * Import weather statistics from CSV to database
 */
async function importCSVToDatabase(csvFilePath: string): Promise<void> {
  console.log(`\n📥 Importing weather data from CSV to database...`);
  console.log('='.repeat(60));

  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const rows = parseCSV(csvContent);

  let totalStored = 0;
  let totalErrors = 0;

  for (const row of rows) {
    try {
      await WeatherStatisticsModel.upsertWeatherStatistics({
        province: row.province,
        period: row.period,
        avgTemperature: parseFloat(row.avgTemperature) || null,
        avgRainfall: parseFloat(row.avgRainfall) || null,
        avgHumidity: parseFloat(row.avgHumidity) || null,
        weatherScore: parseInt(row.weatherScore) || null,
      });

      totalStored++;
    } catch (error: any) {
      totalErrors++;
      console.error(`❌ Error storing weather for ${row.province} (${row.period}):`, error.message);
    }
  }

  console.log('='.repeat(60));
  console.log(`✅ Import completed: ${totalStored} records stored`);
  if (totalErrors > 0) {
    console.log(`⚠️  Errors: ${totalErrors}`);
  }
  console.log('='.repeat(60));
}

/**
 * Generate periods (YYYY-MM) for the last N months
 */
function generatePeriods(months: number): string[] {
  const periods: string[] = [];
  for (let i = 0; i < months; i++) {
    const date = subMonths(new Date(), i);
    periods.push(format(date, 'yyyy-MM'));
  }
  return periods.reverse(); // Oldest first
}

/**
 * Generate periods (YYYY-MM) for a specific year range
 * @param startYear - Start year (e.g., 2020)
 * @param endYear - End year (e.g., 2024)
 */
function generatePeriodsForYears(startYear: number, endYear: number): string[] {
  const periods: string[] = [];
  for (let year = startYear; year <= endYear; year++) {
    for (let month = 1; month <= 12; month++) {
      periods.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  }
  return periods;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const importToDb = args.includes('--import') || args.includes('-i');
  const csvFile = args.find(arg => arg.startsWith('--csv='))?.split('=')[1];
  const allProvinces = args.includes('--all-provinces');
  const provincesArg = args.find(arg => arg.startsWith('--provinces='))?.split('=')[1];
  const periodsArg = args.find(arg => arg.startsWith('--periods='))?.split('=')[1];
  const monthsArg = parseInt(args.find(arg => arg.startsWith('--months='))?.split('=')[1] || '12');
  const startYearArg = args.find(arg => arg.startsWith('--start-year='))?.split('=')[1];
  const endYearArg = args.find(arg => arg.startsWith('--end-year='))?.split('=')[1];
  const outputDir = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || './data';

  console.log('\n' + '='.repeat(60));
  console.log('🌤️  Weather Data Fetcher');
  console.log('='.repeat(60));

  try {
    // If CSV file is provided, import from CSV only
    if (csvFile) {
      if (!fs.existsSync(csvFile)) {
        console.error(`❌ CSV file not found: ${csvFile}`);
        process.exit(1);
      }
      await importCSVToDatabase(csvFile);
      return;
    }

    const weatherService = new OpenMeteoService();

    if (!weatherService.isAvailable()) {
      console.error('❌ Open-Meteo service is not available!');
      process.exit(1);
    }

    // Determine provinces to fetch
    let provinces: string[];
    if (allProvinces) {
      provinces = ALL_PROVINCES;
      console.log(`📍 Fetching for all ${provinces.length} provinces`);
    } else if (provincesArg) {
      provinces = provincesArg.split(',').map(p => p.trim());
      console.log(`📍 Fetching for ${provinces.length} provinces: ${provinces.join(', ')}`);
    } else {
      // Default: popular provinces
      provinces = ['bangkok', 'chiang-mai', 'phuket', 'krabi', 'samui', 'hat-yai'];
      console.log(`📍 Fetching for ${provinces.length} popular provinces (default)`);
      console.log('💡 Tip: Use --all-provinces to fetch for all 31 provinces');
    }

    // Determine periods to fetch
    let periods: string[];
    if (periodsArg) {
      periods = periodsArg.split(',').map(p => p.trim());
      console.log(`📅 Fetching for ${periods.length} periods: ${periods.join(', ')}`);
    } else if (startYearArg && endYearArg) {
      // Fetch for specific year range
      const startYear = parseInt(startYearArg);
      const endYear = parseInt(endYearArg);
      periods = generatePeriodsForYears(startYear, endYear);
      console.log(`📅 Fetching for years ${startYear}-${endYear}: ${periods.length} months (${periods[0]} to ${periods[periods.length - 1]})`);
    } else {
      // Default: last N months
      periods = generatePeriods(monthsArg);
      console.log(`📅 Fetching for last ${monthsArg} months: ${periods[0]} to ${periods[periods.length - 1]}`);
      console.log('💡 Tip: Use --start-year=YYYY --end-year=YYYY to fetch specific years');
    }

    console.log(`Output directory: ${outputDir}`);
    console.log(`Import to database: ${importToDb ? 'Yes' : 'No'}`);
    console.log('='.repeat(60) + '\n');

    // Note: Open-Meteo provides free historical data
    console.log('✅ Using Open-Meteo Historical API (FREE, no API key required)');
    console.log('   Fetching actual historical weather data for each month\n');

    const allWeatherStats: Array<{
      province: string;
      period: string;
      avgTemperature: number;
      avgRainfall: number;
      avgHumidity: number;
      weatherScore: number;
    }> = [];

    let totalFetched = 0;
    let totalErrors = 0;

    for (const province of provinces) {
      console.log(`📍 Processing ${province}...`);
      
      for (const period of periods) {
        try {
          // Get weather statistics for this period
          // Uses actual historical data from Open-Meteo Archive API
          const weatherStats = await weatherService.getWeatherStatisticsForPeriod(province, period);
          
          if (weatherStats) {
            allWeatherStats.push({
              province: weatherStats.province,
              period: weatherStats.period,
              avgTemperature: weatherStats.avgTemperature,
              avgRainfall: weatherStats.avgRainfall,
              avgHumidity: weatherStats.avgHumidity,
              weatherScore: weatherStats.weatherScore,
            });

            totalFetched++;
            console.log(`  ✅ Fetched ${period}: ${weatherStats.avgTemperature}°C, ${weatherStats.avgRainfall}mm rain, score: ${weatherStats.weatherScore}`);
          } else {
            console.log(`  ⚠️  No data for ${period}`);
          }

          // Rate limiting: Open-Meteo allows 10,000 requests/day
          // Wait 0.2 seconds between calls to stay under limit (conservative)
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error: any) {
          totalErrors++;
          console.error(`  ❌ Error for ${province} (${period}):`, error.message);
        }
      }
      
      console.log(''); // Empty line between provinces
    }

    if (allWeatherStats.length === 0) {
      console.error('❌ No weather data fetched. Please check your API key and network connection.');
      process.exit(1);
    }

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${outputDir}`);
    }

    // Generate CSV filename
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const csvFilename = `weather_data_${firstPeriod}_${lastPeriod}_${timestamp}.csv`;
    const csvFilePath = path.join(outputDir, csvFilename);

    // Convert to CSV and save
    console.log(`\n💾 Saving to CSV file...`);
    const csvContent = weatherToCSV(allWeatherStats);
    fs.writeFileSync(csvFilePath, csvContent, 'utf-8');
    console.log(`✅ Saved to: ${csvFilePath}`);

    // Show summary
    console.log('\n📊 Summary:');
    console.log('='.repeat(60));
    console.log(`  Provinces: ${provinces.length}`);
    console.log(`  Periods: ${periods.length}`);
    console.log(`  Total records: ${allWeatherStats.length}`);
    console.log(`  Successfully fetched: ${totalFetched}`);
    if (totalErrors > 0) {
      console.log(`  Errors: ${totalErrors}`);
    }
    
    // Group by province
    const byProvince = new Map<string, number>();
    allWeatherStats.forEach(stat => {
      byProvince.set(stat.province, (byProvince.get(stat.province) || 0) + 1);
    });
    
    console.log('\n  Records by province:');
    Array.from(byProvince.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([province, count]) => {
        console.log(`    ${province}: ${count} periods`);
      });
    
    console.log('='.repeat(60));

    // Import to database if requested
    if (importToDb) {
      await importCSVToDatabase(csvFilePath);
    } else {
      console.log('\n💡 Tip: To import to database, run:');
      console.log(`   npm run fetch:weather -- --import`);
      console.log(`   or`);
      console.log(`   npm run fetch:weather -- --import --csv="${csvFilePath}"`);
    }

    console.log('\n✅ Done!\n');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { weatherToCSV, parseCSV, importCSVToDatabase, generatePeriods, generatePeriodsForYears };

