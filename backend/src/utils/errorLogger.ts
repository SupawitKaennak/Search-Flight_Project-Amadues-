/**
 * Error Logging Utility
 * Provides consistent error logging across the application
 */

interface ErrorContext {
  [key: string]: any;
}

interface AmadeusErrorDetails {
  status?: number;
  code?: string;
  detail?: string;
  response?: any;
}

/**
 * Log API errors with context
 */
export function logApiError(
  controller: string,
  method: string,
  error: any,
  context?: ErrorContext
): void {
  const timestamp = new Date().toISOString();
  const isDevelopment = process.env.NODE_ENV === 'development';

  console.error('\n' + '='.repeat(80));
  console.error(`[ERROR] [Controller] ${controller}.${method}`);
  console.error(`  Timestamp: ${timestamp}`);
  console.error(`  Request: ${method} /api/${controller.toLowerCase()}`);
  
  if (context) {
    console.error('  Context:', JSON.stringify(context, null, 2));
  }

  console.error(`  Error: ${error.message || 'Unknown error'}`);
  
  if (error.statusCode) {
    console.error(`  Status Code: ${error.statusCode}`);
  }

  if (error.code) {
    console.error(`  Error Code: ${error.code}`);
  }

  if (isDevelopment && error.stack) {
    console.error('  Stack Trace:');
    console.error(error.stack);
  }

  // Log Amadeus-specific errors
  if (error.response?.body?.errors) {
    console.error('  Amadeus API Errors:');
    error.response.body.errors.forEach((err: any, index: number) => {
      console.error(`    [${index + 1}] Code: ${err.code}, Detail: ${err.detail}`);
    });
  }

  console.error('='.repeat(80) + '\n');
}

/**
 * Log service errors with context
 */
export function logServiceError(
  service: string,
  method: string,
  error: any,
  context?: ErrorContext
): void {
  const timestamp = new Date().toISOString();
  const isDevelopment = process.env.NODE_ENV === 'development';

  console.error('\n' + '='.repeat(80));
  console.error(`[ERROR] [Service] ${service}.${method}`);
  console.error(`  Timestamp: ${timestamp}`);

  if (context) {
    console.error('  Context:', JSON.stringify(context, null, 2));
  }

  console.error(`  Error: ${error.message || 'Unknown error'}`);

  if (error.statusCode) {
    console.error(`  Status Code: ${error.statusCode}`);
  }

  if (error.code) {
    console.error(`  Error Code: ${error.code}`);
  }

  if (isDevelopment && error.stack) {
    console.error('  Stack Trace:');
    console.error(error.stack);
  }

  console.error('='.repeat(80) + '\n');
}

/**
 * Log Amadeus API errors specifically
 */
export function logAmadeusError(
  apiName: string,
  error: any,
  requestParams?: ErrorContext
): void {
  const timestamp = new Date().toISOString();
  const isDevelopment = process.env.NODE_ENV === 'development';

  console.error('\n' + '='.repeat(80));
  console.error(`[ERROR] [Amadeus] ${apiName}`);
  console.error(`  Timestamp: ${timestamp}`);

  if (requestParams) {
    console.error('  Request Parameters:', JSON.stringify(requestParams, null, 2));
  }

  if (error.response) {
    const status = error.response.statusCode || error.response.status;
    const body = error.response.body;

    console.error(`  Response Status: ${status}`);

    if (body?.errors && Array.isArray(body.errors)) {
      console.error('  Amadeus API Errors:');
      body.errors.forEach((err: any, index: number) => {
        console.error(`    [${index + 1}] Code: ${err.code || 'N/A'}`);
        console.error(`        Title: ${err.title || 'N/A'}`);
        console.error(`        Detail: ${err.detail || 'N/A'}`);
        if (err.source) {
          console.error(`        Source: ${JSON.stringify(err.source)}`);
        }
      });
    } else if (body) {
      console.error('  Response Body:', JSON.stringify(body, null, 2));
    }
  } else {
    console.error(`  Error: ${error.message || 'Unknown error'}`);
  }

  if (error.code) {
    console.error(`  Error Code: ${error.code}`);
  }

  if (isDevelopment && error.stack) {
    console.error('  Stack Trace:');
    console.error(error.stack);
  }

  console.error('='.repeat(80) + '\n');
}

/**
 * Log database errors
 */
export function logDatabaseError(
  operation: string,
  error: any,
  context?: ErrorContext
): void {
  const timestamp = new Date().toISOString();
  const isDevelopment = process.env.NODE_ENV === 'development';

  console.error('\n' + '='.repeat(80));
  console.error(`[ERROR] [Database] ${operation}`);
  console.error(`  Timestamp: ${timestamp}`);

  if (context) {
    console.error('  Context:', JSON.stringify(context, null, 2));
  }

  console.error(`  Error: ${error.message || 'Unknown error'}`);

  if (error.code) {
    console.error(`  PostgreSQL Error Code: ${error.code}`);
  }

  if (error.query) {
    console.error('  Query:', error.query.substring(0, 200) + '...');
  }

  if (isDevelopment && error.stack) {
    console.error('  Stack Trace:');
    console.error(error.stack);
  }

  console.error('='.repeat(80) + '\n');
}

