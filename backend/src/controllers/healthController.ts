import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AmadeusService } from '../services/amadeusService';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      message?: string;
      responseTime?: number;
    };
    amadeus: {
      status: 'healthy' | 'unhealthy';
      message?: string;
      responseTime?: number;
    };
    environment: {
      status: 'healthy' | 'unhealthy';
      missingVars?: string[];
    };
  };
}

interface EndpointStatus {
  path: string;
  method: string;
  status: 'working' | 'error' | 'not_tested';
  responseTime?: number;
  error?: string;
}

/**
 * Check database connectivity
 */
export async function checkDatabase(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as version');
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'healthy',
      responseTime: `${responseTime}ms`,
      database: {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1],
      },
    });
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    res.status(503).json({
      status: 'unhealthy',
      responseTime: `${responseTime}ms`,
      error: error.message || 'Database connection failed',
    });
  }
}

/**
 * Check Amadeus API connectivity
 */
export async function checkAmadeus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();
  try {
    // Check if credentials are set
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(503).json({
        status: 'unhealthy',
        error: 'Amadeus credentials not configured',
        missingVars: [
          !clientId ? 'AMADEUS_CLIENT_ID' : null,
          !clientSecret ? 'AMADEUS_CLIENT_SECRET' : null,
        ].filter(Boolean),
      });
      return;
    }

    // Try to initialize Amadeus service (this will validate credentials)
    const amadeusService = new AmadeusService();
    
    // Try a simple API call to verify connectivity
    // Using airport search as it's lightweight
    try {
      // Access the protected amadeus property through a type assertion
      const amadeus = (amadeusService as any).amadeus;
      await amadeus.referenceData.locations.get({
        keyword: 'BKK',
        subType: 'AIRPORT',
      });
      
      const responseTime = Date.now() - startTime;
      res.json({
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        environment: process.env.AMADEUS_ENVIRONMENT || 'test',
      });
    } catch (apiError: any) {
      const responseTime = Date.now() - startTime;
      res.status(503).json({
        status: 'unhealthy',
        responseTime: `${responseTime}ms`,
        error: apiError.response?.body?.errors?.[0]?.detail || apiError.message || 'Amadeus API call failed',
        code: apiError.response?.body?.errors?.[0]?.code,
      });
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    res.status(503).json({
      status: 'unhealthy',
      responseTime: `${responseTime}ms`,
      error: error.message || 'Amadeus service initialization failed',
    });
  }
}

/**
 * Check environment variables
 */
export async function checkEnvironment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const requiredVars = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'AMADEUS_CLIENT_ID',
    'AMADEUS_CLIENT_SECRET',
  ];

  const optionalVars = [
    'AMADEUS_ENVIRONMENT',
    'ENABLE_TIMESCALEDB',
    'ENABLE_SCHEDULED_JOBS',
    'NODE_ENV',
  ];

  const missing: string[] = [];
  const present: string[] = [];
  const optional: Record<string, string | undefined> = {};

  requiredVars.forEach((varName) => {
    if (process.env[varName]) {
      present.push(varName);
    } else {
      missing.push(varName);
    }
  });

  optionalVars.forEach((varName) => {
    optional[varName] = process.env[varName] || 'not set';
  });

  if (missing.length > 0) {
    res.status(503).json({
      status: 'unhealthy',
      missing: missing,
      present: present,
      optional: optional,
    });
  } else {
    res.json({
      status: 'healthy',
      required: present,
      optional: optional,
    });
  }
}

/**
 * Get comprehensive health status
 */
