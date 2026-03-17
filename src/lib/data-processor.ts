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
  // === CSV Encoding Detection ===
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));
  
  // Check for BOM (Byte Order Mark)
  const hasUtf8Bom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const hasUtf16BeBom = bytes[0] === 0xFE && bytes[1] === 0xFF;
  const hasUtf16LeBom = bytes[0] === 0xFF && bytes[1] === 0xFE;
  
  let textContent: string;
  
  if (hasUtf16BeBom || hasUtf16LeBom) {
    // UTF-16 encoded - convert to UTF-8 first
    const decoder = new TextDecoder(hasUtf16BeBom ? 'utf-16be' : 'utf-16le');
    textContent = decoder.decode(buffer);
    console.log('CSV file detected as UTF-16 encoded, converted to UTF-8');
  } else if (hasUtf8Bom) {
    // UTF-8 with BOM - strip BOM and parse normally
    textContent = new TextDecoder('utf-8').decode(buffer.slice(3));
  } else {
    // No BOM - try UTF-8 first
    textContent = new TextDecoder('utf-8').decode(buffer);
    
    // Check for garbage characters (replacement character or high non-ASCII ratio)
    const sampleText = textContent.substring(0, 1000);
    const replacementChars = (sampleText.match(/\uFFFD/g) || []).length;
    const nonAsciiRatio = (sampleText.match(/[^\x00-\x7F]/g) || []).length / sampleText.length;
    
    if (replacementChars > 0 || nonAsciiRatio > 0.3) {
      // Likely not UTF-8, try Latin-1 (ISO-8859-1)
      console.warn('UTF-8 parsing produced suspicious results, falling back to Latin-1');
      textContent = new TextDecoder('latin-1').decode(buffer);
    }
  }
  
  if (delimiter) {
    // Manual delimiter provided, parse directly
    return new Promise<Dataset & { errors?: ParseError[] }>((resolve, reject) => {
      Papa.parse<Record<string, any>>(textContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimiter,
        worker: true,
        complete: (res: ParseResult<any>) => {
        // Identify serious "TooManyFields" errors
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
  
  // === STEP 1: Multi-Sheet Workbook Support ===
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('XLSX file contains no sheets.');
  }
  
  // Score each sheet to find the best one
  let bestSheetName: string = sheetNames[0];
  let bestScore = -Infinity;
  
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { defval: null, blankrows: false }) as any[];
    
    if (!json || json.length === 0) continue; // Skip empty sheets
    
    // Calculate score: rows * columns * fill_ratio
    const rows = json.length;
    const cols = Object.keys(json[0] || {}).length;
    const totalCells = rows * cols;
    const nonEmptyCells = json.reduce((acc, row) => acc + Object.values(row).filter(v => v !== null && v !== undefined && v !== '').length, 0);
    const fillRatio = totalCells > 0 ? nonEmptyCells / totalCells : 0;
    
    // Score formula: prioritize data density
    const score = rows * cols * (1 + fillRatio);
    
    if (score > bestScore) {
      bestScore = score;
      bestSheetName = sheetName;
    }
  }
  
  const worksheet = workbook.Sheets[bestSheetName];
  
  // Convert to JSON with raw values for post-processing
  let jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    blankrows: false,
    raw: true, // Keep raw values including date serial numbers
  }) as any[];
  
  if (!jsonData || jsonData.length === 0) {
    throw new Error('XLSX file contains no data.');
  }
  
  // === STEP 2: Smart Header Row Detection ===
  // Re-parse with raw row data to detect headers
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
  
  let headerRowIndex = 0;
  const maxScanRows = Math.min(10, rawRows.length);
  
  for (let i = 0; i < maxScanRows; i++) {
    const row = rawRows[i];
    const nonEmptyCount = row.filter(cell => cell !== null && cell !== undefined && cell !== '').length;
    const totalCols = row.length;
    const nonEmptyRatio = totalCols > 0 ? nonEmptyCount / totalCols : 0;
    
    // Check if this looks like a header row:
    // - More than 50% non-empty
    // - Values are short strings (not long formulas or pure numbers)
    const looksLikeHeaders = nonEmptyRatio > 0.5 && 
      row.every(cell => {
        if (cell === null || cell === undefined || cell === '') return true;
        const str = String(cell);
        return str.length < 100 && !/^\d+\.?\d*$/.test(str); // Not a pure number
      });
    
    if (looksLikeHeaders) {
      headerRowIndex = i;
      break;
    }
  }
  
  // Extract headers from detected row
  const headerRow = rawRows[headerRowIndex] || [];
  const headers = headerRow.map(h => h !== null && h !== undefined && h !== '' ? String(h) : '').filter(h => h);
  
  // Filter data rows (everything after header row)
  jsonData = jsonData.slice(headerRowIndex);
  
  // === STEP 3: Merged Cell Handling (Forward-Fill) ===
  // Create a map of current values per column
  const columnFillValues: Record<string, any> = {};
  
  for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
    const row = jsonData[rowIndex];
    
    for (const header of headers) {
      const value = row[header];
      
      if (value === null || value === undefined || value === '') {
        // Fill with last known value
        row[header] = columnFillValues[header] || null;
      } else {
        // Update last known value
        columnFillValues[header] = value;
      }
    }
  }
  
  // === STEP 4: Date & Number Normalization ===
  const dateKeywords = ['date', 'time', 'day', 'month', 'year', 'created', 'updated', 'modified', 'timestamp'];
  
  for (const row of jsonData) {
    for (const header of headers) {
      let value = row[header];
      const lowerHeader = header.toLowerCase();
      
      if (value === null || value === undefined) continue;
      
      // Date detection and conversion
      const isDateColumn = dateKeywords.some(kw => lowerHeader.includes(kw));
      
      if (isDateColumn && typeof value === 'number' && value >= 1 && value <= 50000) {
        // Excel serial date conversion
        const excelEpoch = new Date(1899, 11, 30);
        const dateValue = new Date(excelEpoch.getTime() + (value * 24 * 60 * 60 * 1000));
        row[header] = dateValue.toISOString().split('T')[0]; // YYYY-MM-DD format
        continue;
      }
      
      // String normalization
      if (typeof value === 'string') {
        // Trim whitespace
        value = value.trim();
        
        // Currency stripping
        if (/^[\$€£₹]/.test(value)) {
          value = value.replace(/^[\$€£₹]/, '').replace(/,/g, '');
          const numVal = parseFloat(value);
          if (!isNaN(numVal)) {
            row[header] = numVal;
            value = numVal;
          }
        }
        
        // Percentage conversion
        if (value.endsWith('%')) {
          const numVal = parseFloat(value.replace('%', '')) / 100;
          if (!isNaN(numVal)) {
            row[header] = numVal;
            value = numVal;
          }
        }
        
        // Boolean normalization
        const lowerVal = value.toLowerCase();
        if (['yes', 'true', 'y'].includes(lowerVal)) {
          row[header] = 1;
        } else if (['no', 'false', 'n'].includes(lowerVal)) {
          row[header] = 0;
        }
      }
    }
  }
  
  // === STEP 5: Large Dataset Warning ===
  const finalData = jsonData.slice(0, MAX_ROWS);
  
  if (jsonData.length > MAX_ROWS) {
    console.warn(`XLSX file truncated from ${jsonData.length} to ${MAX_ROWS} rows for performance.`);
  }
  
  return { headers, rows: finalData };
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
 * Enhanced dataset stats with semantic type detection and enriched metadata
 */
