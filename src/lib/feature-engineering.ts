/**
 * Feature Engineering Module for ChurnGuard AI
 * Provides feature extraction, encoding, and selection utilities
 */

import type { Dataset, FeatureEngineeringConfig, EngineeredFeatures } from '@shared/types';

/**
 * Extract datetime features from a column
 */
export function extractDatetimeFeatures(
  dataset: Dataset,
  column: string,
  options: {
    includeDay?: boolean;
    includeMonth?: boolean;
    includeYear?: boolean;
    includeDayOfWeek?: boolean;
    includeHour?: boolean;
    includeQuarter?: boolean;
    includeIsWeekend?: boolean;
  } = {}
): { dataset: Dataset; newFeatures: string[] } {
  const {
    includeDay = true,
    includeMonth = true,
    includeYear = true,
    includeDayOfWeek = true,
    includeHour = false,
    includeQuarter = false,
    includeIsWeekend = false,
  } = options;

  const newFeatures: string[] = [];
  const newHeaders = [...dataset.headers];

  // Add new header names
  if (includeDay) newHeaders.push(`${column}_day`);
  if (includeMonth) newHeaders.push(`${column}_month`);
  if (includeYear) newHeaders.push(`${column}_year`);
  if (includeDayOfWeek) newHeaders.push(`${column}_dayOfWeek`);
  if (includeHour) newHeaders.push(`${column}_hour`);
  if (includeQuarter) newHeaders.push(`${column}_quarter`);
  if (includeIsWeekend) newHeaders.push(`${column}_isWeekend`);

  const newRows = dataset.rows.map(row => {
    const value = row[column];
    const newRow = { ...row };

    let date: Date | null = null;

    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }

    if (date) {
      if (includeDay) {
        newRow[`${column}_day`] = date.getDate();
        newFeatures.push(`${column}_day`);
      }
      if (includeMonth) {
        newRow[`${column}_month`] = date.getMonth() + 1;
        newFeatures.push(`${column}_month`);
      }
      if (includeYear) {
        newRow[`${column}_year`] = date.getFullYear();
        newFeatures.push(`${column}_year`);
      }
      if (includeDayOfWeek) {
        newRow[`${column}_dayOfWeek`] = date.getDay();
        newFeatures.push(`${column}_dayOfWeek`);
      }
      if (includeHour) {
        newRow[`${column}_hour`] = date.getHours();
        newFeatures.push(`${column}_hour`);
      }
      if (includeQuarter) {
        newRow[`${column}_quarter`] = Math.floor(date.getMonth() / 3) + 1;
        newFeatures.push(`${column}_quarter`);
      }
      if (includeIsWeekend) {
        const day = date.getDay();
        newRow[`${column}_isWeekend`] = (day === 0 || day === 6) ? 1 : 0;
        newFeatures.push(`${column}_isWeekend`);
      }
    } else {
      // Fill with nulls for invalid dates
      if (includeDay) newRow[`${column}_day`] = null;
      if (includeMonth) newRow[`${column}_month`] = null;
      if (includeYear) newRow[`${column}_year`] = null;
      if (includeDayOfWeek) newRow[`${column}_dayOfWeek`] = null;
      if (includeHour) newRow[`${column}_hour`] = null;
      if (includeQuarter) newRow[`${column}_quarter`] = null;
      if (includeIsWeekend) newRow[`${column}_isWeekend`] = null;
    }

    return newRow;
  });

  return {
    dataset: { headers: newHeaders, rows: newRows },
    newFeatures: [...new Set(newFeatures)],
  };
}

/**
 * One-hot encode a categorical column
 */
