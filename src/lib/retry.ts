/**
 * [OPTIMIZATION FILE: Phase 7]
 * 
 * Retry utility with exponential backoff for resilient API calls
 * 
 * Optimizations included:
 * - Exponential Backoff: Retries with increasing delays (1s, 2s, 4s)
 * - Configurable Retries: Max 3 retries by default, customizable
 * - Type-Safe: Generic retry function with proper TypeScript types
 * - Error Classification: Distinguishes between network errors and API errors
 * 
 * Related optimizations:
 * - See: src/api/services/follows.ts, src/api/services/posts.ts for retry integration
 */

export interface RetryOptions {
  maxRetries?: number; // Maximum number of retry attempts (default: 3)
  initialDelay?: number; // Initial delay in milliseconds (default: 1000)
  maxDelay?: number; // Maximum delay in milliseconds (default: 10000)
  backoffMultiplier?: number; // Exponential backoff multiplier (default: 2)
  retryCondition?: (error: any) => boolean; // Custom condition for retrying
  onRetry?: (attempt: number, error: any) => void; // Callback on each retry
}

export interface RetryResult<T> {
  data: T | null;
  error: any | null;
  attempts: number; // Number of attempts made (including final attempt)
}

/**
 * [OPTIMIZATION: Phase 7.1] Retry utility with exponential backoff
 * Why: Handles transient network failures gracefully, improves reliability
 * 
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves with result or rejects after max retries
 * 
 * @example
 * const result = await retry(async () => {
 *   return await fetchData();
 * }, { maxRetries: 3 });
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    retryCondition = defaultRetryCondition,
    onRetry,
  } = options;

  let lastError: any = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error: any) {
      lastError = error;

      // Check if we should retry this error
      if (attempt < maxRetries && retryCondition(error)) {
        // Call retry callback if provided
        if (onRetry) {
          onRetry(attempt + 1, error);
        }

        // Wait before retrying (exponential backoff)
        await sleep(delay);

        // Increase delay for next retry (exponential backoff)
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      } else {
        // Don't retry - either max retries reached or non-retryable error
        throw error;
      }
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * [OPTIMIZATION: Phase 7.1] Retry with result object (never throws)
 * Why: Allows components to handle errors gracefully without try-catch
 * 
 * @param fn - The async function to retry
 * @param options - Retry configuration options
 * @returns Result object with data, error, and attempts count
 * 
 * @example
 * const { data, error, attempts } = await retryWithResult(async () => {
 *   return await fetchData();
 * });
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  let attempts = 0;
  const optionsWithCallback = {
    ...options,
    onRetry: (attempt: number, error: any) => {
      attempts = attempt;
      options.onRetry?.(attempt, error);
    },
  };

  try {
    attempts = 1; // First attempt
    const data = await retry(fn, optionsWithCallback);
    return { data, error: null, attempts };
  } catch (error: any) {
    return { data: null, error, attempts };
  }
}

/**
 * Default condition for determining if an error should be retried
 * Retries network errors and 5xx server errors, but not 4xx client errors
 */
function defaultRetryCondition(error: any): boolean {
  // Network errors (no response)
  if (!error.response && !error.status) {
    return true; // Retry network errors
  }

  // 5xx server errors (retry)
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // 429 Too Many Requests (retry)
  if (error.status === 429) {
    return true;
  }

  // 408 Request Timeout (retry)
  if (error.status === 408) {
    return true;
  }

  // Don't retry client errors (4xx except 408, 429)
  if (error.status >= 400 && error.status < 500) {
    return false;
  }

  // Retry other errors by default (e.g., network failures)
  return true;
}

/**
 * Check if an error is a network error (no response from server)
 */
export function isNetworkError(error: any): boolean {
  return !error.response && !error.status;
}

/**
 * Check if an error is a client error (4xx status codes)
 */
export function isClientError(error: any): boolean {
  return error.status >= 400 && error.status < 500;
}

/**
 * Check if an error is a server error (5xx status codes)
 */
export function isServerError(error: any): boolean {
  return error.status >= 500 && error.status < 600;
}

/**
 * Get user-friendly error message from an error
 */
export function getErrorMessage(error: any): string {
  if (isNetworkError(error)) {
    return "Network error. Please check your connection and try again.";
  }

  if (error.status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }

  if (error.status === 408) {
    return "Request timed out. Please try again.";
  }

  if (isServerError(error)) {
    return "Server error. Please try again later.";
  }

  if (error.message) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

