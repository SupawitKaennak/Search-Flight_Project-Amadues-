// @ts-ignore - No type definitions available for amadeus
import Amadeus from 'amadeus';

/**
 * Base Amadeus Service
 * Provides initialization and common utilities for Amadeus API
 */
export class AmadeusService {
  protected amadeus: Amadeus;

  constructor() {
    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    const environment = process.env.AMADEUS_ENVIRONMENT || 'test';

    if (!clientId || !clientSecret) {
      throw new Error('AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET must be set in environment variables');
    }

    this.amadeus = new Amadeus({
      clientId,
      clientSecret,
      hostname: environment === 'production' ? 'production' : 'test',
    });
  }

  /**
   * Handle Amadeus API errors
   * Always throws Error instances to avoid "promise was rejected with a non-error" warnings
   * Handles Amadeus SDK ClientError objects which are not Error instances
   */
  protected handleError(error: any): never {
    // If error is already an Error instance, preserve it but add statusCode if available
    if (error instanceof Error) {
      if ((error as any).response) {
        const statusCode = (error as any).response.statusCode || 500;
        const code = (error as any).response.body?.errors?.[0]?.code || 'AMADEUS_API_ERROR';
        (error as any).statusCode = statusCode;
        (error as any).code = code;
      }
      throw error;
    }

    // Handle Amadeus SDK ClientError objects (they have response and description properties)
    // ClientError objects are not Error instances, so we need to wrap them
    if (error.response || error.description) {
      let statusCode = 500;
      let message = 'Amadeus API error';
      let errorCode = 'AMADEUS_API_ERROR';

      // Try to get error details from response.body.errors (standard Amadeus error format)
      if (error.response?.body?.errors && Array.isArray(error.response.body.errors) && error.response.body.errors.length > 0) {
        const errorDetail = error.response.body.errors[0];
        statusCode = error.response.statusCode || errorDetail.status || 500;
        message = errorDetail.detail || errorDetail.title || message;
        errorCode = errorDetail.code || errorCode;
      }
      // Try to get error details from description array (ClientError format)
      else if (error.description && Array.isArray(error.description) && error.description.length > 0) {
        const errorDetail = error.description[0];
        statusCode = error.response?.statusCode || errorDetail.status || 500;
        message = errorDetail.detail || errorDetail.title || message;
        errorCode = errorDetail.code || errorCode;
      }
      // Fallback to response statusCode if available
      else if (error.response?.statusCode) {
        statusCode = error.response.statusCode;
        message = error.message || `Amadeus API error (${statusCode})`;
      }

      const apiError: any = new Error(message);
      apiError.statusCode = statusCode;
      apiError.code = errorCode;
      
      // Preserve original error structure for debugging
      if (error.response) {
        apiError.originalResponse = error.response;
      }
      if (error.description) {
        apiError.originalDescription = error.description;
      }
      
      throw apiError;
    }
    
    // For any other error, wrap it in an Error instance
    if (typeof error === 'string') {
      throw new Error(error);
    }
    
    // For objects, try to extract a message or stringify
    const message = error?.message || error?.detail || JSON.stringify(error) || 'Unknown error';
    const wrappedError: any = new Error(message);
    if (error?.statusCode) {
      wrappedError.statusCode = error.statusCode;
    }
    if (error?.code) {
      wrappedError.code = error.code;
    }
    throw wrappedError;
  }

  /**
   * Rate limiting: Wait between requests
   * Default delay increased to 500ms to prevent 429 errors
   */
  protected async rateLimit(delayMs: number = 500): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Execute API call with retry logic and exponential backoff for rate limit errors
   * @param apiCall - Function that returns a Promise
   * @param maxRetries - Maximum number of retries (default: 3)
   * @param initialDelay - Initial delay in ms before retry (default: 1000)
   * @returns Result of API call
   */
  protected async executeWithRetry<T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Add delay before API call (except first attempt)
        if (attempt > 0) {
          const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`[AmadeusService] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
          await this.rateLimit(delay);
        } else {
          // Small delay before first call to prevent burst requests
          await this.rateLimit(500);
        }
        
        return await apiCall();
      } catch (error: any) {
        // Ensure error is an Error instance before storing
        let errorInstance: Error;
        if (error instanceof Error) {
          errorInstance = error;
        } else {
          // Wrap non-Error objects using wrapError
          errorInstance = this.wrapError(error);
        }
        lastError = errorInstance;
        
        // Check if it's a rate limit error (429)
        const statusCode = (errorInstance as any).response?.statusCode || (errorInstance as any).statusCode;
        const isRateLimit = statusCode === 429;
        
        if (isRateLimit && attempt < maxRetries) {
          // Calculate exponential backoff delay
          const delay = initialDelay * Math.pow(2, attempt);
          console.warn(`[AmadeusService] Rate limit error (429), retrying after ${delay}ms...`);
          await this.rateLimit(delay);
          continue;
        }
        
        // If not rate limit error or max retries reached, throw the error (already wrapped)
        throw errorInstance;
      }
    }
    
    // Should never reach here, but TypeScript needs it
    // Ensure lastError is an Error instance before throwing
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw this.wrapError(lastError);
  }

  /**
   * Wrap non-Error objects into Error instances
   * Helper method to ensure all errors are Error instances
   */
  private wrapError(error: any): Error {
    if (error instanceof Error) {
      return error;
    }
    
    // Try to extract message from various error formats
    let message = 'Unknown error';
    if (typeof error === 'string') {
      message = error;
    } else if (error?.message) {
      message = error.message;
    } else if (error?.detail) {
      message = error.detail;
    } else if (error?.response?.body?.errors?.[0]?.detail) {
      message = error.response.body.errors[0].detail;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    }
    
    const wrappedError: any = new Error(message);
    
    // Preserve statusCode and code if available
    if (error?.statusCode) {
      wrappedError.statusCode = error.statusCode;
    } else if (error?.response?.statusCode) {
      wrappedError.statusCode = error.response.statusCode;
    }
    
    if (error?.code) {
      wrappedError.code = error.code;
    } else if (error?.response?.body?.errors?.[0]?.code) {
      wrappedError.code = error.response.body.errors[0].code;
    }
    
    // Preserve original error for debugging
    wrappedError.originalError = error;
    
    return wrappedError;
  }

  /**
   * Parse duration string (PT2H30M) to minutes
   */
  protected parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    return hours * 60 + minutes;
  }
}