export function oneHotEncode(
  dataset: Dataset,
  column: string,
  options: {
    maxCategories?: number;
    dropFirst?: boolean;
    handleUnknown?: 'ignore' | 'error';
  } = {}
): { dataset: Dataset; newFeatures: string[]; categories: string[] } {
  const { maxCategories = 50, dropFirst = false, handleUnknown = 'ignore' } = options;

  // Find unique categories
  const categorySet = new Set<string>();
  dataset.rows.forEach(row => {
    const value = row[column];
    if (value !== null && value !== undefined) {
      categorySet.add(String(value));
    }
  });

  let categories = Array.from(categorySet).sort();

  // Limit categories
  if (categories.length > maxCategories) {
    // Keep most frequent categories
    const counts = new Map<string, number>();
    dataset.rows.forEach(row => {
      const value = row[column];
      if (value !== null && value !== undefined) {
        const key = String(value);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    });
    categories = categories
      .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
      .slice(0, maxCategories);
  }

  if (dropFirst && categories.length > 0) {
    categories = categories.slice(1);
  }

  const newFeatures: string[] = categories.map(cat => `${column}_${sanitizeForColumnName(cat)}`);
  const newHeaders = [...dataset.headers, ...newFeatures];

  const newRows = dataset.rows.map(row => {
    const newRow = { ...row };
    const value = row[column];
    const valueStr = value !== null && value !== undefined ? String(value) : null;

    categories.forEach(cat => {
      const featureName = `${column}_${sanitizeForColumnName(cat)}`;
      if (valueStr === cat) {
        newRow[featureName] = 1;
      } else if (categories.includes(valueStr ?? '')) {
        newRow[featureName] = 0;
      } else {
        // Unknown category
        newRow[featureName] = handleUnknown === 'error' ? -1 : 0;
      }
    });

    return newRow;
  });

  return {
    dataset: { headers: newHeaders, rows: newRows },
    newFeatures,
    categories,
  };
}

/**
 * Target encode a categorical column
 */
export function targetEncode(
  dataset: Dataset,
  column: string,
  targetColumn: string,
  options: {
    smoothing?: number;
    minSamples?: number;
  } = {}
): {
  dataset: Dataset;
  newFeature: string;
  encodingMap: Record<string, number>;
} {
  const { smoothing = 1.0, minSamples = 1 } = options;

  // Calculate global mean
  const targetValues = dataset.rows
    .map(row => row[targetColumn])
    .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

  if (targetValues.length === 0) {
    throw new Error('Target column has no valid numeric values');
  }

  const globalMean = targetValues.reduce((a, b) => a + b, 0) / targetValues.length;

  // Calculate category means
  const categoryStats = new Map<string, { sum: number; count: number }>();

  dataset.rows.forEach(row => {
    const value = row[column];
    const target = row[targetColumn];

    if (value !== null && value !== undefined && typeof target === 'number' && !isNaN(target)) {
      const key = String(value);
      const stats = categoryStats.get(key) ?? { sum: 0, count: 0 };
      stats.sum += target;
      stats.count += 1;
      categoryStats.set(key, stats);
    }
  });

  // Calculate smoothed encodings
  const encodingMap: Record<string, number> = {};

  categoryStats.forEach((stats, key) => {
    if (stats.count >= minSamples) {
      const categoryMean = stats.sum / stats.count;
      // Smoothed encoding: weighted average of category mean and global mean
      encodingMap[key] = (stats.count * categoryMean + smoothing * globalMean) / (stats.count + smoothing);
    } else {
      encodingMap[key] = globalMean;
    }
  });

  const newFeature = `${column}_target_encoded`;
  const newHeaders = [...dataset.headers, newFeature];

  const newRows = dataset.rows.map(row => {
    const newRow = { ...row };
    const value = row[column];
    const key = value !== null && value !== undefined ? String(value) : null;

    newRow[newFeature] = key !== null && encodingMap[key] !== undefined
      ? encodingMap[key]
      : globalMean;

    return newRow;
  });

  return {
    dataset: { headers: newHeaders, rows: newRows },
    newFeature,
    encodingMap,
  };
}

/**
 * Label encode a categorical column
 */
export function labelEncode(
  dataset: Dataset,
  column: string
): {
  dataset: Dataset;
  encodingMap: Record<string, number>;
} {
  // Find unique values
  const uniqueValues = new Set<string>();
  dataset.rows.forEach(row => {
    const value = row[column];
    if (value !== null && value !== undefined) {
      uniqueValues.add(String(value));
    }
  });

  // Create encoding map
  const categories = Array.from(uniqueValues).sort();
  const encodingMap: Record<string, number> = {};
  categories.forEach((cat, idx) => {
    encodingMap[cat] = idx;
  });

  const newRows = dataset.rows.map(row => {
    const newRow = { ...row };
    const value = row[column];
    const key = value !== null && value !== undefined ? String(value) : null;
    newRow[column] = key !== null ? (encodingMap[key] ?? 0) : 0;
    return newRow;
  });

  return {
    dataset: { headers: dataset.headers, rows: newRows },
    encodingMap,
  };
}

/**
 * Scale numerical features
 */
export function scaleFeatures(
  dataset: Dataset,
  columns: string[],
  method: 'standard' | 'minmax' = 'standard'
): {
  dataset: Dataset;
  scalerParams: Record<string, { mean?: number; std?: number; min?: number; max?: number }>;
} {
  const scalerParams: Record<string, { mean?: number; std?: number; min?: number; max?: number }> = {};

  // Calculate parameters for each column
  columns.forEach(column => {
    const values = dataset.rows
      .map(row => row[column])
      .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

    if (values.length === 0) return;

    if (method === 'standard') {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const std = Math.sqrt(variance) || 1; // Avoid division by zero
      scalerParams[column] = { mean, std };
    } else {
      const min = Math.min(...values);
      const max = Math.max(...values);
      scalerParams[column] = { min, max };
    }
  });

  // Apply scaling
  const newRows = dataset.rows.map(row => {
    const newRow = { ...row };

    columns.forEach(column => {
      const value = row[column];
      if (typeof value !== 'number' || isNaN(value)) {
        return;
      }

      const params = scalerParams[column];
      if (!params) return;

      if (method === 'standard') {
        newRow[column] = (value - (params.mean ?? 0)) / (params.std ?? 1);
      } else {
        const range = (params.max ?? 0) - (params.min ?? 0) || 1;
        newRow[column] = (value - (params.min ?? 0)) / range;
      }
    });

    return newRow;
  });

  return {
    dataset: { headers: dataset.headers, rows: newRows },
    scalerParams,
  };
}

/**
 * Create interaction features
 */
export function createInteractionFeatures(
  dataset: Dataset,
  columnPairs: Array<[string, string]>,
  operations: Array<'multiply' | 'add' | 'subtract' | 'divide'> = ['multiply']
): { dataset: Dataset; newFeatures: string[] } {
  const newFeatures: string[] = [];
  const newHeaders = [...dataset.headers];

  columnPairs.forEach(([col1, col2]) => {
    operations.forEach(op => {
      const featureName = `${col1}_${op}_${col2}`;
      newHeaders.push(featureName);
      newFeatures.push(featureName);
    });
  });

  const newRows = dataset.rows.map(row => {
    const newRow = { ...row };

    columnPairs.forEach(([col1, col2]) => {
      const val1 = row[col1];
      const val2 = row[col2];

      operations.forEach(op => {
        const featureName = `${col1}_${op}_${col2}`;

        if (typeof val1 !== 'number' || typeof val2 !== 'number' || isNaN(val1) || isNaN(val2)) {
          newRow[featureName] = null;
          return;
        }

        switch (op) {
          case 'multiply':
            newRow[featureName] = val1 * val2;
            break;
          case 'add':
            newRow[featureName] = val1 + val2;
            break;
          case 'subtract':
            newRow[featureName] = val1 - val2;
            break;
          case 'divide':
            newRow[featureName] = val2 !== 0 ? val1 / val2 : null;
            break;
        }
      });
    });

    return newRow;
  });

  return {
    dataset: { headers: newHeaders, rows: newRows },
    newFeatures,
  };
}

/**
 * Select features based on correlation with target
 */
export function selectFeaturesByCorrelation(
  dataset: Dataset,
  targetColumn: string,
  options: {
    minCorrelation?: number;
    maxFeatures?: number;
    removeCorrelated?: boolean;
    correlationThreshold?: number;
  } = {}
): { selectedFeatures: string[]; correlations: Record<string, number> } {
  const {
    minCorrelation = 0.05,
    maxFeatures = 50,
    removeCorrelated = true,
    correlationThreshold = 0.95,
  } = options;

  const correlations: Record<string, number> = {};
  const targetValues = dataset.rows.map(row => row[targetColumn]);

  // Calculate correlation with target for each feature
  dataset.headers.forEach(header => {
    if (header === targetColumn) return;

    const values = dataset.rows.map(row => row[header]);
    const corr = calculateCorrelation(values, targetValues);
    if (corr !== null) {
      correlations[header] = corr;
    }
  });

  // Sort by absolute correlation
  const sortedFeatures = Object.entries(correlations)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .filter(([, corr]) => Math.abs(corr) >= minCorrelation)
    .map(([feature]) => feature);

  // Remove highly correlated features
  let selectedFeatures = sortedFeatures;

  if (removeCorrelated && sortedFeatures.length > 1) {
    const toRemove = new Set<string>();

    for (let i = 0; i < sortedFeatures.length; i++) {
      if (toRemove.has(sortedFeatures[i])) continue;

      for (let j = i + 1; j < sortedFeatures.length; j++) {
        if (toRemove.has(sortedFeatures[j])) continue;

        const values1 = dataset.rows.map(row => row[sortedFeatures[i]]);
        const values2 = dataset.rows.map(row => row[sortedFeatures[j]]);
        const corr = calculateCorrelation(values1, values2);

        if (corr !== null && Math.abs(corr) >= correlationThreshold) {
          // Remove the one with lower correlation to target
          if (Math.abs(correlations[sortedFeatures[i]]) >= Math.abs(correlations[sortedFeatures[j]])) {
            toRemove.add(sortedFeatures[j]);
          } else {
            toRemove.add(sortedFeatures[i]);
            break;
          }
        }
      }
    }

    selectedFeatures = sortedFeatures.filter(f => !toRemove.has(f));
  }

  // Limit number of features
  selectedFeatures = selectedFeatures.slice(0, maxFeatures);

  return { selectedFeatures, correlations };
}

/**
 * Calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: unknown[], y: unknown[]): number | null {
  const pairs: Array<[number, number]> = [];

  for (let i = 0; i < x.length; i++) {
    const xVal = x[i];
    const yVal = y[i];

    if (typeof xVal === 'number' && !isNaN(xVal) &&
        typeof yVal === 'number' && !isNaN(yVal)) {
      pairs.push([xVal, yVal]);
    }
  }

  if (pairs.length < 3) return null;

  const n = pairs.length;
  const sumX = pairs.reduce((sum, [x]) => sum + x, 0);
  const sumY = pairs.reduce((sum, [, y]) => sum + y, 0);
  const sumXY = pairs.reduce((sum, [x, y]) => sum + x * y, 0);
  const sumX2 = pairs.reduce((sum, [x]) => sum + x * x, 0);
  const sumY2 = pairs.reduce((sum, [, y]) => sum + y * y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;

  return numerator / denominator;
}

/**
 * Sanitize a string for use as a column name
 */
function sanitizeForColumnName(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[0-9]/, '_$&')
    .replace(/_+/g, '_')
    .toLowerCase();
}