export function getEnrichedDatasetStats(dataset: Dataset): Record<string, any> {
  const stats = getDatasetStats(dataset);
  const enriched: Record<string, any> = {};
  
  Object.entries(stats).forEach(([header, stat]) => {
    const values = dataset.rows.map(row => row[header]);
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    const lowerHeader = header.toLowerCase();
    
    // Semantic Type Detection
    let semanticType = 'categorical';
    
    // Check for ID columns
    const idKeywords = ['id', 'key', 'uuid', 'guid', 'code', 'reference', 'ref'];
    const isIdColumn = idKeywords.some(kw => lowerHeader.includes(kw)) || 
                       stat.unique > dataset.rows.length * 0.95;
    
    if (isIdColumn) {
      semanticType = 'id';
    }
    // Check for target variable
    else if (inferTargetColumn({ headers: [header], rows: dataset.rows.slice(0, 100) }) === header) {
      semanticType = 'target';
    }
    // Check for datetime
    else if (['date', 'time', 'created', 'updated', 'modified', 'timestamp'].some(kw => lowerHeader.includes(kw))) {
      semanticType = 'datetime';
    }
    // Check for currency
    else if (['price', 'cost', 'amount', 'revenue', 'salary', 'fee', 'payment'].some(kw => lowerHeader.includes(kw))) {
      semanticType = 'currency';
    }
    // Check for percentage
    else if (lowerHeader.includes('percent') || lowerHeader.includes('rate') || lowerHeader.endsWith('%')) {
      semanticType = 'percentage';
    }
    // Check for email
    else if (nonNullValues.some(v => typeof v === 'string' && v.includes('@'))) {
      semanticType = 'email';
    }
    // Check for phone
    else if (nonNullValues.some(v => typeof v === 'string' && /^[\d\s\-\+\(\)]+$/.test(v.replace(/[\s]/g, '')))) {
      semanticType = 'phone';
    }
    // Check for boolean
    else if (stat.unique === 2 && nonNullValues.every(v => [0, 1, 'yes', 'no', 'true', 'false', 'y', 'n'].includes(String(v).toLowerCase()))) {
      semanticType = 'boolean';
    }
    // Check for text (high cardinality strings)
    else if (stat.unique > nonNullValues.length * 0.5 && stat.type === 'categorical') {
      semanticType = 'text';
    }
    // Numerical subtypes
    else if (stat.type === 'numerical') {
      // Compute numerical statistics
      const numValues = nonNullValues.filter(v => typeof v === 'number') as number[];
      if (numValues.length > 0) {
        numValues.sort((a, b) => a - b);
        const min = numValues[0];
        const max = numValues[numValues.length - 1];
        const mean = numValues.reduce((a, b) => a + b, 0) / numValues.length;
        const medianIndex = Math.floor(numValues.length / 2);
        const median = numValues.length % 2 === 0 
          ? (numValues[medianIndex - 1] + numValues[medianIndex]) / 2 
          : numValues[medianIndex];
        
        enriched[header] = {
          ...stat,
          semanticType,
          min,
          max,
          mean: Math.round(mean * 100) / 100,
          median,
          sampleValues: nonNullValues.slice(0, 3),
        };
        return;
      }
    }
    
    // For categorical: get top 5 most common values
    const sortedCounts = Object.entries(stat.valueCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count, percentage: Math.round(count / nonNullValues.length * 10000) / 100 }));
    
    enriched[header] = {
      ...stat,
      semanticType,
      topValues: sortedCounts,
      sampleValues: nonNullValues.slice(0, 3),
    };
  });
  
  return enriched;
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
 * Infer the target column for ANY classification domain
 * Works for churn, fraud, attrition, medical, dropout, failure prediction, etc.
 */
