/**
 * Centralized error handling system for Crystal Chat
 * Provides structured error handling with severity levels
 */

export const ErrorSeverity = {
  SILENT: 'silent',      // Expected failures (browser API unavailable, optional features)
  LOGGED: 'logged',      // Unexpected but recoverable (DOM failures, event issues)
  USER_FACING: 'user_facing',  // Critical operations (DB failures, model installation)
  FATAL: 'fatal'         // App-breaking failures (core initialization)
};

/**
 * Handle an error with context and severity level
 * @param {Error} error - The error to handle
 * @param {Object} options - Configuration options
 * @param {string} options.severity - One of ErrorSeverity values
 * @param {string} options.context - Human-readable context about what was being attempted
 * @param {HTMLElement} options.errorEl - DOM element for displaying user-facing errors
 * @param {Function} options.showErrorFn - Function to show error UI
 * @param {Function} options.onRetry - Optional callback for retry functionality
 */
export function handleError(error, options = {}) {
  const {
    severity = ErrorSeverity.LOGGED,
    context = '',
    errorEl = null,
    showErrorFn = null,
    onRetry = null
  } = options;

  const errorMsg = error?.message || String(error) || 'Unknown error';
  const errorStack = error?.stack || '';
  const contextStr = context ? ` [${context}]` : '';

  switch (severity) {
    case ErrorSeverity.SILENT:
      // Silent failures - log at debug level, continue without fanfare
      try {
        console.debug(`[SILENT ERROR]${contextStr}: ${errorMsg}`);
      } catch {
        // Prevent console.debug from breaking anything
      }
      break;

    case ErrorSeverity.LOGGED:
      // Logged failures - warn in console with context
      try {
        console.warn(`[RECOVERABLE ERROR]${contextStr}: ${errorMsg}`);
        if (errorStack) {
          console.debug(`Stack trace: ${errorStack}`);
        }
      } catch {
        // Prevent console logging from breaking anything
      }
      break;

    case ErrorSeverity.USER_FACING:
      // User-facing errors - show in UI and log
      try {
        console.error(`[USER-FACING ERROR]${contextStr}: ${errorMsg}`);
        if (errorStack) {
          console.error(`Stack trace: ${errorStack}`);
        }
      } catch {
        // Prevent console logging from breaking anything
      }

      // Show error in UI if possible
      if (showErrorFn && errorEl) {
        try {
          showErrorFn(errorEl, errorMsg);
        } catch {
          // Prevent UI update from breaking anything
        }
      }
      break;

    case ErrorSeverity.FATAL:
      // Fatal errors - log and potentially halt app
      try {
        console.error(`[FATAL ERROR]${contextStr}: ${errorMsg}`);
        console.error(`Stack trace: ${errorStack}`);
      } catch {
        // Prevent console logging from breaking anything
      }

      // For fatal errors, show in UI if possible
      if (showErrorFn && errorEl) {
        try {
          showErrorFn(
            errorEl,
            `Fatal error: ${errorMsg}. Please restart the application.`
          );
        } catch {
          // Prevent UI update from breaking anything
        }
      }
      break;

    default:
      // Unknown severity - treat as logged
      try {
        console.warn(`[UNKNOWN SEVERITY]${contextStr}: ${errorMsg}`);
      } catch {
        // Prevent console logging from breaking anything
      }
  }
}

/**
 * Wrap a function to silently catch errors (expected failures)
 * Used for browser API checks, optional features, etc.
 * @param {Function} fn - Function to wrap
 * @param {string} context - Context description for debugging
 * @returns {*} Result of function or undefined if error occurs
 */
export function wrapSilent(fn, context = '') {
  try {
    return fn();
  } catch (error) {
    handleError(error, {
      severity: ErrorSeverity.SILENT,
      context: context || 'wrapped silent operation'
    });
    return undefined;
  }
}

/**
 * Wrap an async function to silently catch errors
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context description for debugging
 * @returns {Promise<*>} Result of function or undefined if error occurs
 */
export async function wrapSilentAsync(fn, context = '') {
  try {
    return await fn();
  } catch (error) {
    handleError(error, {
      severity: ErrorSeverity.SILENT,
      context: context || 'wrapped silent async operation'
    });
    return undefined;
  }
}

/**
 * Wrap a function to log and continue on error (unexpected but recoverable)
 * Used for DOM manipulations, event listeners, etc.
 * @param {Function} fn - Function to wrap
 * @param {string} context - Context description for debugging
 * @returns {*} Result of function or undefined if error occurs
 */
export function wrapLogged(fn, context = '') {
  try {
    return fn();
  } catch (error) {
    handleError(error, {
      severity: ErrorSeverity.LOGGED,
      context: context || 'wrapped logged operation'
    });
    return undefined;
  }
}

/**
 * Wrap an async function to log and continue on error
 * @param {Function} fn - Async function to wrap
 * @param {string} context - Context description for debugging
 * @returns {Promise<*>} Result of function or undefined if error occurs
 */
export async function wrapLoggedAsync(fn, context = '') {
  try {
    return await fn();
  } catch (error) {
    handleError(error, {
      severity: ErrorSeverity.LOGGED,
      context: context || 'wrapped logged async operation'
    });
    return undefined;
  }
}

/**
 * Create a safe callback that catches errors without crashing
 * Useful for event handlers that should fail silently
 * @param {Function} fn - Function to wrap
 * @param {string} severity - Error severity level
 * @param {string} context - Context description for debugging
 * @returns {Function} Wrapped function
 */
export function createSafeCallback(fn, severity = ErrorSeverity.LOGGED, context = '') {
  return function safeFn(...args) {
    try {
      return fn(...args);
    } catch (error) {
      handleError(error, {
        severity,
        context: context || `callback execution`
      });
    }
  };
}

/**
 * Create a safe async callback that catches errors without crashing
 * @param {Function} fn - Async function to wrap
 * @param {string} severity - Error severity level
 * @param {string} context - Context description for debugging
 * @returns {Function} Wrapped async function
 */
export function createSafeAsyncCallback(fn, severity = ErrorSeverity.LOGGED, context = '') {
  return async function safeFn(...args) {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, {
        severity,
        context: context || `async callback execution`
      });
    }
  };
}
