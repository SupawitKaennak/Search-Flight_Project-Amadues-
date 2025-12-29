# Getting Started Guide

คู่มือการเริ่มต้นใช้งาน Flight Search Backend API แบบละเอียด

## 📋 สารบัญ

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Database Setup](#database-setup)
4. [Amadeus API Setup](#amadeus-api-setup)
5. [Running the Server](#running-the-server)
6. [Testing the API](#testing-the-api)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

ก่อนเริ่มต้นใช้งาน ต้องมีสิ่งต่อไปนี้:

### 1. Node.js

**Version:** Node.js 18 หรือสูงกว่า

**ตรวจสอบ version:**
```bash
node --version
```

**ติดตั้ง Node.js:**
- **Windows/macOS**: ดาวน์โหลดจาก [nodejs.org](https://nodejs.org/)
- **Linux**: 
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

### 2. Docker และ Docker Compose

**Version:** Docker 20.10+ และ Docker Compose 2.0+

**ติดตั้ง Docker:**
- **Windows/macOS**: ดาวน์โหลด [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- **Linux**: 
  ```bash
  # Ubuntu/Debian
  sudo apt-get update
  sudo apt-get install docker.io docker-compose-plugin
  
  # หรือใช้ Docker Compose standalone
  sudo apt-get install docker-compose
  ```

**ตรวจสอบการติดตั้ง:**
```bash
docker --version
docker compose version
```

> 💡 **หมายเหตุ**: เราใช้ Docker Compose สำหรับ PostgreSQL และ TimescaleDB เพื่อความง่ายและรวดเร็วในการ setup

### 4. Amadeus API Credentials

ต้องมี Amadeus API Client ID และ Client Secret (ดูขั้นตอนใน [Amadeus API Setup](#amadeus-api-setup))

## Installation

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd backend
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Setup Environment Variables

คัดลอกไฟล์ `.env.example` เป็น `.env`:

```bash
cp .env.example .env
```

แก้ไขไฟล์ `.env` ตามค่าที่ต้องการ:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flight_search
DB_USER=postgres
DB_PASSWORD=your_password_here

# TimescaleDB Extension
ENABLE_TIMESCALEDB=true

# CORS Configuration
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=200

# Amadeus API Configuration
AMADEUS_CLIENT_ID=your_amadeus_client_id
AMADEUS_CLIENT_SECRET=your_amadeus_client_secret
AMADEUS_ENVIRONMENT=test

# Weather API Configuration
# Using Open-Meteo Historical API (FREE, no API key required)
# Documentation: https://open-meteo.com/en/docs/historical-weather-api
# No configuration needed - service is always available

# iApp Holiday API Configuration (Required for holiday data)
# Get your API key from: https://iapp.co.th
IAPP_API_KEY=your_iapp_api_key_here
IAPP_API_URL=https://api.iapp.co.th/v3/store/data

# Scheduled Jobs
ENABLE_SCHEDULED_JOBS=false
```

## Database Setup

### Step 1: Start PostgreSQL with Docker Compose

เราใช้ Docker Compose เพื่อรัน PostgreSQL และ TimescaleDB แบบง่ายๆ

#### วิธีที่แนะนำ: ใช้ docker-compose.yml (ไฟล์หลัก)

ใช้ `docker-compose.yml` ซึ่งมี TimescaleDB ติดตั้งอยู่แล้ว:

```bash
npm run docker:up
```

หรือใช้ docker compose โดยตรง:

```bash
docker compose up -d
```

**ข้อดี:**
- TimescaleDB extension ติดตั้งอัตโนมัติแล้ว
- ไม่ต้องติดตั้ง extension แยก
- ใช้งานได้ทันที

#### วิธีทางเลือก: ใช้ docker-compose.simple.yml (สำหรับกรณีพิเศษ)

ใช้ `docker-compose.simple.yml` ซึ่งเป็น PostgreSQL ธรรมดา (ต้องติดตั้ง TimescaleDB extension แยก):

```bash
npm run docker:simple
```

หรือใช้ docker compose โดยตรง:

```bash
docker compose -f docker-compose.simple.yml up -d
```

**ใช้เมื่อ:**
- มีปัญหา Permission กับ TimescaleDB image
- ต้องการใช้ PostgreSQL image ธรรมดา

### Step 2: ตรวจสอบว่า Container ทำงาน

```bash
docker ps
```

ควรเห็น container ชื่อ `flight_search_db` กำลังทำงาน

### Step 3: Enable TimescaleDB Extension (ถ้าใช้ docker-compose.simple.yml เท่านั้น)

> ⚠️ **สำคัญ**: ขั้นตอนนี้ต้องทำเฉพาะเมื่อใช้ `docker-compose.simple.yml` เท่านั้น
> 
> ถ้าใช้ `docker-compose.yml` (แนะนำ) ข้ามขั้นตอนนี้ได้เลย เพราะ TimescaleDB extension ติดตั้งอัตโนมัติแล้ว

ถ้าใช้ `docker-compose.simple.yml` ต้องติดตั้ง TimescaleDB extension แยก:

```bash
# เชื่อมต่อ database
docker exec -it flight_search_db psql -U postgres -d flight_search
```

ใน psql prompt:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

ตรวจสอบว่า extension ถูกติดตั้งแล้ว:

```sql
\dx
```

ควรเห็น `timescaledb` ในรายการ

ออกจาก psql:

```sql
\q
```

### Step 4: Run Migrations

รัน migrations เพื่อสร้าง tables:

```bash
npm run migrate
```

ควรเห็น output แบบนี้:

```
Running migration: 001_initial_schema
Running migration: 002_create_hypertable
Running migration: 003_create_search_statistics
...
✅ All migrations completed successfully
```

### Step 5: Verify Database Setup

เชื่อมต่อ database และตรวจสอบ tables:

```bash
# ใช้ Docker exec
docker exec -it flight_search_db psql -U postgres -d flight_search
```

หรือถ้ามี psql ติดตั้งอยู่แล้ว:

```bash
psql -h localhost -U postgres -d flight_search
```

ใน psql prompt:

```sql
\dt
```

ควรเห็น tables ต่อไปนี้:
- `airports`
- `airlines`
- `routes`
- `flight_prices`
- `flight_prices_history`
- `search_statistics`
- `price_statistics`
- `schema_migrations`

ออกจาก psql:

```sql
\q
```

## Amadeus API Setup

### Step 1: สมัครสมาชิก Amadeus

1. ไปที่ [Amadeus Developers](https://developers.amadeus.com)
2. คลิก "Sign Up" หรือ "Get Started"
3. กรอกข้อมูลและยืนยันอีเมล

#### Step 2: สร้าง App

1. หลังจาก login เข้าไปที่ Dashboard
2. คลิก "Create New App"
3. กรอกข้อมูล:
   - **App Name**: Flight Search Backend (หรือชื่อที่ต้องการ)
   - **API**: Flight Offers Search
   - **Environment**: Test (สำหรับทดสอบ)

#### Step 3: รับ API Credentials

1. หลังจากสร้าง App แล้ว จะเห็น **Client ID** และ **Client Secret**
2. Copy ค่าเหล่านี้ไปใส่ในไฟล์ `.env`:
   ```env
   AMADEUS_CLIENT_ID=your_client_id_here
   AMADEUS_CLIENT_SECRET=your_client_secret_here
   AMADEUS_ENVIRONMENT=test
   ```

#### Step 4: ตรวจสอบ API Credentials

ทดสอบว่า API credentials ใช้งานได้:

```bash
npm run fetch:amadeus
```

หรือใช้ curl:

```bash
curl -X POST "https://test.api.amadeus.com/v1/security/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

## Running the Server

### Development Mode

รัน server ในโหมด development (มี hot reload):

```bash
npm run dev
```

ควรเห็น output แบบนี้:

```
🚀 Server is running!
📍 Environment: development
🌐 Server: http://localhost:3001
📡 API: http://localhost:3001/api
❤️  Health: http://localhost:3001/api/health
```

### Production Mode

1. Build TypeScript:

```bash
npm run build
```

2. Start server:

```bash
npm start
```

## Testing the API

### 1. Health Check

ทดสอบว่า server ทำงาน:

```bash
curl http://localhost:3001/api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "flight-search-api"
}
```

### 2. Search Airports

```bash
curl "http://localhost:3001/api/airports/search?keyword=bangkok"
```

### 3. Get All Airlines

```bash
curl http://localhost:3001/api/airlines
```

### 4. Analyze Flight Prices

```bash
curl -X POST http://localhost:3001/api/flights/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "Bangkok",
    "destination": "Chiang Mai",
    "durationRange": { "min": 2, "max": 5 },
    "startDate": "2024-06-01",
    "endDate": "2024-06-30",
    "tripType": "round-trip",
    "passengerCount": 1
  }'
```

## Common Tasks

### Fetch Flight Data from Amadeus

ดึงข้อมูลเที่ยวบินจาก Amadeus และเก็บใน database:

```bash
npm run fetch:amadeus
```

หรือใช้ script โดยตรง:

```bash
tsx src/scripts/fetch-amadeus-flights.ts
```

### Enable Scheduled Jobs

เปิดใช้งาน scheduled jobs เพื่อ sync ข้อมูลอัตโนมัติ:

1. แก้ไข `.env`:
   ```env
   ENABLE_SCHEDULED_JOBS=true
   ```

2. Restart server

ระบบจะ sync ข้อมูลทุกวันเวลา 02:00 (Bangkok time)

### Run Migrations

รัน migrations:

```bash
npm run migrate
```

Rollback migrations:

```bash
npm run migrate:down
```

### Check Database Connection

ทดสอบการเชื่อมต่อ database:

```bash
psql -h localhost -U postgres -d flight_search
```

## Troubleshooting

### Problem: Cannot connect to database

**Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**
1. ตรวจสอบว่า Docker container กำลังรัน:
   ```bash
   docker ps
   ```
   
   ถ้าไม่เห็น container ให้ start:
   ```bash
   npm run docker:up
   # หรือ
   docker compose up -d
   ```

2. ตรวจสอบ container logs:
   ```bash
   npm run docker:logs
   # หรือ
   docker compose logs postgres
   ```

3. ตรวจสอบ connection settings ใน `.env`:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=postgres
   ```

4. ทดสอบการเชื่อมต่อ:
   ```bash
   docker exec -it flight_search_db psql -U postgres -d flight_search -c "SELECT 1;"
   ```

### Problem: TimescaleDB extension not found

**Error:**
```
ERROR: extension "timescaledb" does not exist
```

**Solutions:**
1. ถ้าใช้ `docker-compose.simple.yml` (PostgreSQL image - alternative):
   - ต้องติดตั้ง TimescaleDB extension แยก:
   ```bash
   docker exec -it flight_search_db psql -U postgres -d flight_search -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
   ```

2. ถ้าใช้ `docker-compose.yml` (TimescaleDB image - **แนะนำ**):
   - Extension ควรถูกติดตั้งอัตโนมัติแล้ว
   - ตรวจสอบว่า container ใช้ image ที่ถูกต้อง:
   ```bash
   docker compose ps
   ```
   - ควรเห็น image เป็น `timescale/timescaledb:latest-pg18`

3. ตรวจสอบว่า extension ถูกติดตั้งแล้ว:
   ```bash
   docker exec -it flight_search_db psql -U postgres -d flight_search -c "\dx"
   ```

### Problem: Amadeus API authentication failed

**Error:**
```
Amadeus API Error: Invalid client credentials
```

**Solutions:**
1. ตรวจสอบว่า Client ID และ Client Secret ถูกต้องใน `.env`
2. ตรวจสอบว่า API key ยังไม่หมดอายุ
3. ตรวจสอบว่าใช้ environment ที่ถูกต้อง (`test` หรือ `production`)

### Problem: Migration failed

**Error:**
```
Error: Migration failed: relation already exists
```

**Solutions:**
1. ตรวจสอบว่า migration ถูกรันไปแล้ว:
   ```sql
   SELECT * FROM schema_migrations;
   ```

2. ถ้าต้องการ reset:
   ```sql
   DROP TABLE schema_migrations;
   ```
   แล้วรัน migrations ใหม่

### Problem: Rate limit exceeded

**Error:**
```
Amadeus API Error: Rate limit exceeded
```

**Solutions:**
1. Amadeus Test API มี rate limit 2,000 requests/day
2. ใช้ caching เพื่อลด API calls
3. รอให้ rate limit reset (ทุกวันเวลา 00:00 UTC)
4. หรือ upgrade เป็น Production API

### Problem: Port already in use

**Error:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solutions:**
1. หา process ที่ใช้ port 3001:
   ```bash
   # Windows
   netstat -ano | findstr :3001
   
   # macOS/Linux
   lsof -i :3001
   ```

2. Kill process หรือเปลี่ยน port ใน `.env`:
   ```env
   PORT=3002
   ```

## Next Steps

หลังจาก setup เสร็จแล้ว:

1. **ทดสอบ API endpoints** - ใช้ curl หรือ Postman
2. **Fetch flight data** - รัน `npm run fetch:amadeus` เพื่อดึงข้อมูล
3. **Explore API** - ลองใช้ endpoints ต่างๆ
4. **Read documentation** - ดู [README.md](./README.md) สำหรับรายละเอียดเพิ่มเติม

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [TimescaleDB Documentation](https://docs.timescale.com/)
- [Amadeus API Documentation](https://developers.amadeus.com/)
- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## Getting Help

ถ้ามีปัญหา:

1. ตรวจสอบ [Troubleshooting](#troubleshooting) section
2. ตรวจสอบ logs ใน console
3. ตรวจสอบ database logs
4. เปิด issue ใน repository

---

**Happy Coding! 🚀**

