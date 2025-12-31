# 🔧 Scripts Reference - Flight Search Project

เอกสารอธิบาย scripts ทั้งหมดที่ใช้ในโปรเจค สำหรับ fetch ข้อมูล, import ข้อมูล และจัดการระบบ

---

## 📋 Table of Contents

1. [Data Fetching Scripts](#data-fetching-scripts)
2. [Data Import Scripts](#data-import-scripts)
3. [Data Generation Scripts](#data-generation-scripts)
4. [Maintenance Scripts](#maintenance-scripts)
5. [Testing Scripts](#testing-scripts)
6. [NPM Scripts Reference](#npm-scripts-reference)

---

## 🌐 Data Fetching Scripts

Scripts สำหรับดึงข้อมูลจาก External APIs และบันทึกเป็น CSV

### 1. fetch-weather-to-csv.ts

**Purpose:** ดึงข้อมูลสภาพอากาศจาก Open-Meteo Historical API

**Location:** `backend/src/scripts/fetch-weather-to-csv.ts`

**API Used:** Open-Meteo Archive API (ฟรี, ไม่ต้องใช้ API key)
- URL: https://archive-api.open-meteo.com/v1/archive
- Rate Limit: 10,000 requests/day

**Features:**
- ✅ ดึงข้อมูล temperature, precipitation, humidity
- ✅ รองรับทุกจังหวัดที่มีสนามบิน (31 จังหวัด)
- ✅ เลือกช่วงเวลาได้ (เดือน/ปี)
- ✅ บันทึกเป็น CSV อัตโนมัติ
- ✅ Import เข้า database ได้ทันที (optional)

**Usage:**

```bash
cd backend

# Fetch ข้อมูล 12 เดือนล่าสุดสำหรับทุกจังหวัด
npm run fetch:weather

# Fetch และ import เข้า database ทันที
npm run fetch:weather -- --import

# Fetch จังหวัดที่เลือก
npm run fetch:weather -- --provinces="bangkok,chiang-mai,phuket"

# Fetch ช่วงปีที่กำหนด
npm run fetch:weather -- --start-year=2020 --end-year=2024

# Fetch 24 เดือนล่าสุด
npm run fetch:weather -- --months=24

# Import จาก CSV ที่มีอยู่
npm run fetch:weather -- --import --csv="./data/weather_data_2024.csv"
```

**Parameters:**
- `--all-provinces`: ดึงข้อมูลทุกจังหวัด (default: true)
- `--provinces="..."`: ระบุจังหวัดเฉพาะ (comma-separated)
- `--start-year=YYYY`: ปีเริ่มต้น (default: current year - 1)
- `--end-year=YYYY`: ปีสิ้นสุด (default: current year)
- `--months=N`: จำนวนเดือนย้อนหลัง (default: 12)
- `--import`: Import เข้า database ทันที
- `--csv="path"`: ระบุไฟล์ CSV สำหรับ import

**Output:**
- CSV File: `data/weather_data_YYYY-MM_YYYY-MM_timestamp.csv`
- Format:
  ```csv
  province,period,avgTemperature,avgRainfall,avgHumidity,weatherScore,year,month
  bangkok,2024-01,28.5,15.2,65.0,75,2024,1
  chiang-mai,2024-01,22.3,5.8,58.0,85,2024,1
  ```

**Example:**
```bash
# ตัวอย่างที่ใช้จริง: ดึงข้อมูล 5 ปีย้อนหลัง
npm run fetch:weather -- --start-year=2020 --end-year=2024 --import

# Output:
# ✅ Fetched weather data for 31 provinces
# ✅ Data range: 2020-01 to 2024-12
# ✅ Total records: 1,860 (31 provinces × 60 months)
# ✅ Saved to: data/weather_data_2020-01_2024-12_20241231_120000.csv
# ✅ Imported to database: 1,860 records
```

**Notes:**
- Open-Meteo Archive API รองรับเฉพาะข้อมูลในอดีต (ไม่มีอนาคต)
- ข้อมูลมีความแม่นยำสูง เนื่องจากใช้ข้อมูลจากสถานีอุตุนิยมวิทยา
- Script จะคำนวณ `weatherScore` (0-100) อัตโนมัติ

---

### 2. fetch-holidays-to-csv.ts

**Purpose:** ดึงข้อมูลวันหยุดนักขัตฤกษ์ไทยจาก iApp Holiday API

**Location:** `backend/src/scripts/fetch-holidays-to-csv.ts`

**API Used:** iApp Holiday API (ฟรี, ไม่ต้องใช้ API key)
- URL: https://api-ninjas.com/api/holidays (or similar)
- GitHub: https://github.com/snoprod/iApp-Holiday-API

**Features:**
- ✅ ดึงข้อมูลวันหยุดราชการไทย
- ✅ รองรับหลายปี (2024-2026)
- ✅ แยกประเภทวันหยุด (ราชการ, ธนาคาร)
- ✅ บันทึกเป็น CSV
- ✅ Import เข้า database ได้ทันที

**Usage:**

```bash
cd backend

# Fetch วันหยุด 2024-2026
npm run fetch:holidays

# Fetch และ import เข้า database
npm run fetch:holidays -- --import

# Fetch ช่วงปีที่กำหนด
npm run fetch:holidays -- --start-year=2024 --end-year=2026

# Import จาก CSV ที่มีอยู่
npm run fetch:holidays -- --import --csv="./data/thai_holidays_2024_2026.csv"
```

**Parameters:**
- `--start-year=YYYY`: ปีเริ่มต้น (default: 2024)
- `--end-year=YYYY`: ปีสิ้นสุด (default: 2026)
- `--import`: Import เข้า database ทันที
- `--csv="path"`: ระบุไฟล์ CSV สำหรับ import

**Output:**
- CSV File: `data/thai_holidays_YYYY_YYYY_timestamp.csv`
- Format:
  ```csv
  date,name,nameEn,type,isPublicHoliday,year,month,period
  2024-01-01,วันขึ้นปีใหม่,New Year's Day,public,true,2024,1,2024-01
  2024-04-13,วันสงกรานต์,Songkran Festival,public,true,2024,4,2024-04
  ```

**Example:**
```bash
# ดึงข้อมูลวันหยุด 3 ปี
npm run fetch:holidays -- --start-year=2024 --end-year=2026 --import

# Output:
# ✅ Fetched holidays for years: 2024, 2025, 2026
# ✅ Total holidays: 88 days
# ✅ Public holidays: 42 days
# ✅ Saved to: data/thai_holidays_2024_2026_20241231_120000.csv
# ✅ Imported to database: 88 records
```

**Holiday Types:**
- `public`: วันหยุดราชการ
- `bank`: วันหยุดธนาคาร
- `government`: วันหยุดเฉพาะหน่วยงานราชการ

**Notes:**
- ข้อมูลวันหยุดจะถูกใช้ในการคำนวณ season (Holiday factor = 20%)
- Long weekends จะได้ holiday score สูงกว่า
- ควร update ข้อมูลทุกปี เมื่อมีประกาศวันหยุดใหม่

---

## 📥 Data Import Scripts

Scripts สำหรับ import ข้อมูลจาก CSV เข้า database

### 3. import-weather-from-csv.ts

**Purpose:** Import ข้อมูลสภาพอากาศจาก CSV เข้า database

**Location:** `backend/src/scripts/import-weather-from-csv.ts`

**Target Table:** `weather_statistics`

**Features:**
- ✅ Auto-detect ไฟล์ CSV ล่าสุดใน `data/` folder
- ✅ Upsert (update หรือ insert)
- ✅ Progress tracking
- ✅ Error handling

**Usage:**

```bash
cd backend

# Auto-detect ไฟล์ล่าสุด
npm run import:weather

# ระบุไฟล์เอง
npm run import:weather -- --csv="./data/weather_data_2020-01_2024-12.csv"
```

**Parameters:**
- `--csv="path"`: ระบุไฟล์ CSV (optional, จะหาล่าสุดเอง)

**CSV Format Required:**
```csv
province,period,avgTemperature,avgRainfall,avgHumidity,weatherScore,year,month
bangkok,2024-01,28.5,15.2,65.0,75,2024,1
```

**Example:**
```bash
npm run import:weather

# Output:
# 📂 Auto-detected: ./data/weather_data_2020-01_2024-12_20241231_120000.csv
# 📊 Total records: 1,860
# ✅ Processing: 100%
# ✅ Successfully imported: 1,860 records
# ⏱️  Duration: 3.2s
```

**Notes:**
- Script จะ skip records ที่มี error
- ใช้ `UPSERT` operation (ON CONFLICT UPDATE)
- ปลอดภัยสำหรับรัน multiple times

---

## 🎲 Data Generation Scripts

Scripts สำหรับสร้างข้อมูล mock/test data

### 4. generate-mock-flights.ts

**Purpose:** สร้างข้อมูลเที่ยวบิน mock สำหรับพัฒนาและทดสอบ

**Location:** `backend/src/scripts/generate-mock-flights.ts`

**Features:**
- ✅ สร้างข้อมูล 31 routes (BKK → all provinces)
- ✅ 6 สายการบิน (TG, FD, SL, VZ, PG, DD)
- ✅ Seasonal price variation (High/Normal/Low)
- ✅ One-way และ Round-trip
- ✅ Batch insert (รวดเร็วมาก ~30s สำหรับ 130,000 flights)

**Usage:**

```bash
cd backend

# Generate 360 days (90 days back + 270 days forward)
npm run generate:mock-flights -- --days-back=90 --days-forward=270

# Generate 1 year
npm run generate:mock-flights -- --days-back=180 --days-forward=180

# Generate 30 days only (for testing)
npm run generate:mock-flights -- --days-back=0 --days-forward=30
```

**Parameters:**
- `--days-back=N`: จำนวนวันย้อนหลัง (default: 30)
- `--days-forward=N`: จำนวนวันล่วงหน้า (default: 180)

**Pricing Formula:**

```typescript
basePrice = 1000 + (distance_km × 0.15)

seasonalMultiplier = {
  High (Nov-Feb): 1.3-1.5x
  Normal (Mar-Apr): 0.9-1.1x
  Low (May-Oct): 0.7-0.9x
}

tripTypeMultiplier = {
  One-way: 1.0x
  Round-trip: 1.8x (with 10% discount)
}

finalPrice = basePrice × seasonalMultiplier × tripTypeMultiplier × randomVariation(±2%)
```

**Output Example:**
```bash
npm run generate:mock-flights -- --days-back=90 --days-forward=270

# Output:
# ======================================================================
# ✈️  Mock Flight Data Generator
# ======================================================================
# 📅 Date Range: 2024-10-02 to 2025-09-28 (360 days)
# 🛫 Origin: Bangkok (BKK) - Hub-based routing
# 📍 Destinations: 31 provinces (all except Bangkok)
# ✈️  Airlines: 6
# ======================================================================
# 
# 📦 Setting up airlines...
#   ✅ TG - Thai Airways
#   ✅ FD - Thai AirAsia
#   ✅ SL - Thai Lion Air
#   ✅ VZ - Thai Vietjet Air
#   ✅ PG - Bangkok Airways
#   ✅ DD - Nok Air
# 
# 🛣️  Setting up routes (31 routes)...
#   ✅ Created/updated 31 routes
# 
# ✈️  Generating flight prices for 31 routes...
# 
# ======================================================================
# ✅ Generation completed!
# ======================================================================
#   📦 Airlines: 6
#   🛣️  Routes: 31
#   ✈️  Flights: 132,990
#   ⏱️  Duration: 30.75s
# ======================================================================
```

**Data Volume:**
- 31 routes × 6 airlines × 360 days × 2 trip types = ~133,920 flights
- Database size: ~50-100 MB

**Notes:**
- ใช้ batch insert (500 records/batch) เพื่อความเร็ว
- Price มี seasonal variation สำหรับ season calculation
- ควร clear ข้อมูลเก่าก่อน re-generate: `TRUNCATE TABLE flight_prices;`

---

## 🔄 Maintenance Scripts

Scripts สำหรับจัดการและ sync ข้อมูล

### 5. sync-amadeus-flights.ts

**Purpose:** Sync ข้อมูลเที่ยวบินจาก Amadeus API เข้า database

**Location:** `backend/src/scripts/sync-amadeus-flights.ts`

**Requirements:** Amadeus API credentials

**Usage:**

```bash
cd backend
npm run sync:amadeus
```

**Notes:**
- ต้องการ `AMADEUS_CLIENT_ID` และ `AMADEUS_CLIENT_SECRET`
- ใช้สำหรับ sync ข้อมูลจริง (ไม่ใช่ mock data)

---

### 6. update-airline-names.ts

**Purpose:** อัพเดทชื่อสายการบินในฐานข้อมูล

**Location:** `backend/src/scripts/update-airline-names.ts`

**Usage:**

```bash
cd backend
npm run update:airlines
```

**What it does:**
- อัพเดทชื่อไทยและชื่ออังกฤษของสายการบิน
- ตรวจสอบ IATA codes
- เพิ่มสายการบินใหม่ (ถ้ามี)

---

## 🧪 Testing Scripts

Scripts สำหรับทดสอบระบบ

### 7. test-api-endpoints.ts

**Purpose:** ทดสอบ API endpoints ทั้งหมด

**Location:** `backend/src/scripts/test-api-endpoints.ts`

**Usage:**

```bash
cd backend
npm run test:api
```

**Tests:**
- ✅ Health check endpoint
- ✅ Flight search endpoint
- ✅ Flight analysis endpoint
- ✅ Cheapest dates endpoint
- ✅ Destination inspiration endpoint
- ✅ Airport search endpoint

**Output:**
```
🧪 Testing API Endpoints...
==================================================
✅ Health Check: PASS
✅ Flight Search: PASS (25 results)
✅ Flight Analysis: PASS (3 seasons)
✅ Cheapest Dates: PASS (10 dates)
✅ Inspiration: PASS (5 destinations)
✅ Airport Search: PASS (3 airports)
==================================================
✅ All tests passed!
```

---

## 📦 NPM Scripts Reference

รวมคำสั่ง npm ทั้งหมดที่ใช้ในโปรเจค

### Backend Scripts

```json
{
  // Development
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  
  // Database
  "migrate": "tsx src/scripts/run-migrations.ts",
  
  // Data Fetching
  "fetch:weather": "tsx src/scripts/fetch-weather-to-csv.ts",
  "fetch:holidays": "tsx src/scripts/fetch-holidays-to-csv.ts",
  
  // Data Import
  "import:weather": "tsx src/scripts/import-weather-from-csv.ts",
  
  // Data Generation
  "generate:mock-flights": "tsx src/scripts/generate-mock-flights.ts",
  
  // Sync
  "sync:amadeus": "tsx src/scripts/sync-amadeus-flights.ts",
  
  // Maintenance
  "update:airlines": "tsx src/scripts/update-airline-names.ts",
  
  // Testing
  "test:api": "tsx src/scripts/test-api-endpoints.ts"
}
```

---

## 🎯 Common Workflows

### Workflow 1: Setup โปรเจคใหม่

```bash
# 1. Clone & Install
git clone <repo-url>
cd Search-Flight_Project
cd backend && npm install
cd ../frontend && npm install

# 2. Start Database (Docker)
cd backend
docker-compose up -d

# 3. Run Migrations
npm run migrate

# 4. Fetch Weather Data (5 years)
npm run fetch:weather -- --start-year=2020 --end-year=2024 --import

# 5. Fetch Holiday Data
npm run fetch:holidays -- --start-year=2024 --end-year=2026 --import

# 6. Generate Mock Flights (1 year)
npm run generate:mock-flights -- --days-back=180 --days-forward=180

# 7. Start Backend
npm run dev
```

---

### Workflow 2: Update ข้อมูลสภาพอากาศ

```bash
cd backend

# Fetch ข้อมูล 12 เดือนล่าสุด
npm run fetch:weather -- --months=12 --import

# หรือ Fetch ปีล่าสุด
npm run fetch:weather -- --start-year=2024 --end-year=2024 --import
```

---

### Workflow 3: เคลียร์และสร้างข้อมูล Mock ใหม่

```bash
cd backend

# 1. Connect to database
docker exec -it flight_search_db psql -U postgres -d flight_search

# 2. Clear old data
TRUNCATE TABLE flight_prices;
\q

# 3. Generate new data
npm run generate:mock-flights -- --days-back=90 --days-forward=270

# ✅ Done! มี 132,990 flights ใหม่
```

---

### Workflow 4: ทดสอบระบบหลัง Deploy

```bash
cd backend

# Test all endpoints
npm run test:api

# If pass, good to go! 🚀
```

---

## 🔍 Script Locations Summary

```
backend/src/scripts/
├── fetch-weather-to-csv.ts          # Fetch weather from Open-Meteo
├── fetch-holidays-to-csv.ts         # Fetch holidays from iApp API
├── import-weather-from-csv.ts       # Import weather CSV to database
├── generate-mock-flights.ts         # Generate mock flight data
├── sync-amadeus-flights.ts          # Sync real flights from Amadeus
├── update-airline-names.ts          # Update airline information
├── test-api-endpoints.ts            # Test all API endpoints
└── fetch-amadeus-flights.ts         # Fetch flights from Amadeus API
```

---

## 💡 Tips & Best Practices

### 1. Weather Data
- ✅ Fetch ข้อมูลอย่างน้อย 2-3 ปีย้อนหลัง
- ✅ Update ทุก 3-6 เดือน
- ✅ เก็บ CSV ไว้เป็น backup

### 2. Holiday Data
- ✅ Update ทุกปีเมื่อมีประกาศวันหยุดใหม่
- ✅ ตรวจสอบ long weekends
- ✅ เพิ่มวันหยุดพิเศษ (ถ้ามี)

### 3. Mock Flight Data
- ✅ Generate อย่างน้อย 180 days forward
- ✅ Clear ข้อมูลเก่าก่อน re-generate
- ✅ ใช้ batch insert เพื่อความเร็ว

### 4. Database Backup
```bash
# Backup before major changes
docker exec flight_search_db pg_dump -U postgres flight_search > backup_$(date +%Y%m%d).sql

# Restore if needed
cat backup_20241231.sql | docker exec -i flight_search_db psql -U postgres -d flight_search
```

---

## 🆘 Troubleshooting Scripts

### Script ไม่รัน

```bash
# ตรวจสอบ node version
node --version  # Should be v18+

# ตรวจสอบ dependencies
cd backend
npm install

# ตรวจสอบ TypeScript
npx tsx --version
```

### Fetch Weather Error

```bash
# Error: Rate limit exceeded
# Solution: รอ 1 ชั่วโมง (10,000 requests/day)

# Error: Invalid province
# Solution: ตรวจสอบชื่อจังหวัดใน script (ต้องใช้ slug format: chiang-mai)
```

### Database Connection Error

```bash
# ตรวจสอบ Docker container
docker ps

# ถ้า container ไม่รัน
docker-compose up -d

# ตรวจสอบ connection
docker exec -it flight_search_db psql -U postgres -d flight_search -c "SELECT 1;"
```

### Mock Data Generation Slow

```bash
# ควรใช้เวลา ~30-40 วินาที สำหรับ 130,000 records
# ถ้าช้ากว่านี้:

# 1. ตรวจสอบ database performance
docker stats flight_search_db

# 2. ลด date range
npm run generate:mock-flights -- --days-back=30 --days-forward=90

# 3. ตรวจสอบ disk space
docker system df
```

---

## 📚 Related Documentation

- [Getting Started Guide](./01-GETTING-STARTED.md) - Setup โปรเจค
- [SQL Commands Reference](./02-SQL-COMMANDS.md) - SQL สำหรับจัดการข้อมูล
- [System Documentation](./03-SYSTEM-DOCUMENTATION.md) - Architecture & APIs
- [Quick Reference](./QUICK-REFERENCE.md) - Cheat sheet

---

**Last Updated:** 2025-12-31  
**Version:** 1.0.0

