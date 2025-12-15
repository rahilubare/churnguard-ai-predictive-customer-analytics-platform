import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParseError, ParseResult } from 'papaparse';
import type { Dataset, ColumnStat } from '@shared/types';
const MAX_ROWS = 100000; // Performance limit for client-side processing
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
export async function parseFile(file: File, delimiter?: string): Promise<Dataset & { errors?: ParseError[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    return parseCsvFile(file, delimiter);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    if (delimiter) console.warn("Delimiter selection is ignored for XLSX files.");
    return parseXlsxFile(file);
  }
  throw new Error('Unsupported file type. Only CSV and XLSX files are supported.');
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