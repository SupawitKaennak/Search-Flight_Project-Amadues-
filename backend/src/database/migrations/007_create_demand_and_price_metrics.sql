-- Migration 007: Create demand_statistics and price_metrics tables
-- These tables store Amadeus Analytics API data for dynamic season calculation
-- 
-- demand_statistics: Stores booking/travel demand data from Amadeus Air Traffic Analytics
-- price_metrics: Stores price distribution metrics from Amadeus Itinerary Price Metrics

-- Create demand_statistics table
-- Stores demand data from Amadeus travel.analytics.airTraffic.booked/traveled APIs
CREATE TABLE IF NOT EXISTS demand_statistics (
  id SERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  period VARCHAR(7) NOT NULL, -- YYYY-MM format (e.g., '2024-01')
  bookings_count INTEGER DEFAULT 0, -- Number of bookings from booked API
  travelers_count INTEGER DEFAULT 0, -- Number of travelers from booked/traveled API
  flights_count INTEGER DEFAULT 0, -- Number of flights from traveled API
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(route_id, period)
);

-- Create price_metrics table
-- Stores price distribution metrics from Amadeus analytics.itineraryPriceMetrics API
CREATE TABLE IF NOT EXISTS price_metrics (
  id SERIAL PRIMARY KEY,
  route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  departure_date DATE NOT NULL,
  lowest_price DECIMAL(10, 2),
  median_price DECIMAL(10, 2),
  highest_price DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(route_id, departure_date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_demand_stats_route_id ON demand_statistics(route_id);
CREATE INDEX IF NOT EXISTS idx_demand_stats_period ON demand_statistics(period);
CREATE INDEX IF NOT EXISTS idx_demand_stats_route_period ON demand_statistics(route_id, period);
CREATE INDEX IF NOT EXISTS idx_price_metrics_route_id ON price_metrics(route_id);
CREATE INDEX IF NOT EXISTS idx_price_metrics_departure_date ON price_metrics(departure_date);
CREATE INDEX IF NOT EXISTS idx_price_metrics_route_date ON price_metrics(route_id, departure_date);

-- Add comments to tables
COMMENT ON TABLE demand_statistics IS 'Stores demand data from Amadeus Air Traffic Analytics APIs for dynamic season calculation';
COMMENT ON TABLE price_metrics IS 'Stores price distribution metrics from Amadeus Itinerary Price Metrics API';

