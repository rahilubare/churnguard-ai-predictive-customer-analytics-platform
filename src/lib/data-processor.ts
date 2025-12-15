import Papa from 'papaparse';
import type { Dataset, ColumnStat } from '@shared/types';
export function parseCsv(file: File): Promise<Dataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        if (results.errors.length) {
          console.error("CSV Parsing Errors:", results.errors);
          reject(new Error(`Error parsing CSV: ${results.errors[0].message}`));
        } else if (!results.meta.fields || results.meta.fields.length === 0) {
          reject(new Error("Could not determine headers from CSV file."));
        }
        else {
          resolve({
            headers: results.meta.fields,
            rows: results.data,
          });
        }
      },
      error: (error: Error) => {
        console.error("CSV Parsing Failed:", error);
        reject(error);
      },
    });
  });
}
export function getDatasetStats(dataset: Dataset): Record<string, ColumnStat> {
  const stats: Record<string, ColumnStat> = {};
  if (!dataset || dataset.rows.length === 0) {
    return stats;
  }
  dataset.headers.forEach((header) => {
    const values = dataset.rows.map((row) => row[header]);
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
    const uniqueValues = new Set(nonNullValues);
    const valueCounts: Record<string, number> = {};
    nonNullValues.forEach(v => {
      const key = String(v);
      valueCounts[key] = (valueCounts[key] || 0) + 1;
    });
    let columnType: 'numerical' | 'categorical' = 'categorical';
    if (nonNullValues.every(v => typeof v === 'number')) {
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