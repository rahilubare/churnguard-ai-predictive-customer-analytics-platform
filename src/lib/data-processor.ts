import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParseError, ParseResult } from 'papaparse';
import type { Dataset, ColumnStat, ValidationResult, ValidationError, ValidationWarning, DataQualityReport, DataQualityIssue } from '@shared/types';
import { validateDataset, validateFile } from './input-validator';
import { ErrorFactory, toAppError } from './error-handler';

const MAX_ROWS = 100000; // Performance limit for client-side processing
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.json'];
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
  'text/plain',
];
export function getConsistencyScore(
  data: any[][],
  errors: ParseError[]
): { score: number; consMatch: number; firstLen: number } {
  const totalRows = data.length;
  if (totalRows === 0) return { score: -Infinity, consMatch: 0, firstLen: 0 };
  const firstLen = data[0]?.length ?? 0;
  if (firstLen < 2) return { score: -Infinity, consMatch: 0, firstLen };
  const matchingRows = data.filter((row) => row.length === firstLen).length;
  const consMatch = matchingRows / totalRows;
  const errPenalty = (errors.length / totalRows) * 50;
  const score = consMatch * 100 - errPenalty;
  return { score, consMatch, firstLen };
}
async function parseCsvFile(file: File, delimiter?: string): Promise<Dataset & { errors?: ParseError[] }> {
  if (delimiter) {
    // Manual delimiter provided, parse directly
    return new Promise<Dataset & { errors?: ParseError[] }>((resolve, reject) => {
      Papa.parse<Record<string, any>>(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimiter,
        worker: true,
        // <-- missing comma added here
        complete: (res: ParseResult<any>) => {
        // Identify serious “TooManyFields” errors
        const seriousErrors = res.errors.filter((e: ParseError) => e.code === 'TooManyFields');
        const totalRows = res.data.length;
        // Reject if the file is too inconsistent (more than 10% serious errors) or lacks proper structure
        if (
          !res.meta.fields ||
          res.meta.fields.length < 2 ||
          totalRows === 0 ||
          (seriousErrors.length / totalRows > 0.1)
        ) {
          reject(
            new Error(
              'Format too inconsistent even with manual delimiter (too many field mismatches).'
            )
          );
          return;
        }
        // Log a warning only when there are minor TooManyFields warnings (<10%)
        if (seriousErrors.length > 0) {
          console.warn(
            `Accepted manual parse with ${seriousErrors.length} minor TooManyFields warnings (<10%).`
          );
        }
        resolve({
          headers: res.meta.fields as string[],
          rows: res.data.slice(0, MAX_ROWS),
          errors: res.errors,
        });
      },
        error: (error) => reject(new Error(`PapaParse error: ${(error as any).message}`)),
      });
    });
  }
  // Auto-detect delimiter
  const delimiters = [',', ';', '\t'] as const;
  const testResults = await Promise.all(
    delimiters.map(async (delim) => {
      try {
        const result = await new Promise<{ data: any[][]; errors: ParseError[] }>((resolve, reject) => {
          Papa.parse(file, {
            delimiter: delim,
            header: false,
            skipEmptyLines: true,
            preview: 100, // Preview first 100 rows for detection
            complete: (res: ParseResult<any>) => resolve({ data: res.data as any[][], errors: res.errors }),
            error: (err) => reject(err),
          });
        });
        const { score } = getConsistencyScore(result.data, result.errors);
        return { delim, score };
      } catch {
        return { delim, score: -Infinity };
      }
    })
  );
  const best = testResults.reduce((prev, curr) => (curr.score > prev.score ? curr : prev));
  if (best.score < 20) {
    throw new Error('Ambiguous file format. Please select a delimiter manually.');
  }
  return parseCsvFile(file, best.delim);
}
async function parseXlsxFile(file: File): Promise<Dataset> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('XLSX file contains no sheets.');
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    blankrows: false,
  }) as any[];
  if (!jsonData || jsonData.length === 0) throw new Error('XLSX file contains no data.');
  const headers = Object.keys(jsonData[0]);
  return { headers, rows: jsonData.slice(0, MAX_ROWS) };
}
/**
 * Parse a JSON file (array of objects or object with data array)
 */
