# 🚀 Getting Started Guide - Flight Search Project

เอกสารสำหรับนักพัฒนาที่เข้ามาพัฒนาต่อโปรเจค Flight Search System

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Setup](#database-setup)
4. [Environment Configuration](#environment-configuration)
5. [Running the Project](#running-the-project)
6. [Data Import](#data-import)
7. [Mock Data Generation](#mock-data-generation)
8. [Development Workflow](#development-workflow)
9. [Troubleshooting](#troubleshooting)

---

## 📦 Prerequisites

ติดตั้งซอฟต์แวร์ต่อไปนี้ก่อนเริ่มพัฒนา:

### Required Software

1. **Node.js** (v18+ recommended)
   - Download: https://nodejs.org/
   - Verify: `node --version`

2. **PostgreSQL** (v14+ with TimescaleDB extension)
   - Download: https://www.postgresql.org/download/
   - Verify: `psql --version`

3. **Git**
   - Download: https://git-scm.com/
   - Verify: `git --version`

4. **Package Manager**
   - npm (มากับ Node.js) หรือ
   - pnpm (optional): `npm install -g pnpm`

---

## 🔧 Initial Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd Search-Flight_Project
```

### 2. Install Dependencies

#### Backend

```bash
cd backend
npm install
```

#### Frontend

```bash
cd frontend
npm install
```

---

## 🗄️ Database Setup

### 1. Create Database

เปิด PostgreSQL และสร้าง database:

```bash
# Windows (PowerShell)
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

# macOS/Linux
psql -U postgres
```

จากนั้นรันคำสั่ง SQL:

```sql
-- Create database
CREATE DATABASE flight_search;

-- Connect to database
\c flight_search

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### 2. Run Migrations

```bash
cd backend
npm run migrate
```

หรือรัน migration ทีละไฟล์:

```bash
# Windows PowerShell
Get-ChildItem -Path ".\src\database\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "Running migration: $($_.Name)"
    & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d flight_search -f $_.FullName
}
```

### 3. Verify Database Schema

```sql
-- Check tables
\dt

-- Should see:
-- airlines
-- routes
-- flight_prices
-- weather_statistics
-- holiday_statistics
-- demand_statistics
-- search_statistics
-- thai_holidays
```

---

## ⚙️ Environment Configuration

### 1. Backend Environment Variables

สร้างไฟล์ `backend/.env`:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flight_search
DB_USER=postgres
DB_PASSWORD=your_password

# Server Configuration
PORT=3001
NODE_ENV=development

# Amadeus API (optional - มี fallback ไปที่ database)
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
AMADEUS_API_BASE_URL=https://test.api.amadeus.com

# CORS
CORS_ORIGIN=http://localhost:3000
```

### 2. Frontend Environment Variables

สร้างไฟล์ `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

## 🚀 Running the Project

### 1. Start Backend Server

```bash
cd backend
npm run dev
```

Backend จะรันที่: **http://localhost:3001**

### 2. Start Frontend Server

```bash
cd frontend
npm run dev
```

Frontend จะรันที่: **http://localhost:3000**

### 3. Verify Setup

เปิดเบราว์เซอร์ไปที่:
- Frontend: http://localhost:3000
- Backend Health Check: http://localhost:3001/api/health

---

## 📥 Data Import

### 1. Import Weather Data

```bash
cd backend

# Auto-detect latest CSV file
npm run import:weather

# Or specify file
npm run import:weather -- --csv="./data/weather_data_2020-01_2025-12.csv"
```

**Expected output:**
```
✅ Import completed!
📊 Total records: 2190
✅ Successfully stored: 2190
```

### 2. Import Holiday Data (Optional)

ข้อมูลวันหยุดจะถูก import ผ่าน migration `009_insert_thai_holidays.sql` อัตโนมัติ

ตรวจสอบข้อมูล:

```sql
SELECT COUNT(*) FROM thai_holidays;
-- Should return: 88 records (2024-2026)
```

---

## 🎲 Mock Data Generation

### Generate Flight Prices

```bash
cd backend
npm run generate:mock-flights -- --days-back=90 --days-forward=270
```

**Parameters:**
- `--days-back`: จำนวนวันย้อนหลัง (default: 30)
- `--days-forward`: จำนวนวันล่วงหน้า (default: 180)

**Expected output:**
```
✅ Generation completed!
📦 Airlines: 6
🛣️  Routes: 31 (BKK to all provinces)
✈️  Flights: 132,990
⏱️  Duration: ~30-40s
```

### Verify Generated Data

```sql
-- Check flight prices count
SELECT COUNT(*) FROM flight_prices;
-- Should see: 132,990

-- Check routes
SELECT origin, destination, COUNT(*) as flights
FROM routes r
JOIN flight_prices fp ON r.id = fp.route_id
GROUP BY r.id, origin, destination
ORDER BY origin, destination;
```

---

## 🔄 Development Workflow

### Daily Development Steps

1. **Pull Latest Changes**
   ```bash
   git pull origin main
   ```

2. **Install New Dependencies** (if any)
   ```bash
   cd backend && npm install
   cd frontend && npm install
   ```

3. **Run Migrations** (if new)
   ```bash
   cd backend
   npm run migrate
   ```

4. **Start Development Servers**
   ```bash
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```

### Before Making Changes

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Changes & Test**

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: your feature description"
   ```

4. **Push & Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

---

## 🐛 Troubleshooting

### Backend Not Starting

**Problem:** Port 3001 already in use

```bash
# Windows: Kill process on port 3001
$process = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | 
           Where-Object {$_.State -eq "Listen"} | 
           Select-Object -ExpandProperty OwningProcess -First 1
if ($process) { Stop-Process -Id $process -Force }
```

### Database Connection Failed

**Problem:** Cannot connect to PostgreSQL

```bash
# 1. Check if PostgreSQL is running
Get-Service -Name "postgresql*"

# 2. Verify credentials in .env file
# 3. Test connection
psql -U postgres -d flight_search -c "SELECT 1;"
```

### Migration Errors

**Problem:** Migration already applied

```bash
# Reset database (⚠️ CAUTION: Deletes all data)
psql -U postgres -c "DROP DATABASE flight_search;"
psql -U postgres -c "CREATE DATABASE flight_search;"
psql -U postgres -d flight_search -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Re-run migrations
cd backend
npm run migrate
```

### No Flight Data

**Problem:** Search returns no results

```sql
-- Check if mock data exists
SELECT COUNT(*) FROM flight_prices;

-- If 0, generate mock data:
```

```bash
cd backend
npm run generate:mock-flights -- --days-back=90 --days-forward=270
```

### Frontend Not Loading Data

**Problem:** API calls failing

1. **Check Backend is Running**
   ```bash
   curl http://localhost:3001/api/health
   ```

2. **Check CORS Configuration**
   - Verify `CORS_ORIGIN` in `backend/.env`
   - Should be: `http://localhost:3000`

3. **Check API URL**
   - Verify `NEXT_PUBLIC_API_URL` in `frontend/.env.local`
   - Should be: `http://localhost:3001/api`

### Amadeus API Errors

**Problem:** 500 errors from Amadeus endpoints

**Solution:** ระบบมี fallback ไปที่ database อัตโนมัติ

- `/flights/cheapest-dates` → Query local database
- `/destinations/inspiration` → Query local database
- `/flights/search` → Query local database
- `/flights/price-analysis` → Calculate from local data

ไม่จำเป็นต้องมี Amadeus API key เพื่อพัฒนา!

---

## 📊 Verify Everything Works

### Quick Health Check

```bash
# 1. Backend health
curl http://localhost:3001/api/health

# 2. Database connection
psql -U postgres -d flight_search -c "SELECT COUNT(*) FROM flight_prices;"

# 3. Frontend loads
curl http://localhost:3000
```

### Test Flight Search

1. Open: http://localhost:3000
2. Search:
   - From: **Bangkok**
   - To: **Chiang Mai**
   - Date: **Any future date**
   - Trip Type: **One-way**
3. Should see:
   - ✅ Flight search results
   - ✅ Price comparison
   - ✅ Seasonal breakdown with 3 colors
   - ✅ Best time to fly recommendation

---

## 📚 Next Steps

1. Read **02-SQL-COMMANDS.md** - SQL commands for data management
2. Read **03-SYSTEM-DOCUMENTATION.md** - System architecture & formulas
3. Explore codebase:
   - `backend/src/services/` - Business logic
   - `backend/src/controllers/` - API endpoints
   - `frontend/components/` - UI components

---

## 🆘 Need Help?

- Check logs: `backend/logs/` และ browser console
- Review error messages in terminal
- Consult other documentation files in `docs/`

---

**Last Updated:** 2025-12-30
**Version:** 1.0.0

