import type { ValidationResult, ValidationError, ValidationWarning, Dataset } from '@shared/types';
import { AppError, ErrorFactory } from './error-handler';

/**
 * Validation schema definition
 */
export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: (string | number)[];
  custom?: (value: unknown) => boolean | string;
  sanitize?: (value: unknown) => unknown;
}

/**
 * Validate an object against a schema
 */
export function validateSchema<T extends Record<string, unknown>>(
  data: unknown,
  schema: ValidationSchema,
  options: { strict?: boolean } = {}
): ValidationResult & { data?: T } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (typeof data !== 'object' || data === null) {
    errors.push({
      code: 'INVALID_TYPE',
      message: 'Input must be an object',
    });
    return { isValid: false, errors, warnings };
  }

  const obj = data as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [field, rule] of Object.entries(schema)) {
    const value = obj[field];
    const fieldErrors = validateField(field, value, rule, options.strict);
    
    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors);
    } else if (value !== undefined) {
      // Apply sanitization if provided
      result[field] = rule.sanitize ? rule.sanitize(value) : value;
    } else if (rule.required) {
      errors.push({
        code: 'REQUIRED',
        message: `Field '${field}' is required`,
        field,
      });
    }
  }

  // Check for extra fields in strict mode
  if (options.strict) {
    for (const field of Object.keys(obj)) {
      if (!(field in schema)) {
        warnings.push({
          code: 'UNKNOWN_FIELD',
          message: `Unknown field '${field}' will be ignored`,
          field,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: result as T,
  };
}

/**
 * Validate a single field
 */
function validateField(
  field: string,
  value: unknown,
  rule: ValidationRule,
  strict?: boolean
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required
  if (value === undefined || value === null || value === '') {
    if (rule.required) {
      errors.push({
        code: 'REQUIRED',
        message: `Field '${field}' is required`,
        field,
      });
    }
    return errors;
  }

  // Type validation
  const typeError = validateType(field, value, rule.type);
  if (typeError) {
    errors.push(typeError);
    return errors; // Don't continue if type is wrong
  }

  // Type-specific validations
  switch (rule.type) {
    case 'string':
      errors.push(...validateString(field, value as string, rule));
      break;
    case 'number':
      errors.push(...validateNumber(field, value as number, rule));
      break;
    case 'array':
      errors.push(...validateArray(field, value as unknown[], rule));
      break;
  }

  // Enum validation
  if (rule.enum && !rule.enum.includes(value as string | number)) {
    errors.push({
      code: 'INVALID_ENUM',
      message: `Field '${field}' must be one of: ${rule.enum.join(', ')}`,
      field,
    });
  }

  // Pattern validation
  if (rule.pattern && typeof value === 'string') {
    if (!rule.pattern.test(value)) {
      errors.push({
        code: 'PATTERN_MISMATCH',
        message: `Field '${field}' does not match required pattern`,
        field,
      });
    }
  }

  // Custom validation
  if (rule.custom) {
    const customResult = rule.custom(value);
    if (customResult !== true) {
      errors.push({
        code: 'CUSTOM_VALIDATION_FAILED',
        message: typeof customResult === 'string' ? customResult : `Field '${field}' failed custom validation`,
        field,
      });
    }
  }

  return errors;
}

function validateType(field: string, value: unknown, type: string): ValidationError | null {
  const actualType = Array.isArray(value) ? 'array' : typeof value;
  
  if (type === 'date') {
    if (isNaN(Date.parse(String(value)))) {
      return {
        code: 'INVALID_TYPE',
        message: `Field '${field}' must be a valid date`,
        field,
      };
    }
    return null;
  }

  if (actualType !== type) {
    return {
      code: 'INVALID_TYPE',
      message: `Field '${field}' must be of type ${type}, got ${actualType}`,
      field,
    };
  }
  return null;
}

function validateString(field: string, value: string, rule: ValidationRule): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rule.minLength !== undefined && value.length < rule.minLength) {
    errors.push({
      code: 'MIN_LENGTH',
      message: `Field '${field}' must be at least ${rule.minLength} characters`,
      field,
    });
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    errors.push({
      code: 'MAX_LENGTH',
      message: `Field '${field}' must be at most ${rule.maxLength} characters`,
      field,
    });
  }

  return errors;
}

function validateNumber(field: string, value: number, rule: ValidationRule): ValidationError[] {
  const errors: ValidationError[] = [];

  if (isNaN(value)) {
    errors.push({
      code: 'INVALID_NUMBER',
      message: `Field '${field}' must be a valid number`,
      field,
    });
    return errors;
  }

  if (rule.min !== undefined && value < rule.min) {
    errors.push({
      code: 'MIN_VALUE',
      message: `Field '${field}' must be at least ${rule.min}`,
      field,
    });
  }

  if (rule.max !== undefined && value > rule.max) {
    errors.push({
      code: 'MAX_VALUE',
      message: `Field '${field}' must be at most ${rule.max}`,
      field,
    });
  }

  return errors;
}

function validateArray(field: string, value: unknown[], rule: ValidationRule): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rule.minLength !== undefined && value.length < rule.minLength) {
    errors.push({
      code: 'MIN_LENGTH',
      message: `Field '${field}' must have at least ${rule.minLength} items`,
      field,
    });
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    errors.push({
      code: 'MAX_LENGTH',
      message: `Field '${field}' must have at most ${rule.maxLength} items`,
      field,
    });
  }

  return errors;
}

