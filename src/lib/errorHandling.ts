/**
 * [OPTIMIZATION FILE: Phase 7]
 * 
 * User-friendly error handling utilities
 * 
 * Optimizations included:
 * - Centralized error message formatting
 * - Toast notifications for non-critical errors
 * - Integration with retry utility for error classification
 * 
 * Related optimizations:
 * - See: src/lib/retry.ts for getErrorMessage function
 * - See: Components for toast.error usage
 */

import toast from "react-hot-toast";
import { getErrorMessage as getErrorMessageFromRetry } from "./retry";

// Re-export getErrorMessage for convenience
export const getErrorMessage = getErrorMessageFromRetry;

/**
 * [OPTIMIZATION: Phase 7.1.3] Show user-friendly error toast
 * Why: Replaces console.error with user-visible messages
 * 
 * @param error - The error object
 * @param defaultMessage - Optional default message if error is empty
 */
export function showErrorToast(error: any, defaultMessage = "Something went wrong. Please try again.") {
  const message = error ? getErrorMessage(error) : defaultMessage;
  toast.error(message);
}

/**
 * [OPTIMIZATION: Phase 7.1.3] Show user-friendly error toast for critical errors
 * Why: More prominent error messages for critical failures
 * 
 * @param error - The error object
 * @param context - Context about where the error occurred (e.g., "loading feed")
 */
export function showCriticalError(error: any, context?: string) {
  const message = error ? getErrorMessage(error) : "Something went wrong. Please try again.";
  const fullMessage = context ? `${context}: ${message}` : message;
  toast.error(fullMessage, {
    duration: 5000, // Longer duration for critical errors
  });
}

/**
 * [OPTIMIZATION: Phase 7.1.3] Log error for debugging while showing user-friendly message
 * Why: Developers still see errors in console, but users see friendly messages
 * 
 * @param error - The error object
 * @param context - Context about where the error occurred
 * @param showToast - Whether to show a toast notification (default: true)
 */
export function handleError(error: any, context?: string, showToast = true) {
  // Log for debugging
  console.error(context ? `[${context}] Error:` : "Error:", error);
  
  // Show user-friendly message
  if (showToast) {
    if (context) {
      showCriticalError(error, context);
    } else {
      showErrorToast(error);
    }
  }
}