/**
 * Apply full feature engineering pipeline
 */
export function applyFeatureEngineering(
  dataset: Dataset,
  config: FeatureEngineeringConfig,
  targetColumn?: string
): {
  dataset: Dataset;
  engineeredFeatures: EngineeredFeatures;
  transformations: Record<string, Record<string, unknown>>;
} {
  let result = { ...dataset, rows: [...dataset.rows] };
  const newFeatures: string[] = [];
  const transformations: Record<string, Record<string, unknown>> = {};

  // Datetime extraction
  if (config.datetimeExtraction) {
    for (const column of config.datetimeExtraction) {
      const { dataset: newDataset, newFeatures: features } = extractDatetimeFeatures(result, column);
      result = newDataset;
      newFeatures.push(...features);
      transformations[column] = { type: 'datetime_extraction', features };
    }
  }

  // One-hot encoding
  if (config.oneHotEncode) {
    for (const column of config.oneHotEncode) {
      const { dataset: newDataset, newFeatures: features, categories } = oneHotEncode(result, column);
      result = newDataset;
      newFeatures.push(...features);
      transformations[column] = { type: 'one_hot_encode', categories };
    }
  }

  // Target encoding
  if (config.targetEncode && targetColumn) {
    for (const column of config.targetEncode) {
      const { dataset: newDataset, newFeature, encodingMap } = targetEncode(result, column, targetColumn);
      result = newDataset;
      newFeatures.push(newFeature);
      transformations[column] = { type: 'target_encode', encodingMap };
    }
  }

  // Feature scaling
  if (config.scaleMethod && config.scaleMethod !== 'none') {
    const numericalColumns = result.headers.filter(h => {
      const values = result.rows.map(row => row[h]);
      return values.some(v => typeof v === 'number' && !isNaN(v));
    });

    const { dataset: newDataset, scalerParams } = scaleFeatures(result, numericalColumns, config.scaleMethod);
    result = newDataset;
    transformations['_scaling'] = { type: config.scaleMethod, params: scalerParams };
  }

  return {
    dataset: result,
    engineeredFeatures: {
      originalFeatures: dataset.headers,
      newFeatures,
      transformations: Object.fromEntries(
        Object.entries(transformations).map(([k, v]) => [k, JSON.stringify(v)])
      ),
    },
    transformations,
  };
}