async function parseJsonFile(file: File): Promise<Dataset> {
  const text = await file.text();
  
  let jsonData: unknown;
  try {
    jsonData = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON format: ${e instanceof Error ? e.message : 'Parse error'}`);
  }

  // Handle different JSON structures
  let rows: Record<string, unknown>[] = [];
  
  if (Array.isArray(jsonData)) {
    // Direct array of objects
    rows = jsonData.filter(item => typeof item === 'object' && item !== null);
  } else if (typeof jsonData === 'object' && jsonData !== null) {
    const obj = jsonData as Record<string, unknown>;
    
    // Check for common data wrapper patterns
    if (Array.isArray(obj.data)) {
      rows = obj.data.filter(item => typeof item === 'object' && item !== null);
    } else if (Array.isArray(obj.records)) {
      rows = obj.records.filter(item => typeof item === 'object' && item !== null);
    } else if (Array.isArray(obj.rows)) {
      rows = obj.rows.filter(item => typeof item === 'object' && item !== null);
    } else if (Array.isArray(obj.items)) {
      rows = obj.items.filter(item => typeof item === 'object' && item !== null);
    } else {
      // Single object - convert to single-row dataset
      rows = [obj];
    }
  }

  if (rows.length === 0) {
    throw new Error('JSON file contains no valid data rows. Expected an array of objects or an object with a data/records/rows/items property.');
  }

  // Infer headers from all rows
  const headerSet = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(key => headerSet.add(key));
  });
  const headers = Array.from(headerSet);

  if (headers.length === 0) {
    throw new Error('No columns found in JSON data.');
  }

  return {
    headers,
    rows: rows.slice(0, MAX_ROWS) as Record<string, any>[],
  };
}

/**
 * Main file parsing function - supports CSV, XLSX, and JSON
 */
export async function parseFile(file: File, delimiter?: string): Promise<Dataset & { errors?: ParseError[] }> {
  // Validate file first
  const fileValidation = validateFile(file, {
    maxSizeBytes: MAX_FILE_SIZE,
    allowedExtensions: ALLOWED_EXTENSIONS,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });

  if (!fileValidation.isValid) {
    throw new Error(fileValidation.errors.map(e => e.message).join('; '));
  }

  const name = file.name.toLowerCase();
  
  try {
    if (name.endsWith('.csv')) {
      return parseCsvFile(file, delimiter);
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (delimiter) console.warn("Delimiter selection is ignored for XLSX files.");
      return parseXlsxFile(file);
    }
    if (name.endsWith('.json')) {
      if (delimiter) console.warn("Delimiter selection is ignored for JSON files.");
      return parseJsonFile(file);
    }
    throw new Error('Unsupported file type. Only CSV, XLSX, and JSON files are supported.');
  } catch (error) {
    // Wrap in more descriptive error
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to parse file: ${String(error)}`);
  }
}
export async function parseCsv(file: File): Promise<Dataset> {
  return parseFile(file);
}
export function getDatasetStats(dataset: Dataset): Record<string, ColumnStat> {
  const stats: Record<string, ColumnStat> = {};
  if (!dataset || dataset.rows.length === 0) return stats;
  dataset.headers.forEach((header) => {
    const values = dataset.rows.map((row) => row[header]);
    const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== '');
    // For large datasets, sample for unique values and counts to avoid performance issues
    const sample = nonNullValues.length > 10000 ? nonNullValues.slice(0, 10000) : nonNullValues;
    const uniqueValues = new Set(sample);
    const valueCounts: Record<string, number> = {};
    sample.forEach((v) => {
      const key = String(v);
      valueCounts[key] = (valueCounts[key] || 0) + 1;
    });
    let columnType: 'numerical' | 'categorical' = 'categorical';
    if (nonNullValues.every((v) => typeof v === 'number')) {
      columnType = 'numerical';
    }
    stats[header] = {
      total: values.length,
      missing: values.length - nonNullValues.length,
      unique: uniqueValues.size,
      type: columnType,
      valueCounts,
    };
  });
  return stats;
}

