-- Migration 008: Create weather_statistics and holiday_statistics tables
-- These tables store weather and holiday data for dynamic season calculation
-- 
-- weather_statistics: Stores weather data from Open-Meteo Historical API
-- holiday_statistics: Stores holiday data from iApp API

-- Create weather_statistics table
-- Stores weather data from Open-Meteo Historical API for season calculation
CREATE TABLE IF NOT EXISTS weather_statistics (
  id SERIAL PRIMARY KEY,
  province VARCHAR(100) NOT NULL,
  period VARCHAR(7) NOT NULL, -- YYYY-MM format (e.g., '2024-01')
  avg_temperature DECIMAL(5, 2),
  avg_rainfall DECIMAL(8, 2),
  avg_humidity DECIMAL(5, 2),
  weather_score INTEGER, -- 0-100 score for weather conditions
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(province, period)
);

-- Create holiday_statistics table
-- Stores holiday data from iApp API for season calculation
CREATE TABLE IF NOT EXISTS holiday_statistics (
  id SERIAL PRIMARY KEY,
  period VARCHAR(7) NOT NULL, -- YYYY-MM format (e.g., '2024-01')
  holidays_count INTEGER DEFAULT 0,
  long_weekends_count INTEGER DEFAULT 0,
  holiday_score INTEGER, -- 0-100 score for holiday boost
  holidays_detail JSONB, -- Store holiday details as JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(period)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_weather_stats_province ON weather_statistics(province);
CREATE INDEX IF NOT EXISTS idx_weather_stats_period ON weather_statistics(period);
CREATE INDEX IF NOT EXISTS idx_weather_stats_province_period ON weather_statistics(province, period);
CREATE INDEX IF NOT EXISTS idx_holiday_stats_period ON holiday_statistics(period);

-- Add comments to tables
COMMENT ON TABLE weather_statistics IS 'Stores weather data from Open-Meteo Historical API for dynamic season calculation';
COMMENT ON TABLE holiday_statistics IS 'Stores holiday data from iApp API for dynamic season calculation';