/**
 * Sanitize a string value
 */
export function sanitizeString(value: unknown, options: {
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  stripHtml?: boolean;
  escapeSql?: boolean;
} = {}): string {
  if (typeof value !== 'string') {
    return String(value ?? '');
  }

  let result = value;

  if (options.trim !== false) {
    result = result.trim();
  }

  if (options.lowercase) {
    result = result.toLowerCase();
  }

  if (options.uppercase) {
    result = result.toUpperCase();
  }

  if (options.stripHtml) {
    result = result.replace(/<[^>]*>/g, '');
  }

  if (options.escapeSql) {
    result = result.replace(/'/g, "''");
  }

  return result;
}

/**
 * Coerce and validate a number
 */
export function coerceNumber(value: unknown, options: {
  min?: number;
  max?: number;
  default?: number;
  integer?: boolean;
} = {}): number | null {
  if (value === null || value === undefined || value === '') {
    return options.default ?? null;
  }

  const num = Number(value);
  
  if (isNaN(num)) {
    return options.default ?? null;
  }

  let result = num;

  if (options.integer) {
    result = Math.floor(result);
  }

  if (options.min !== undefined && result < options.min) {
    result = options.min;
  }

  if (options.max !== undefined && result > options.max) {
    result = options.max;
  }

  return result;
}

/**
 * Validate dataset structure
 */
export function validateDataset(dataset: unknown): ValidationResult & { data?: Dataset } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (typeof dataset !== 'object' || dataset === null) {
    errors.push({
      code: 'INVALID_TYPE',
      message: 'Dataset must be an object',
    });
    return { isValid: false, errors, warnings };
  }

  const obj = dataset as Record<string, unknown>;

  // Check headers
  if (!Array.isArray(obj.headers)) {
    errors.push({
      code: 'MISSING_HEADERS',
      message: 'Dataset must have a headers array',
    });
  } else {
    if (obj.headers.length === 0) {
      errors.push({
        code: 'EMPTY_HEADERS',
        message: 'Dataset headers cannot be empty',
      });
    }
    if (!obj.headers.every(h => typeof h === 'string')) {
      errors.push({
        code: 'INVALID_HEADER_TYPE',
        message: 'All headers must be strings',
      });
    }
    const uniqueHeaders = new Set(obj.headers);
    if (uniqueHeaders.size !== obj.headers.length) {
      warnings.push({
        code: 'DUPLICATE_HEADERS',
        message: 'Dataset contains duplicate header names',
      });
    }
  }

  // Check rows
  if (!Array.isArray(obj.rows)) {
    errors.push({
      code: 'MISSING_ROWS',
      message: 'Dataset must have a rows array',
    });
  } else {
    if (obj.rows.length === 0) {
      warnings.push({
        code: 'EMPTY_DATASET',
        message: 'Dataset has no rows',
      });
    }

    // Validate each row has the expected structure
    if (Array.isArray(obj.headers)) {
      const headerSet = new Set(obj.headers);
      obj.rows.forEach((row, index) => {
        if (typeof row !== 'object' || row === null) {
          errors.push({
            code: 'INVALID_ROW_TYPE',
            message: `Row ${index} must be an object`,
            row: index,
          });
        } else {
          const rowKeys = Object.keys(row);
          const missingKeys = obj.headers.filter((h: string) => !(h in row));
          if (missingKeys.length > 0) {
            warnings.push({
              code: 'MISSING_FIELDS',
              message: `Row ${index} is missing fields: ${missingKeys.join(', ')}`,
              row: index,
            });
          }
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: errors.length === 0 ? obj as Dataset : undefined,
  };
}

/**
 * Validate model ID
 */
export function validateModelId(id: unknown): string | null {
  if (typeof id !== 'string' || id.trim() === '') {
    return null;
  }
  
  // UUID format validation
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(id)) {
    return null;
  }
  
  return id;
}

/**
 * Validate email format
 */
export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string') {
    return null;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return null;
  }

  return email.toLowerCase().trim();
}

/**
 * Validate password strength
 */
export function validatePassword(password: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof password !== 'string') {
    return { isValid: false, errors: ['Password must be a string'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }

  if (password.length > 128) {
    errors.push('Password must be at most 128 characters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate file before processing
 */
export function validateFile(file: unknown, options: {
  maxSizeBytes?: number;
  allowedExtensions?: string[];
  allowedMimeTypes?: string[];
} = {}): ValidationResult & { data?: File } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!(file instanceof File)) {
    errors.push({
      code: 'INVALID_FILE',
      message: 'Input is not a valid File object',
    });
    return { isValid: false, errors, warnings };
  }

  const maxSize = options.maxSizeBytes ?? 100 * 1024 * 1024; // 100MB default
  if (file.size > maxSize) {
    errors.push({
      code: 'FILE_TOO_LARGE',
      message: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed (${(maxSize / 1024 / 1024).toFixed(2)}MB)`,
    });
  }

  if (file.size === 0) {
    errors.push({
      code: 'EMPTY_FILE',
      message: 'File is empty',
    });
  }

  if (options.allowedExtensions) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !options.allowedExtensions.includes(`.${ext}`) && !options.allowedExtensions.includes(ext)) {
      errors.push({
        code: 'INVALID_EXTENSION',
        message: `File extension '.${ext}' is not allowed. Allowed: ${options.allowedExtensions.join(', ')}`,
      });
    }
  }

  if (options.allowedMimeTypes) {
    if (!options.allowedMimeTypes.includes(file.type)) {
      errors.push({
        code: 'INVALID_MIME_TYPE',
        message: `File type '${file.type}' is not allowed. Allowed: ${options.allowedMimeTypes.join(', ')}`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: errors.length === 0 ? file : undefined,
  };
}

/**
 * Assert that a value is valid, throwing an error if not
 */
export function assertValid<T>(
  result: ValidationResult & { data?: T },
  errorMessage: string = 'Validation failed'
): asserts result is ValidationResult & { data: T } {
  if (!result.isValid) {
    throw ErrorFactory.validation(
      `${errorMessage}: ${result.errors.map(e => e.message).join(', ')}`
    );
  }
}
