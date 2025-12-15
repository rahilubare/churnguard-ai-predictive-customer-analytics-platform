import Papa from 'papaparse';
import type { ParseResult, ParseError } from 'papaparse';
import type { Dataset, ColumnStat } from '@shared/types';

/**
 * Helper to compute field‑length consistency for delimiter detection.
 */
export function getFieldConsistency(data: any[][]): {
  variance: number;
  avg: number;
  minLen: number;
  maxLen: number;
} {
  const lengths = data.map((r) => r.length);
  if (!lengths.length) {
    return { variance: 0, avg: 0, minLen: 0, maxLen: 0 };
  }
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return { variance: max - min, avg, minLen: min, maxLen: max };
}

/**
 * Test a specific delimiter on a preview of the file.
 */
async function testDelimiter(
  file: File,
  delim: string
): Promise<{
  errors: ParseError[];
  data: any[][];
  cons: ReturnType<typeof getFieldConsistency>;
}> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      preview: 15,
      header: false,
      skipEmptyLines: true,
      delimiter: delim,
      complete: (results: ParseResult<any>) => {
        resolve({
          errors: results.errors,
          data: results.data as any[][],
          cons: getFieldConsistency(results.data as any[][]),
        });
      },
      error: (err) => reject(err),
    });
  });
}

/**
 * Parse a CSV file, automatically detecting the best delimiter.
 */
export async function parseCsv(file: File): Promise<Dataset> {
  // 1️⃣ Detect best delimiter
  const delimiters = [',', ';', '\t'] as const;
  const testResults = await Promise.all(
    delimiters.map((delim) =>
      testDelimiter(file, delim).catch(() => ({
        errors: [{ code: 'PARSE_ERROR', message: 'Parse error', type: 'Delimiter' as const } as ParseError],
        data: [] as any[][],
        cons: { variance: 999, avg: 0, minLen: 0, maxLen: 0 },
      }))
    )
  );

  const scores = testResults.map((t, i) => ({
    ...t,
    score: -t.errors.length * 100 - t.cons.variance * 10 + t.cons.avg * 5,
    delim: delimiters[i],
  }));

  const best = scores.reduce(
    (prev, curr) => (curr.score > prev.score ? curr : prev),
    { score: -Infinity, delim: ',' as typeof delimiters[number] }
  );

  const selectedDelim = best.score > -50 ? best.delim : ',';
  console.log(`Using delimiter: ${selectedDelim}`);

  // 2️⃣ Full parse with the chosen delimiter
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimiter: selectedDelim,
      complete: (results) => {
        // Log warnings but continue if data is usable
        if (results.errors.length) {
          console.warn('CSV Parsing Warnings:', results.errors);
        }

        const hasFields = results.meta.fields && results.meta.fields.length >= 2;
        const hasData = results.data && (results.data as any[]).length > 0;

        if (!hasFields || !hasData) {
          const errorSummary = results.errors.map((e) => e.message).join('; ');
          reject(
            new Error(
              `CSV parsing failed: ${!hasFields ? 'Insufficient fields' : ''} ${
                !hasData ? 'No data rows' : ''
              } ${errorSummary}`.trim()
            )
          );
          return;
        }

        resolve({
          headers: results.meta.fields,
          rows: results.data,
        });
      },
      error: (error: Error) => {
        console.error('CSV Parsing Failed:', error);
        reject(error);
      },
    });
  });
}

/**
 * Compute basic statistics for each column of a dataset.
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
//