export function inferTargetColumn(dataset: Dataset): string | null {
  // Universal target keywords across ALL domains
  const strongTargetKeywords = [
    'churn', 'attrition', 'exited', 'left', 'cancelled', 'canceled', 
    'fraud', 'default', 'dropout', 'failure', 'converted', 'conversion', 
    'outcome', 'result', 'target', 'label', 'y', 'class', 'prediction', 
    'survived', 'purchased', 'subscribed', 'retained', 'renewed', 
    'approved', 'diagnosed', 'churned', 'response', 'click', 'buy',
    'cancellation', 'terminated', 'closed', 'won', 'lost'
  ];
  
  // Columns to exclude (IDs, PII, timestamps)
  const negativeKeywords = [
    'id', 'key', 'code', 'number', 'ref', 'reference', 'index', 
    'created_at', 'updated_at', 'timestamp', 'date', 'time', 'uuid',
    'email', 'phone', 'address', 'url', 'name', 'customer_id', 'user_id',
    'ssn', 'credit_card', 'password', 'token', 'session'
  ];
  
  interface ColumnScore {
    name: string;
    score: number;
  }
  
  const columnScores: ColumnScore[] = [];
  
  dataset.headers.forEach(header => {
    const lowerHeader = header.toLowerCase();
    
    // Skip obvious non-target columns
    if (negativeKeywords.some(kw => lowerHeader.includes(kw))) {
      return;
    }
    
    // Get unique values
    const values = dataset.rows.map(r => r[header]).filter(v => v !== null && v !== undefined);
    const uniqueValues = new Set(values);
    const uniqueCount = uniqueValues.size;
    const totalRows = values.length;
    
    if (uniqueCount === 0 || totalRows === 0) return;
    
    let score = 0;
    
    // STRONG INDICATOR: Name contains target keywords
    if (strongTargetKeywords.some(kw => lowerHeader.includes(kw))) {
      score += 100;
    }
    
    // MODERATE INDICATOR: Binary column (2 unique values)
    const isBinary = uniqueCount === 2;
    if (isBinary) {
      score += 50;
      
      // Check class balance (ideal targets have 5-50% minority class)
      const valueCounts = new Map();
      values.forEach(v => {
        const key = String(v).toLowerCase();
        valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
      });
      
      const counts = Array.from(valueCounts.values()).sort((a, b) => a - b);
      if (counts.length === 2) {
        const minorityPct = counts[0] / totalRows;
        if (minorityPct >= 0.05 && minorityPct <= 0.5) {
          score += 30; // Good class balance
        } else if (minorityPct < 0.05) {
          score -= 20; // Too imbalanced
        }
      }
    }
    
    // POSITIVE: Low cardinality categorical (3-5 unique values)
    if (uniqueCount >= 3 && uniqueCount <= 5 && uniqueCount < totalRows * 0.1) {
      score += 20;
    }
    
    // NEGATIVE: Too many unique values (likely not a classification target)
    if (uniqueCount > 20) {
      score -= 50;
    }
    
    // NEGATIVE: All unique (definitely an ID or free text)
    if (uniqueCount === totalRows) {
      score -= 100;
    }
    
    columnScores.push({ name: header, score });
  });
  
  // Sort by score and return best match
  columnScores.sort((a, b) => b.score - a.score);
  
  // Only return if score meets minimum threshold
  if (columnScores.length > 0 && columnScores[0].score >= 50) {
    return columnScores[0].name;
  }
  
  return null;
}

