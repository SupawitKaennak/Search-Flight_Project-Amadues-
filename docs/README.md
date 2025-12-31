# 📚 Flight Search Project Documentation

ยินดีต้อนรับสู่เอกสารโปรเจค Flight Search System - ระบบค้นหาและวิเคราะห์ราคาตั๋วเครื่องบินภายในประเทศไทย

---

## 📖 เอกสารทั้งหมด

### [01-GETTING-STARTED.md](./01-GETTING-STARTED.md)
**คู่มือเริ่มต้นใช้งานโปรเจค** 🚀

เหมาะสำหรับ: นักพัฒนาที่เข้ามาใหม่หรือต้องการ setup โปรเจคตั้งแต่เริ่มต้น

**เนื้อหา:**
- ✅ Prerequisites (Node.js, PostgreSQL, Git)
- ✅ Initial Setup (Clone, Install dependencies)
- ✅ Database Setup (Create database, Run migrations)
- ✅ Environment Configuration (.env files)
- ✅ Running the Project (Backend + Frontend)
- ✅ Data Import (Weather, Holidays)
- ✅ Mock Data Generation (Flight prices)
- ✅ Development Workflow
- ✅ Troubleshooting (Common issues & solutions)

**เริ่มที่นี่:** [01-GETTING-STARTED.md](./01-GETTING-STARTED.md)

---

### [02-SQL-COMMANDS.md](./02-SQL-COMMANDS.md)
**รวมคำสั่ง SQL ทั้งหมด** 🗄️

เหมาะสำหรับ: นักพัฒนาที่ต้องการตรวจสอบหรือจัดการข้อมูลในฐานข้อมูล

**เนื้อหา:**
- 🔌 Database Connection (psql commands)
- ✅ Data Verification (Check tables, Count records)
- 🗑️ Data Cleanup (Clear flight prices, Reset database)
- 📊 Data Analysis (Price statistics, Route analysis)
- ⚡ Performance Optimization (Indexes, Vacuum)
- 💾 Backup & Restore (pg_dump, pg_restore)

**ตัวอย่างคำสั่งที่ใช้บ่อย:**

```sql
-- Count all flights
SELECT COUNT(*) FROM flight_prices;

-- Clear all flight prices
TRUNCATE TABLE flight_prices;

-- Check date range
SELECT MIN(departure_date), MAX(departure_date) FROM flight_prices;

-- Price by route
SELECT r.origin, r.destination, AVG(fp.price) as avg_price
FROM routes r
JOIN flight_prices fp ON r.id = fp.route_id
GROUP BY r.id, r.origin, r.destination;
```

**ดูเพิ่มเติม:** [02-SQL-COMMANDS.md](./02-SQL-COMMANDS.md)

---

### [03-SYSTEM-DOCUMENTATION.md](./03-SYSTEM-DOCUMENTATION.md)
**เอกสารระบบโดยละเอียด** 📚

เหมาะสำหรับ: นักพัฒนาที่ต้องการเข้าใจสถาปัตยกรรม, สูตรคำนวณ และ API

**เนื้อหา:**
- 🏗️ System Architecture (Tech stack, Architecture diagram)
- 🧮 Calculation Formulas (Price, Season, Distance, Duration)
- 🌐 API Documentation (All endpoints with examples)
- 💾 Data Models (Database schema, Table structures)
- 🔌 External APIs (Amadeus, Open-Meteo, iApp)
- 🎯 Season Calculation System (Multi-factor scoring)

**สูตรสำคัญ:**

#### 1. Mock Data Price
```
price = basePrice × seasonalMultiplier × tripTypeMultiplier × randomVariation
```

#### 2. Season Score (Multi-Factor)
```
seasonScore = (pricePercentile × 0.4) + 
              (demandPercentile × 0.3) + 
              (holidayScore × 0.2) + 
              (weatherScore × 0.1)
```

#### 3. Season Classification
```
seasonScore < p33 → Low Season
p33 ≤ seasonScore < p67 → Normal Season
seasonScore ≥ p67 → High Season
```

**ดูเพิ่มเติม:** [03-SYSTEM-DOCUMENTATION.md](./03-SYSTEM-DOCUMENTATION.md)

---

## 🎯 Quick Start Guide

### สำหรับนักพัฒนาใหม่

1. **อ่านเอกสารตามลำดับ:**
   ```
   01-GETTING-STARTED.md → Setup โปรเจค
   02-SQL-COMMANDS.md → เรียนรู้คำสั่ง SQL
   03-SYSTEM-DOCUMENTATION.md → เข้าใจระบบ
   ```

2. **Setup โปรเจค:**
   ```bash
   # 1. Clone repository
   git clone <repo-url>
   cd Search-Flight_Project
   
   # 2. Install dependencies
   cd backend && npm install
   cd ../frontend && npm install
   
   # 3. Setup database
   psql -U postgres -c "CREATE DATABASE flight_search;"
   cd backend && npm run migrate
   
   # 4. Generate mock data
   npm run generate:mock-flights -- --days-back=90 --days-forward=270
   
   # 5. Run servers
   # Terminal 1: Backend
   cd backend && npm run dev
   
   # Terminal 2: Frontend
   cd frontend && npm run dev
   ```

