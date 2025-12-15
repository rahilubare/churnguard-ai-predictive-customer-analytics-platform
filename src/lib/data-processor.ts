import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParseError, ParseResult } from 'papaparse';
import type { Dataset, ColumnStat } from '@shared/types';
/**
 * Helper to compute field‑length consistency for delimiter detection.
 * Returns a score that rewards rows matching the first row length and penalizes parse errors.
 */
export function getConsistencyScore(
  data: any[][],
  errors: ParseError[]
): { score: number; consMatch: number; firstLen: number } {
  const totalRows = data.length;
  if (totalRows === 0) {
    return { score: -Infinity, consMatch: 0, firstLen: 0 };
  }
  const firstLen = data[0]?.length ?? 0;
  if (firstLen < 2) {
    return { score: -Infinity, consMatch: 0, firstLen };
  }
  const matchingRows = data.filter((row) => row.length === firstLen).length;
  const consMatch = matchingRows / totalRows;
  const errPenalty = (errors.length / totalRows) * 50;
  const score = consMatch * 100 - errPenalty;
  return { score, consMatch, firstLen };
}
/**
 * Parse a CSV file with automatic delimiter detection.
 * Throws if the format is ambiguous or parsing fails.
 */
async function parseCsvFile(file: File): Promise<Dataset> {
  const delimiters = [',', ';', '\t'] as const;
  // Test each delimiter and compute a consistency score.
  const testResults = await Promise.all(
    delimiters.map(async (delim) => {
      try {
        const result = await new Promise<{
          data: any[][];
          errors: ParseError[];
        }>((resolve, reject) => {
          Papa.parse(file, {
            delimiter: delim,
            header: false,
            skipEmptyLines: true,
            complete: (res: ParseResult<any>) => {
              resolve({ data: res.data as any[][], errors: res.errors });
            },
            error: (err) => reject(err),
          });
        });
        const { score, consMatch, firstLen } = getConsistencyScore(
          result.data,
          result.errors
        );
        return {
          delim,
          data: result.data,
          errors: result.errors,
          score,
          consMatch,
          firstLen,
        };
      } catch {
        // If parsing fails for a delimiter, treat it as the worst possible score.
        return {
          delim,
          data: [] as any[][],
          errors: [] as ParseError[],
          score: -Infinity,
          consMatch: 0,
          firstLen: 0,
        };
      }
    })
  );
  // Choose the delimiter with the highest score.
  const best = testResults.reduce((prev, curr) =>
    curr.score > prev.score ? curr : prev
  );
  // Validate the chosen delimiter against the required thresholds.
  if (best.score < 20 || best.consMatch < 0.8 || best.firstLen < 2) {
    throw new Error('Ambiguous format - try manual delimiter');
  }
  // Perform the final parse using the selected delimiter.
  return new Promise<Dataset>((resolve, reject) => {
    Papa.parse<Record<string, any>>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      delimiter: best.delim,
      complete: (res: ParseResult<any>) => {
        const minorCodes = ['TooFewFields', 'TooManyFields'];
        const seriousErrors = res.errors.filter(
          (e) => !minorCodes.includes(e.code as string)
        );
        if (seriousErrors.length) {
          console.warn('CSV Parsing Warnings (serious only):', seriousErrors);
        }
        const hasFields = res.meta.fields && res.meta.fields.length >= 2;
        const hasData = res.data && (res.data as any[]).length > 0;
        if (!hasFields || !hasData) {
          const errorMsg = seriousErrors.map((e) => e.message).join('; ');
          reject(
            new Error(
              `CSV parsing failed: ${
                !hasFields ? 'Insufficient fields' : ''
              } ${!hasData ? 'No data rows' : ''} ${errorMsg}`.trim()
            )
          );
          return;
        }
        resolve({
          headers: res.meta.fields as string[],
          rows: res.data as Record<string, any>[],
        });
      },
      error: (error) => {
        reject(
          new Error(
            `Papa error ${(error as any).code}: ${(error as any).message}`
          )
        );
      },
    });
  });
}
/**
 * Parse an XLSX (or XLS) file using the `xlsx` library.
 * Returns a Dataset with headers derived from the first row.
 */
async function parseXlsxFile(file: File): Promise<Dataset> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    blankrows: false,
  }) as any[];
  if (!jsonData || jsonData.length === 0) {
    throw new Error('XLSX file contains no data.');
  }
  const headers = Object.keys(jsonData[0]);
  return {
    headers,
    rows: jsonData,
  };
}
/**
 * Public entry point – automatically detects file type and parses accordingly.
 * Supports `.csv`, `.xlsx`, and `.xls`. Throws for unsupported formats.
 */
export async function parseFile(file: File): Promise<Dataset> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return parseCsvFile(file);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsxFile(file);
  }
  throw new Error(
    'Unsupported file type. Only CSV and XLSX files are supported.'
  );
}
/**
 * Backwards‑compatible wrapper – existing code that imported `parseCsv`
 * will continue to work, delegating to the new `parseFile` implementation.
 */
export async function parseCsv(file: File): Promise<Dataset> {
  return parseFile(file);
}
/**
 * Compute basic statistics for each column of a dataset.
 * (Unchanged from the original implementation.)
 */
export function getDatasetStats(dataset: Dataset): Record<string, ColumnStat> {
  const stats: Record<string, ColumnStat> = {};
  if (!dataset || dataset.rows.length === 0) {
    return stats;
  }
  dataset.headers.forEach((header) => {
    const values = dataset.rows.map((row) => row[header]);
    const nonNullValues = values.filter(
      (v) => v !== null && v !== undefined && v !== ''
    );
    const uniqueValues = new Set(nonNullValues);
    const valueCounts: Record<string, number> = {};
    nonNullValues.forEach((v) => {
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