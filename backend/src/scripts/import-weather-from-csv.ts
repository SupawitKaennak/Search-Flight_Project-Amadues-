/**
 * Script to import weather data from CSV file to database
 * 
 * Usage:
 *   npm run import:weather -- --csv="./data/weather_data_2020-01_2025-12_20251229_190440.csv"
 *   tsx src/scripts/import-weather-from-csv.ts --csv="./data/weather_data.csv"
 */

import dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { WeatherStatisticsModel } from '../models/WeatherStatistics';
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

/**
 * CSV Row interface
 */
interface WeatherCSVRow {
  province: string;
  period: string;
  avgTemperature: string;
  avgRainfall: string;
  avgHumidity: string;
  weatherScore: string;
  year?: string;
  month?: string;
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
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
 * Parse CSV content into rows
 */
function parseCSV(csvContent: string): WeatherCSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: WeatherCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(`⚠️  Skipping row ${i + 1}: column count mismatch (expected ${headers.length}, got ${values.length})`);
      continue;
    }

    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    rows.push(row as WeatherCSVRow);
  }

  return rows;
}

/**
 * Import weather statistics from CSV to database
 */
async function importCSVToDatabase(csvFilePath: string): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🌤️  Weather Data Importer');
  console.log('='.repeat(60));
  console.log(`📁 CSV file: ${csvFilePath}`);

  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    process.exit(1);
  }

  console.log('📥 Reading CSV file...');
  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const rows = parseCSV(csvContent);

  if (rows.length === 0) {
    console.error('❌ No data found in CSV file');
    process.exit(1);
  }

  console.log(`📊 Found ${rows.length} records in CSV`);
  console.log('💾 Importing to database...\n');

  let totalStored = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // Track progress
  const totalRows = rows.length;
  let processedRows = 0;

  for (const row of rows) {
    try {
      // Validate required fields
      if (!row.province || !row.period) {
        console.warn(`⚠️  Skipping row: missing province or period`);
        totalSkipped++;
        processedRows++;
        continue;
      }

      // Parse numeric values
      const avgTemperature = row.avgTemperature ? parseFloat(row.avgTemperature) : null;
      const avgRainfall = row.avgRainfall ? parseFloat(row.avgRainfall) : null;
      const avgHumidity = row.avgHumidity ? parseFloat(row.avgHumidity) : null;
      const weatherScore = row.weatherScore ? parseInt(row.weatherScore) : null;

      // Validate period format (YYYY-MM)
      if (!/^\d{4}-\d{2}$/.test(row.period)) {
        console.warn(`⚠️  Skipping row: invalid period format "${row.period}" (expected YYYY-MM)`);
        totalSkipped++;
        processedRows++;
        continue;
      }

      // Store in database
      await WeatherStatisticsModel.upsertWeatherStatistics({
        province: row.province.toLowerCase().trim(),
        period: row.period,
        avgTemperature: avgTemperature && !isNaN(avgTemperature) ? avgTemperature : null,
        avgRainfall: avgRainfall && !isNaN(avgRainfall) ? avgRainfall : null,
        avgHumidity: avgHumidity && !isNaN(avgHumidity) ? avgHumidity : null,
        weatherScore: weatherScore && !isNaN(weatherScore) ? weatherScore : null,
      });

      totalStored++;
      processedRows++;

      // Show progress every 100 records
      if (processedRows % 100 === 0) {
        const progress = ((processedRows / totalRows) * 100).toFixed(1);
        console.log(`  📊 Progress: ${processedRows}/${totalRows} (${progress}%) - Stored: ${totalStored}, Errors: ${totalErrors}, Skipped: ${totalSkipped}`);
      }
    } catch (error: any) {
      totalErrors++;
      processedRows++;
      console.error(`❌ Error storing weather for ${row.province} (${row.period}):`, error.message);
      
      // Show progress even on errors
      if (processedRows % 100 === 0) {
        const progress = ((processedRows / totalRows) * 100).toFixed(1);
        console.log(`  📊 Progress: ${processedRows}/${totalRows} (${progress}%) - Stored: ${totalStored}, Errors: ${totalErrors}, Skipped: ${totalSkipped}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Import completed!');
  console.log('='.repeat(60));
  console.log(`  📊 Total records: ${totalRows}`);
  console.log(`  ✅ Successfully stored: ${totalStored}`);
  if (totalErrors > 0) {
    console.log(`  ❌ Errors: ${totalErrors}`);
  }
  if (totalSkipped > 0) {
    console.log(`  ⚠️  Skipped: ${totalSkipped}`);
  }
  console.log('='.repeat(60) + '\n');
}

/**
 * Find the latest weather CSV file in the data directory
 */
function findLatestWeatherCSV(dataDir: string = './data'): string | null {
  if (!fs.existsSync(dataDir)) {
    return null;
  }

  const files = fs.readdirSync(dataDir)
    .filter(file => file.startsWith('weather_data') && file.endsWith('.csv'))
    .map(file => {
      const filePath = path.join(dataDir, file);
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        mtime: stats.mtime,
      };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Latest first

  return files.length > 0 ? files[0].path : null;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let csvFile = args.find(arg => arg.startsWith('--csv='))?.split('=')[1];

  // If no CSV file specified, try to find the latest one in data directory
  if (!csvFile) {
    const dataDir = path.join(__dirname, '../../data');
    const latestFile = findLatestWeatherCSV(dataDir);
    
    if (latestFile) {
      csvFile = latestFile;
      console.log(`💡 No CSV file specified, using latest file: ${csvFile}\n`);
    } else {
      console.error('❌ CSV file path is required!');
      console.error('\nUsage:');
      console.error('  npm run import:weather');
      console.error('  npm run import:weather -- --csv="./data/weather_data.csv"');
      console.error('  tsx src/scripts/import-weather-from-csv.ts --csv="./data/weather_data.csv"');
      console.error('\n💡 If no --csv is specified, script will try to find the latest weather_data*.csv in ./data directory');
      process.exit(1);
    }
  }

  try {
    await importCSVToDatabase(csvFile);
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

export { importCSVToDatabase, parseCSV };

