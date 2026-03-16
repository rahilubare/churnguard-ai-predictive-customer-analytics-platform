import type { ErrorType, AppErrorInfo } from '@shared/types';

/**
 * Custom application error class with structured error information
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly suggestedAction?: string;

  constructor(
    message: string,
    code: string,
    type: ErrorType = 'system',
    statusCode: number = 500,
    options?: {
      details?: Record<string, unknown>;
      recoverable?: boolean;
      suggestedAction?: string;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AppError';
    this.type = type;
    this.code = code;
    this.statusCode = statusCode;
    this.details = options?.details;
    this.recoverable = options?.recoverable ?? false;
    this.suggestedAction = options?.suggestedAction;
  }

  toInfo(): AppErrorInfo {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      details: this.details,
      recoverable: this.recoverable,
      suggestedAction: this.suggestedAction,
    };
  }

  /**
   * Create a user-friendly error message
   */
  toUserMessage(): string {
    let msg = this.message;
    if (this.suggestedAction) {
      msg += ` ${this.suggestedAction}`;
    }
    return msg;
  }
}

/**
 * Error factory methods for common error types
 */
export const ErrorFactory = {
  validation: (message: string, field?: string, code: string = 'VALIDATION_ERROR'): AppError => {
    return new AppError(message, code, 'validation', 400, {
      details: field ? { field } : undefined,
      recoverable: true,
      suggestedAction: 'Please check your input and try again.',
    });
  },

  notFound: (resource: string, id?: string): AppError => {
    return new AppError(
      `${resource}${id ? ` with id '${id}'` : ''} not found`,
      'NOT_FOUND',
      'user',
      404,
      { recoverable: false }
    );
  },

  unauthorized: (message: string = 'Authentication required'): AppError => {
    return new AppError(message, 'UNAUTHORIZED', 'user', 401, {
      recoverable: true,
      suggestedAction: 'Please log in and try again.',
    });
  },

  forbidden: (message: string = 'Access denied'): AppError => {
    return new AppError(message, 'FORBIDDEN', 'user', 403, {
      recoverable: false,
    });
  },

  network: (message: string, cause?: Error): AppError => {
    return new AppError(message, 'NETWORK_ERROR', 'network', 503, {
      recoverable: true,
      suggestedAction: 'Please check your connection and try again.',
      cause,
    });
  },

  model: (message: string, code: string = 'MODEL_ERROR', details?: Record<string, unknown>): AppError => {
    return new AppError(message, code, 'model', 500, {
      details,
      recoverable: false,
      suggestedAction: 'Please try training a new model.',
    });
  },

  dataProcessing: (message: string, details?: Record<string, unknown>): AppError => {
    return new AppError(message, 'DATA_PROCESSING_ERROR', 'system', 422, {
      details,
      recoverable: true,
      suggestedAction: 'Please check your data format and try again.',
    });
  },

  rateLimited: (retryAfter?: number): AppError => {
    return new AppError(
      'Too many requests. Please slow down.',
      'RATE_LIMITED',
      'user',
      429,
      {
        recoverable: true,
        details: retryAfter ? { retryAfter } : undefined,
        suggestedAction: `Please wait ${retryAfter ? `${retryAfter} seconds` : 'a moment'} before trying again.`,
      }
    );
  },
};

/**
 * Execute a function with automatic retry on failure
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoffMultiplier = 2,
    maxDelayMs = 30000,
    shouldRetry = (error: Error) => {
      // Retry on network errors or 5xx server errors
      if (error instanceof AppError) {
        return error.type === 'network' || error.statusCode >= 500;
      }
      return true;
    },
  } = options;

  let lastError: Error | undefined;
  let currentDelay = delayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      // Wait before retrying
      await sleep(currentDelay);
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Log an error with structured context
 */
export function logError(
  error: Error | AppError,
  context: Record<string, unknown> = {}
): void {
  const timestamp = new Date().toISOString();
  const errorInfo: Record<string, unknown> = {
    timestamp,
    message: error.message,
    stack: error.stack,
    ...context,
  };

  if (error instanceof AppError) {
    errorInfo.type = error.type;
    errorInfo.code = error.code;
    errorInfo.statusCode = error.statusCode;
    errorInfo.recoverable = error.recoverable;
    if (error.details) {
      errorInfo.details = error.details;
    }
  }

  console.error('[ERROR]', JSON.stringify(errorInfo, null, 2));
}

/**
 * Convert unknown error to AppError
 */
export function toAppError(error: unknown, defaultMessage: string = 'An unexpected error occurred'): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error types
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return ErrorFactory.network(error.message, error);
    }
    
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return ErrorFactory.unauthorized(error.message);
    }
    
    if (message.includes('forbidden') || message.includes('permission')) {
      return ErrorFactory.forbidden(error.message);
    }

    return new AppError(error.message, 'UNKNOWN_ERROR', 'system', 500, {
      cause: error,
      recoverable: false,
    });
  }

  return new AppError(defaultMessage, 'UNKNOWN_ERROR', 'system', 500, {
    details: { originalError: String(error) },
    recoverable: false,
  });
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    onError?: (error: AppError) => void;
    defaultErrorMessage?: string;
  } = {}
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = toAppError(error, options.defaultErrorMessage);
      if (options.onError) {
        options.onError(appError);
      } else {
        logError(appError);
      }
      throw appError;
    }
  };
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = AppError> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Wrap an async function to return a Result type
 */
export async function tryAsync<T>(
  fn: () => Promise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toAppError(error) };
  }
}

/**
 * Check if an error is a specific AppError type
 */
export function isErrorType(error: unknown, type: ErrorType): error is AppError {
  return error instanceof AppError && error.type === type;
}

/**
 * Check if an error has a specific error code
 */
export function isErrorCode(error: unknown, code: string): error is AppError {
  return error instanceof AppError && error.code === code;
}