/**
 * Get recommended features for training - works for ANY domain
 */
export function getRecommendedFeatures(dataset: Dataset, targetColumn: string): string[] {
  const stats = getDatasetStats(dataset);
  const excludePatterns = [
    'id', 'identifier', 'name', 'email', 'phone', 'address', 'zip', 'postal',
    'ssn', 'credit_card', 'password', 'token', 'session', 'uuid', 'guid',
    'url', 'link', 'description', 'comment', 'note', 'text', 'remarks'
  ];
  
  return dataset.headers.filter(header => {
    if (header === targetColumn) return false;
    
    const stat = stats[header];
    if (!stat) return false;
    
    const lower = header.toLowerCase();
    
    // Exclude potential IDs and PII
    if (excludePatterns.some(p => lower.includes(p))) return false;
    
    // Exclude columns with all missing values
    if (stat.missing === stat.total) return false;
    
    // Exclude constant columns (zero variance)
    if (stat.unique === 1) return false;
    
    // Exclude columns with too many unique values (likely IDs or free text)
    if (stat.type === 'categorical' && stat.unique > dataset.rows.length * 0.9) return false;
    
    // Exclude potential email/URL columns
    const sampleValues = dataset.rows.slice(0, 10).map(r => r[header]).filter(Boolean);
    if (sampleValues.some(v => String(v).includes('@'))) return false; // Email
    if (sampleValues.some(v => String(v).startsWith('http'))) return false; // URL
    
    return true;
  });
}

/**
 * Detect the domain of a dataset based on column names and data patterns
 */
export function detectDatasetDomain(dataset: Dataset): { domain: string; confidence: number; reasoning: string } {
  const headers = dataset.headers.map(h => h.toLowerCase());
  
  // Domain keyword patterns
  const domainPatterns: Record<string, string[]> = {
    'Customer Churn': [
      'tenure', 'contract', 'monthly charges', 'payment method', 'internet service', 
      'customer id', 'senior citizen', 'dependents', 'partner', 'phone service', 
      'multiple lines', 'tech support', 'streaming', 'online security'
    ],
    'HR Attrition': [
      'department', 'job role', 'salary', 'years at company', 'work life balance', 
      'overtime', 'performance rating', 'business travel', 'stock option', 
      'years since last promotion', 'environment satisfaction', 'job satisfaction'
    ],
    'Financial Fraud': [
      'transaction', 'merchant', 'card type', 'location', 'device', 'ip address', 
      'velocity', 'amount', 'currency', 'fraud', 'legit', 'class'
    ],
    'Healthcare / Medical': [
      'diagnosis', 'medication', 'blood pressure', 'glucose', 'bmi', 'hospital', 
      'admission', 'patient', 'treatment', 'symptom', 'lab result', 'cholesterol'
    ],
    'Sales / Marketing': [
      'lead source', 'campaign', 'product', 'revenue', 'deal size', 'stage', 
      'win', 'loss', 'opportunity', 'pipeline', 'conversion', 'quote'
    ],
    'Student Dropout': [
      'gpa', 'attendance', 'grade', 'course', 'semester', 'scholarship', 
      'tuition', 'enrollment', 'credit', 'graduation', 'dropout'
    ],
    'Equipment / IoT': [
      'sensor', 'temperature', 'pressure', 'vibration', 'machine id', 'maintenance', 
      'hours', 'rpm', 'failure', 'operating', 'iot', 'device'
    ]
  };
  
  // Score each domain
  const domainScores: Array<{ domain: string; score: number; matches: string[] }> = [];
  
  Object.entries(domainPatterns).forEach(([domain, keywords]) => {
    const matches = headers.filter(h => keywords.some(kw => h.includes(kw)));
    const score = matches.length;
    if (score > 0) {
      domainScores.push({ domain, score, matches });
    }
  });
  
  // Sort by matches
  domainScores.sort((a, b) => b.score - a.score);
  
  // Return best match
  if (domainScores.length > 0 && domainScores[0].score >= 2) {
    return {
      domain: domainScores[0].domain,
      confidence: Math.min(0.95, 0.5 + (domainScores[0].score * 0.1)),
      reasoning: `Detected ${domainScores[0].domain} dataset based on columns: ${domainScores[0].matches.join(', ')}`
    };
  }
  
  return {
    domain: 'General Classification',
    confidence: 0.3,
    reasoning: 'No specific domain pattern detected - treating as general classification problem'
  };
}