/**
 * Validate a dataset for common issues
 */
export function validateDatasetQuality(dataset: Dataset): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check basic structure
  if (!dataset.headers || dataset.headers.length === 0) {
    errors.push({ code: 'NO_HEADERS', message: 'Dataset has no columns' });
    return { isValid: false, errors, warnings };
  }

  if (!dataset.rows || dataset.rows.length === 0) {
    errors.push({ code: 'NO_ROWS', message: 'Dataset has no data rows' });
    return { isValid: false, errors, warnings };
  }

  // Check for minimum data requirements
  if (dataset.rows.length < 10) {
    warnings.push({ code: 'LOW_DATA', message: 'Dataset has fewer than 10 rows. Model quality may be poor.' });
  }

  // Check for duplicate headers
  const headerSet = new Set(dataset.headers);
  if (headerSet.size < dataset.headers.length) {
    const duplicates = dataset.headers.filter((h, i) => dataset.headers.indexOf(h) !== i);
    warnings.push({ 
      code: 'DUPLICATE_HEADERS', 
      message: `Duplicate column names detected: ${[...new Set(duplicates)].join(', ')}` 
    });
  }

  // Check each column
  const stats = getDatasetStats(dataset);
  
  for (const [header, stat] of Object.entries(stats)) {
    // Check for all missing
    if (stat.missing === stat.total) {
      errors.push({ 
        code: 'ALL_MISSING', 
        message: `Column '${header}' has no values`,
        field: header 
      });
    }

    // Check for high missing rate
    const missingRate = stat.missing / stat.total;
    if (missingRate > 0.5) {
      warnings.push({
        code: 'HIGH_MISSING',
        message: `Column '${header}' has ${(missingRate * 100).toFixed(1)}% missing values`,
        field: header,
      });
    }

    // Check for constant columns
    if (stat.unique === 1 && stat.total > 1) {
      warnings.push({
        code: 'CONSTANT_COLUMN',
        message: `Column '${header}' has only one unique value`,
        field: header,
      });
    }

    // Check for potential ID columns
    if (stat.type === 'categorical' && stat.unique > stat.total * 0.9 && stat.total > 100) {
      warnings.push({
        code: 'POTENTIAL_ID',
        message: `Column '${header}' appears to be an ID column (${stat.unique} unique values in ${stat.total} rows)`,
        field: header,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate a comprehensive data quality report
 */
export function generateQualityReport(dataset: Dataset): DataQualityReport {
  const stats = getDatasetStats(dataset);
  const issues: DataQualityIssue[] = [];
  
  const totalCells = dataset.rows.length * dataset.headers.length;
  let missingCells = 0;
  let duplicateRows = 0;
  let outlierCount = 0;

  // Count missing values
  for (const stat of Object.values(stats)) {
    missingCells += stat.missing;
  }

  // Check for duplicate rows
  const rowSignatures = new Set<string>();
  for (const row of dataset.rows) {
    const sig = JSON.stringify(row);
    if (rowSignatures.has(sig)) {
      duplicateRows++;
    } else {
      rowSignatures.add(sig);
    }
  }

  // Analyze each column
  for (const [column, stat] of Object.entries(stats)) {
    // Missing values
    if (stat.missing > 0) {
      const percentage = (stat.missing / stat.total) * 100;
      issues.push({
        type: 'missing',
        severity: percentage > 50 ? 'critical' : percentage > 20 ? 'high' : percentage > 5 ? 'medium' : 'low',
        column,
        count: stat.missing,
        percentage,
        description: `${stat.missing} missing values (${percentage.toFixed(1)}%)`,
      });
    }

    // Outliers in numerical columns
    if (stat.type === 'numerical') {
      const outliers = detectOutliersInColumn(dataset, column);
      if (outliers.count > 0) {
        outlierCount += outliers.count;
        issues.push({
          type: 'outlier',
          severity: outliers.percentage > 10 ? 'high' : outliers.percentage > 5 ? 'medium' : 'low',
          column,
          count: outliers.count,
          percentage: outliers.percentage,
          description: `${outliers.count} potential outliers detected using IQR method`,
        });
      }
    }

    // High cardinality
    if (stat.type === 'categorical' && stat.unique > 100) {
      const percentage = (stat.unique / stat.total) * 100;
      issues.push({
        type: 'inconsistent',
        severity: percentage > 80 ? 'high' : 'medium',
        column,
        count: stat.unique,
        percentage,
        description: `High cardinality: ${stat.unique} unique values`,
      });
    }
  }

  // Duplicate rows
  if (duplicateRows > 0) {
    const percentage = (duplicateRows / dataset.rows.length) * 100;
    issues.push({
      type: 'duplicate',
      severity: percentage > 10 ? 'high' : percentage > 5 ? 'medium' : 'low',
      column: '_row',
      count: duplicateRows,
      percentage,
      description: `${duplicateRows} duplicate rows detected`,
    });
  }

  // Calculate scores
  const completeness = totalCells > 0 ? ((totalCells - missingCells) / totalCells) * 100 : 100;
  const consistency = dataset.rows.length > 0 ? ((dataset.rows.length - duplicateRows) / dataset.rows.length) * 100 : 100;
  const validity = 100 - (issues.filter(i => i.type === 'invalid').length / dataset.headers.length) * 100;
  const uniqueness = dataset.rows.length > 0 ? (rowSignatures.size / dataset.rows.length) * 100 : 100;

  const overallScore = (completeness + consistency + validity + uniqueness) / 4;

  return {
    overallScore,
    completeness,
    consistency,
    validity,
    uniqueness,
    issues,
  };
}

/**
 * Detect outliers in a numerical column using IQR method
 */
function detectOutliersInColumn(dataset: Dataset, column: string): { count: number; percentage: number } {
  const values = dataset.rows
    .map(row => row[column])
    .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

  if (values.length < 4) {
    return { count: 0, percentage: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const outliers = values.filter(v => v < lowerBound || v > upperBound);
  const percentage = (outliers.length / values.length) * 100;

  return {
    count: outliers.length,
    percentage,
  };
}

/**
 * Detect and handle outliers in the dataset
 */
export function handleOutliers(
  dataset: Dataset,
  options: {
    method: 'remove' | 'clip' | 'none';
    columns?: string[];
    threshold?: number;
  } = { method: 'none' }
): Dataset {
  if (options.method === 'none') {
    return dataset;
  }

  const columns = options.columns ?? dataset.headers;
  const threshold = options.threshold ?? 1.5; // IQR multiplier

  const stats = getDatasetStats(dataset);
  const rowsToRemove = new Set<number>();

  // Process each numerical column
  for (const column of columns) {
    const stat = stats[column];
    if (stat?.type !== 'numerical') continue;

    const values = dataset.rows
      .map((row, idx) => ({ value: row[column], idx }))
      .filter(item => typeof item.value === 'number' && !isNaN(item.value)) as { value: number; idx: number }[];

    if (values.length < 4) continue;

    const sorted = [...values.map(v => v.value)].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - threshold * iqr;
    const upperBound = q3 + threshold * iqr;

    if (options.method === 'remove') {
      values.forEach(item => {
        if (item.value < lowerBound || item.value > upperBound) {
          rowsToRemove.add(item.idx);
        }
      });
    } else if (options.method === 'clip') {
      dataset.rows.forEach((row, idx) => {
        const val = row[column];
        if (typeof val === 'number' && !isNaN(val)) {
          if (val < lowerBound) {
            row[column] = lowerBound;
          } else if (val > upperBound) {
            row[column] = upperBound;
          }
        }
      });
    }
  }

  if (options.method === 'remove' && rowsToRemove.size > 0) {
    return {
      ...dataset,
      rows: dataset.rows.filter((_, idx) => !rowsToRemove.has(idx)),
    };
  }

  return dataset;
}

/**
 * Clean and prepare dataset for ML training
 */
export function prepareDataset(
  dataset: Dataset,
  options: {
    removeOutliers?: boolean;
    fillMissing?: 'mean' | 'median' | 'mode' | 'drop';
    normalize?: boolean;
  } = {}
): Dataset {
  let result = { ...dataset, rows: [...dataset.rows] } as Dataset;
  const stats = getDatasetStats(dataset);

  // Handle missing values
  if (options.fillMissing) {
    result.rows = result.rows.map(row => {
      const newRow = { ...row };
      for (const [column, stat] of Object.entries(stats)) {
        if (newRow[column] === null || newRow[column] === undefined || newRow[column] === '') {
          if (stat.type === 'numerical') {
            const values = dataset.rows
              .map(r => r[column])
              .filter(v => typeof v === 'number' && !isNaN(v)) as number[];
            
            if (values.length > 0) {
              if (options.fillMissing === 'mean') {
                newRow[column] = values.reduce((a, b) => a + b, 0) / values.length;
              } else if (options.fillMissing === 'median') {
                const sorted = [...values].sort((a, b) => a - b);
                newRow[column] = sorted[Math.floor(sorted.length / 2)];
              }
            }
          } else {
            // Categorical - use mode
            const entries = Object.entries(stat.valueCounts);
            if (entries.length > 0) {
              newRow[column] = entries.reduce((a, b) => a[1] > b[1] ? a : b)[0];
            }
          }
        }
      }
      return newRow;
    });
  }

  // Remove rows with missing target (if using drop)
  if (options.fillMissing === 'drop') {
    result.rows = result.rows.filter(row => {
      return Object.values(row).every(v => v !== null && v !== undefined && v !== '');
    });
  }

  // Handle outliers
  if (options.removeOutliers) {
    result = handleOutliers(result, { method: 'clip' });
  }

  return result;
}

/**
 * Infer the target column (churn indicator)
 */
export function inferTargetColumn(dataset: Dataset): string | null {
  const targetKeywords = ['churn', 'target', 'label', 'exited', 'retained', 'left', 'cancelled', 'canceled'];
  
  for (const header of dataset.headers) {
    const lower = header.toLowerCase();
    if (targetKeywords.some(kw => lower.includes(kw))) {
      return header;
    }
  }
  
  return null;
}

/**
 * Get recommended features for training
 */
export function getRecommendedFeatures(dataset: Dataset, targetColumn: string): string[] {
  const stats = getDatasetStats(dataset);
  const excludePatterns = ['id', 'identifier', 'name', 'email', 'phone', 'address', 'zip', 'postal'];
  
  return dataset.headers.filter(header => {
    if (header === targetColumn) return false;
    
    const stat = stats[header];
    if (!stat) return false;
    
    // Exclude columns with all missing values
    if (stat.missing === stat.total) return false;
    
    // Exclude constant columns
    if (stat.unique === 1) return false;
    
    // Exclude potential ID columns
    const lower = header.toLowerCase();
    if (excludePatterns.some(p => lower.includes(p))) return false;
    
    // Exclude columns with too many unique values (likely IDs)
    if (stat.type === 'categorical' && stat.unique > dataset.rows.length * 0.9) return false;
    
    return true;
  });
}