export async function getDetailedHealth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unhealthy' },
      amadeus: { status: 'unhealthy' },
      environment: { status: 'unhealthy' },
    },
  };

  // Check database
  const dbStartTime = Date.now();
  try {
    await pool.query('SELECT 1');
    healthStatus.checks.database = {
      status: 'healthy',
      responseTime: Date.now() - dbStartTime,
    };
  } catch (error: any) {
    healthStatus.checks.database = {
      status: 'unhealthy',
      message: error.message || 'Database connection failed',
      responseTime: Date.now() - dbStartTime,
    };
    healthStatus.status = 'unhealthy';
  }

  // Check Amadeus
  const amadeusStartTime = Date.now();
  try {
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      healthStatus.checks.amadeus = {
        status: 'unhealthy',
        message: 'Amadeus credentials not configured',
      };
      healthStatus.status = 'unhealthy';
    } else {
      const amadeusService = new AmadeusService();
      const amadeus = (amadeusService as any).amadeus;
      await amadeus.referenceData.locations.get({
        keyword: 'BKK',
        subType: 'AIRPORT',
      });
      
      healthStatus.checks.amadeus = {
        status: 'healthy',
        responseTime: Date.now() - amadeusStartTime,
      };
    }
  } catch (error: any) {
    healthStatus.checks.amadeus = {
      status: 'unhealthy',
      message: error.response?.body?.errors?.[0]?.detail || error.message || 'Amadeus API call failed',
      responseTime: Date.now() - amadeusStartTime,
    };
    if (healthStatus.status === 'healthy') {
      healthStatus.status = 'degraded';
    }
  }

  // Check environment
  const requiredVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'AMADEUS_CLIENT_ID', 'AMADEUS_CLIENT_SECRET'];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    healthStatus.checks.environment = {
      status: 'unhealthy',
      missingVars,
    };
    healthStatus.status = 'unhealthy';
  } else {
    healthStatus.checks.environment = {
      status: 'healthy',
    };
  }

  const statusCode = healthStatus.status === 'healthy' ? 200 : healthStatus.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(healthStatus);
}

/**
 * Get all endpoints status (basic check - just verifies routes exist)
 */
export async function getEndpointsStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const endpoints: EndpointStatus[] = [
    // Flights
    { path: '/api/flights/analyze', method: 'POST', status: 'not_tested' },
    { path: '/api/flights/prices', method: 'POST', status: 'not_tested' },
    { path: '/api/flights/airlines', method: 'GET', status: 'not_tested' },
    { path: '/api/flights/airport-code', method: 'GET', status: 'not_tested' },
    { path: '/api/flights/predict-price', method: 'POST', status: 'not_tested' },
    { path: '/api/flights/price-trend', method: 'POST', status: 'not_tested' },
    { path: '/api/flights/predict-price-range', method: 'POST', status: 'not_tested' },
    { path: '/api/flights/cheapest-dates', method: 'POST', status: 'not_tested' },
    { path: '/api/flights/price-analysis', method: 'POST', status: 'not_tested' },
    
    // Airports
    { path: '/api/airports/search', method: 'GET', status: 'not_tested' },
    { path: '/api/airports/:code', method: 'GET', status: 'not_tested' },
    
    // Airlines
    { path: '/api/airlines', method: 'GET', status: 'not_tested' },
    { path: '/api/airlines/:code', method: 'GET', status: 'not_tested' },
    
    // Destinations
    { path: '/api/destinations/most-booked', method: 'GET', status: 'not_tested' },
    { path: '/api/destinations/most-traveled', method: 'GET', status: 'not_tested' },
    { path: '/api/destinations/inspiration', method: 'GET', status: 'not_tested' },
    
    // Statistics
    { path: '/api/statistics/search', method: 'POST', status: 'not_tested' },
    { path: '/api/statistics/price', method: 'POST', status: 'not_tested' },
    { path: '/api/statistics', method: 'GET', status: 'not_tested' },
    { path: '/api/statistics/price', method: 'GET', status: 'not_tested' },
    
    // Health
    { path: '/api/health', method: 'GET', status: 'not_tested' },
    { path: '/api/health/detailed', method: 'GET', status: 'not_tested' },
    { path: '/api/health/database', method: 'GET', status: 'not_tested' },
    { path: '/api/health/amadeus', method: 'GET', status: 'not_tested' },
    { path: '/api/health/environment', method: 'GET', status: 'not_tested' },
    { path: '/api/health/endpoints', method: 'GET', status: 'not_tested' },
  ];

  res.json({
    total: endpoints.length,
    endpoints,
    note: 'This endpoint shows available routes. Use /api/health/detailed for actual connectivity checks.',
  });
}