3. **ทดสอบระบบ:**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001/api/health

---

## 📂 Project Structure

```
Search-Flight_Project/
├── backend/
│   ├── src/
│   │   ├── controllers/      # API endpoint handlers
│   │   ├── services/         # Business logic
│   │   ├── models/           # Database models
│   │   ├── database/         # Migrations
│   │   ├── scripts/          # Utility scripts
│   │   └── server.ts         # Entry point
│   ├── data/                 # CSV files (weather, holidays)
│   └── package.json
├── frontend/
│   ├── app/                  # Next.js app router
│   ├── components/           # React components
│   ├── lib/                  # Utilities
│   └── package.json
└── docs/                     # 📚 You are here!
    ├── README.md             # This file
    ├── 01-GETTING-STARTED.md
    ├── 02-SQL-COMMANDS.md
    └── 03-SYSTEM-DOCUMENTATION.md
```

---

## 🔧 Common Tasks

### Generate Mock Data
```bash
cd backend
npm run generate:mock-flights -- --days-back=90 --days-forward=270
```

### Clear Flight Data
```sql
TRUNCATE TABLE flight_prices;
```

### Import Weather Data
```bash
cd backend
npm run import:weather
```

### Check Database
```sql
-- Connect
psql -U postgres -d flight_search

-- Count records
SELECT COUNT(*) FROM flight_prices;

-- Check date range
SELECT MIN(departure_date), MAX(departure_date) FROM flight_prices;
```

### Restart Backend
```bash
# Kill process on port 3001
$process = Get-NetTCPConnection -LocalPort 3001 | 
           Select-Object -ExpandProperty OwningProcess -First 1
Stop-Process -Id $process -Force

# Start backend
cd backend && npm run dev
```

---

## 🐛 Troubleshooting

### Backend ไม่ start
- **ปัญหา:** Port 3001 ถูกใช้งานอยู่
- **แก้ไข:** ดู [01-GETTING-STARTED.md](./01-GETTING-STARTED.md#troubleshooting)

### Database connection failed
- **ปัญหา:** ไม่สามารถเชื่อมต่อ PostgreSQL
- **แก้ไข:** ตรวจสอบ `.env` และ PostgreSQL service

### ไม่มีข้อมูลเที่ยวบิน
- **ปัญหา:** Search ไม่เจออะไร
- **แก้ไข:** Run `npm run generate:mock-flights`

### Season ไม่แสดงสี
- **ปัญหา:** Timeline แสดงสีเดียว
- **แก้ไข:** ตรวจสอบว่ามีข้อมูลอย่างน้อย 180 วัน

---

## 📊 Key Features

### ✅ Implemented

1. **Flight Search**
   - Search by origin, destination, date
   - Filter by airline, price, duration
   - One-way and round-trip support

2. **Price Analysis**
   - Multi-factor season calculation
   - Price comparison
   - Best time to fly recommendation

3. **Seasonal Breakdown**
   - Visual timeline with 3 colors
   - Low/Normal/High season classification
   - Price range for each season

4. **Amadeus API Integration**
   - With database fallback
   - Works without API key

5. **Mock Data Generator**
   - Realistic price variation
   - Seasonal patterns
   - 130,000+ flight records

### 🚧 Future Enhancements

1. **Caching Layer** (Redis)
2. **Read Replicas** (PostgreSQL)
3. **Background Jobs** (Bull/Agenda)
4. **Real-time Updates** (WebSocket)
5. **User Accounts** (Authentication)
6. **Price Alerts** (Email/Push notifications)

---

## 🤝 Contributing

### Development Workflow

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test
3. Commit: `git commit -m "feat: your feature"`
4. Push: `git push origin feature/your-feature`
5. Create Pull Request

### Coding Standards

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for formatting
- **Conventional Commits** for commit messages

---

## 📞 Support

### Need Help?

1. **Check documentation** in this folder
2. **Review error logs** in terminal/console
3. **Check database** with SQL commands
4. **Consult codebase** comments and types

### Common Resources

- PostgreSQL Docs: https://www.postgresql.org/docs/
- TimescaleDB Docs: https://docs.timescale.com/
- Next.js Docs: https://nextjs.org/docs
- Express.js Docs: https://expressjs.com/
- Amadeus API: https://developers.amadeus.com/

---

## 📝 Version History

### v1.0.0 (2025-12-30)
- ✅ Initial documentation release
- ✅ Complete system implementation
- ✅ Mock data generator with seasonal variation
- ✅ Multi-factor season calculation
- ✅ Amadeus API fallback system
- ✅ Weather and holiday data integration

---

## 📄 License

[Add your license here]

---

## 👥 Team

[Add your team members here]

---

**Last Updated:** 2025-12-30  
**Documentation Version:** 1.0.0  
**Project Version:** 1.0.0

---

<div align="center">

**Happy Coding! ✈️**

Made with ❤️ for Thai travelers

</div>

