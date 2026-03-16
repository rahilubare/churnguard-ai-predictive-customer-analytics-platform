/**
 * Model Validation and Drift Detection Module for ChurnGuard AI
 * Provides model validation, sanity checks, and drift detection utilities
 */

import type { ModelArtifact, ModelMetrics, Dataset } from '@shared/types';

/**
 * Model validation result
 */
export interface ModelValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checks: ValidationCheck[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Drift detection result
 */
export interface DriftDetectionResult {
  hasDrift: boolean;
  driftScore: number;
  featureDrift: Record<string, FeatureDriftInfo>;
  recommendation: string;
}

export interface FeatureDriftInfo {
  name: string;
  driftScore: number;
  hasSignificantDrift: boolean;
  originalDistribution: DistributionStats;
  newDistribution: DistributionStats;
}

export interface DistributionStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  uniqueCount: number;
  missingRate: number;
}

/**
 * Validate a model artifact for integrity and completeness
 */
export function validateModelArtifact(model: unknown): ModelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: ValidationCheck[] = [];

  // Basic type check
  if (typeof model !== 'object' || model === null) {
    errors.push('Model must be an object');
    return { isValid: false, errors, warnings, checks };
  }

  const m = model as Record<string, unknown>;

  // Check required fields
  const requiredFields = ['id', 'orgId', 'name', 'createdAt', 'modelJson'];
  for (const field of requiredFields) {
    const passed = m[field] !== undefined && m[field] !== null;
    checks.push({
      name: `Required field: ${field}`,
      passed,
      message: passed ? `${field} is present` : `${field} is missing`,
    });
    if (!passed) {
      errors.push(`Required field '${field}' is missing`);
    }
  }

  // Validate ID format
  if (typeof m.id === 'string') {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const passed = uuidPattern.test(m.id);
    checks.push({
      name: 'ID format',
      passed,
      message: passed ? 'ID is valid UUID' : 'ID is not a valid UUID',
    });
  }

  // Validate createdAt
  if (typeof m.createdAt === 'number') {
    const date = new Date(m.createdAt);
    const passed = !isNaN(date.getTime()) && date.getTime() > 0;
    checks.push({
      name: 'Creation timestamp',
      passed,
      message: passed ? 'Valid creation timestamp' : 'Invalid creation timestamp',
    });
  }

  // Validate model JSON
  if (typeof m.modelJson === 'string') {
    try {
      const parsed = JSON.parse(m.modelJson);
      const passed = typeof parsed === 'object' && parsed !== null;
      checks.push({
        name: 'Model JSON',
        passed,
        message: passed ? 'Model JSON is valid' : 'Model JSON is not a valid object',
        details: { keys: Object.keys(parsed) },
      });
    } catch (e) {
      checks.push({
        name: 'Model JSON',
        passed: false,
        message: 'Model JSON is not valid JSON',
      });
      errors.push('Model JSON cannot be parsed');
    }
  }

  // Validate features array
  if (Array.isArray(m.features)) {
    const passed = m.features.length > 0 && m.features.every(f => typeof f === 'string');
    checks.push({
      name: 'Features array',
      passed,
      message: passed 
        ? `Features array has ${m.features.length} valid features`
        : 'Features array is empty or contains non-string values',
    });
    if (!passed && m.features.length === 0) {
      warnings.push('Features array is empty');
    }
  }

  // Validate performance metrics
  if (typeof m.performance === 'object' && m.performance !== null) {
    const perf = m.performance as Record<string, unknown>;
    const metricFields = ['accuracy', 'precision', 'recall', 'f1', 'rocAuc'];
    let validMetrics = true;
    
    for (const field of metricFields) {
      if (typeof perf[field] !== 'number' || isNaN(perf[field] as number)) {
        validMetrics = false;
      }
    }
    
    checks.push({
      name: 'Performance metrics',
      passed: validMetrics,
      message: validMetrics 
        ? 'All performance metrics are valid numbers'
        : 'Some performance metrics are missing or invalid',
    });
  }

  // Validate encoding map
  if (typeof m.encodingMap === 'object' && m.encodingMap !== null) {
    const encodingMap = m.encodingMap as Record<string, unknown>;
    const passed = Object.values(encodingMap).every(
      v => typeof v === 'object' && v !== null
    );
    checks.push({
      name: 'Encoding map',
      passed,
      message: passed 
        ? 'Encoding map is valid'
        : 'Encoding map contains invalid entries',
    });
  }

  // Check model age
  if (typeof m.createdAt === 'number') {
    const ageMs = Date.now() - m.createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    if (ageDays > 90) {
      warnings.push(`Model is ${Math.floor(ageDays)} days old. Consider retraining for optimal performance.`);
    } else if (ageDays > 30) {
      warnings.push(`Model is ${Math.floor(ageDays)} days old. Monitor for drift.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    checks,
  };
}

/**
 * Validate prediction sanity
 */
export function validatePredictionSanity(
  prediction: { churnProbability: number; prediction: number },
  model: ModelArtifact
): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check probability bounds
  if (prediction.churnProbability < 0 || prediction.churnProbability > 1) {
    return { isValid: false, warnings: ['Probability out of bounds [0, 1]'] };
  }

  // Check prediction consistency
  const expectedPrediction = prediction.churnProbability > 0.5 ? 1 : 0;
  if (prediction.prediction !== expectedPrediction) {
    warnings.push(
      `Prediction (${prediction.prediction}) doesn't match probability threshold (${prediction.churnProbability.toFixed(3)})`
    );
  }

  // Check for extreme probabilities
  if (prediction.churnProbability > 0.99 || prediction.churnProbability < 0.01) {
    warnings.push('Extreme probability detected. Verify input data quality.');
  }

  // Check model age
  const modelAge = Date.now() - model.createdAt;
  const ageDays = modelAge / (1000 * 60 * 60 * 24);
  if (ageDays > 60) {
    warnings.push(`Model is ${Math.floor(ageDays)} days old. Predictions may be less reliable.`);
  }

  return { isValid: true, warnings };
}

/**
 * Detect data drift between training and new data
 */
export function detectDataDrift(
  trainingData: Dataset,
  newData: Dataset,
  options: {
    threshold?: number;
    features?: string[];
  } = {}
): DriftDetectionResult {
  const { threshold = 0.1, features } = options;
  
  // Use common features or specified features
  const commonFeatures = features ?? trainingData.headers.filter(h => newData.headers.includes(h));
  
  const featureDrift: Record<string, FeatureDriftInfo> = {};
  let totalDriftScore = 0;

  for (const feature of commonFeatures) {
    const originalStats = calculateDistributionStats(trainingData, feature);
    const newStats = calculateDistributionStats(newData, feature);
    
    // Calculate drift score using Population Stability Index (PSI) simplified
    const driftScore = calculatePSI(originalStats, newStats);
    
    featureDrift[feature] = {
      name: feature,
      driftScore,
      hasSignificantDrift: driftScore > threshold,
      originalDistribution: originalStats,
      newDistribution: newStats,
    };
    
    totalDriftScore += driftScore;
  }

  const avgDriftScore = totalDriftScore / commonFeatures.length;
  const hasDrift = avgDriftScore > threshold;

  let recommendation: string;
  if (avgDriftScore > 0.25) {
    recommendation = 'Severe drift detected. Immediate model retraining is strongly recommended.';
  } else if (avgDriftScore > 0.1) {
    recommendation = 'Moderate drift detected. Consider retraining the model soon.';
  } else if (avgDriftScore > 0.05) {
    recommendation = 'Slight drift detected. Monitor the model performance closely.';
  } else {
    recommendation = 'No significant drift detected. Model performance should be stable.';
  }

  return {
    hasDrift,
    driftScore: avgDriftScore,
    featureDrift,
    recommendation,
  };
}

/**
 * Calculate distribution statistics for a feature
 */
function calculateDistributionStats(dataset: Dataset, feature: string): DistributionStats {
  const values = dataset.rows
    .map(row => row[feature])
    .filter(v => v !== null && v !== undefined && v !== '');

  const numericValues = values
    .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

  if (numericValues.length === 0) {
    return {
      mean: 0,
      std: 0,
      min: 0,
      max: 0,
      uniqueCount: new Set(values.map(String)).size,
      missingRate: (dataset.rows.length - values.length) / dataset.rows.length,
    };
  }

  const mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
  const variance = numericValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / numericValues.length;
  const std = Math.sqrt(variance);

  return {
    mean,
    std,
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
    uniqueCount: new Set(numericValues).size,
    missingRate: (dataset.rows.length - values.length) / dataset.rows.length,
  };
}

/**
 * Calculate Population Stability Index (PSI) simplified
 */
function calculatePSI(expected: DistributionStats, actual: DistributionStats): number {
  // Simplified PSI based on distribution statistics
  let psi = 0;

  // Mean shift
  if (expected.std > 0) {
    const meanShift = Math.abs(expected.mean - actual.mean) / expected.std;
    psi += Math.min(meanShift, 1);
  }

  // Variance shift
  if (expected.std > 0 && actual.std > 0) {
    const varianceRatio = Math.log(actual.std / expected.std);
    psi += Math.abs(varianceRatio) * 0.5;
  }

  // Missing rate shift
  const missingShift = Math.abs(expected.missingRate - actual.missingRate);
  psi += missingShift;

  return psi / 3; // Normalize
}

/**
 * Compare two models
 */
export function compareModels(
  modelA: ModelArtifact,
  modelB: ModelArtifact
): {
  winner: 'A' | 'B' | 'tie';
  metricComparison: Record<string, { modelA: number; modelB: number; difference: number; better: 'A' | 'B' | 'tie' }>;
  overallScore: { modelA: number; modelB: number };
} {
  const metrics: (keyof ModelMetrics)[] = ['accuracy', 'precision', 'recall', 'f1', 'rocAuc'];
  const metricComparison: Record<string, { modelA: number; modelB: number; difference: number; better: 'A' | 'B' | 'tie' }> = {};

  let scoreA = 0;
  let scoreB = 0;

  for (const metric of metrics) {
    const valueA = modelA.performance[metric];
    const valueB = modelB.performance[metric];
    const difference = valueA - valueB;

    let better: 'A' | 'B' | 'tie';
    if (Math.abs(difference) < 0.01) {
      better = 'tie';
    } else if (difference > 0) {
      better = 'A';
      scoreA++;
    } else {
      better = 'B';
      scoreB++;
    }

    metricComparison[metric] = {
      modelA: valueA,
      modelB: valueB,
      difference,
      better,
    };
  }

  let winner: 'A' | 'B' | 'tie';
  if (scoreA > scoreB) {
    winner = 'A';
  } else if (scoreB > scoreA) {
    winner = 'B';
  } else {
    winner = 'tie';
  }

  return {
    winner,
    metricComparison,
    overallScore: { modelA: scoreA, modelB: scoreB },
  };
}

/**
 * Generate a model health report
 */
export function generateModelHealthReport(
  model: ModelArtifact,
  recentPredictions?: Array<{ churnProbability: number; prediction: number }>
): {
  overallHealth: 'healthy' | 'warning' | 'critical';
  checks: Array<{ name: string; status: 'pass' | 'warning' | 'fail'; message: string }>;
  recommendations: string[];
} {
  const checks: Array<{ name: string; status: 'pass' | 'warning' | 'fail'; message: string }> = [];
  const recommendations: string[] = [];

  // Model age check
  const ageDays = (Date.now() - model.createdAt) / (1000 * 60 * 60 * 24);
  if (ageDays > 90) {
    checks.push({
      name: 'Model Age',
      status: 'fail',
      message: `Model is ${Math.floor(ageDays)} days old`,
    });
    recommendations.push('Retrain the model immediately');
  } else if (ageDays > 60) {
    checks.push({
      name: 'Model Age',
      status: 'warning',
      message: `Model is ${Math.floor(ageDays)} days old`,
    });
    recommendations.push('Schedule model retraining soon');
  } else {
    checks.push({
      name: 'Model Age',
      status: 'pass',
      message: `Model is ${Math.floor(ageDays)} days old`,
    });
  }

  // Performance check
  if (model.performance.rocAuc < 0.6) {
    checks.push({
      name: 'Model Performance',
      status: 'fail',
      message: `ROC-AUC is ${model.performance.rocAuc.toFixed(3)} (poor)`,
    });
    recommendations.push('Model performance is poor. Investigate data quality and features.');
  } else if (model.performance.rocAuc < 0.7) {
    checks.push({
      name: 'Model Performance',
      status: 'warning',
      message: `ROC-AUC is ${model.performance.rocAuc.toFixed(3)} (fair)`,
    });
    recommendations.push('Consider feature engineering or collecting more data.');
  } else {
    checks.push({
      name: 'Model Performance',
      status: 'pass',
      message: `ROC-AUC is ${model.performance.rocAuc.toFixed(3)} (good)`,
    });
  }

  // Feature count check
  if (model.features.length < 3) {
    checks.push({
      name: 'Feature Count',
      status: 'warning',
      message: `Only ${model.features.length} features`,
    });
    recommendations.push('Consider adding more predictive features.');
  } else if (model.features.length > 50) {
    checks.push({
      name: 'Feature Count',
      status: 'warning',
      message: `${model.features.length} features (high dimensionality)`,
    });
    recommendations.push('Consider feature selection to reduce dimensionality.');
  } else {
    checks.push({
      name: 'Feature Count',
      status: 'pass',
      message: `${model.features.length} features`,
    });
  }

  // Prediction distribution check (if recent predictions available)
  if (recentPredictions && recentPredictions.length > 10) {
    const avgProb = recentPredictions.reduce((sum, p) => sum + p.churnProbability, 0) / recentPredictions.length;
    const churnRate = recentPredictions.filter(p => p.prediction === 1).length / recentPredictions.length;

    if (avgProb < 0.1 || avgProb > 0.9) {
      checks.push({
        name: 'Prediction Distribution',
        status: 'warning',
        message: `Average churn probability is ${avgProb.toFixed(3)}`,
      });
      recommendations.push('Prediction distribution is skewed. Check for data drift.');
    } else {
      checks.push({
        name: 'Prediction Distribution',
        status: 'pass',
        message: `Churn rate: ${(churnRate * 100).toFixed(1)}%`,
      });
    }
  }

  // Determine overall health
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;

  let overallHealth: 'healthy' | 'warning' | 'critical';
  if (failCount > 0) {
    overallHealth = 'critical';
  } else if (warningCount > 1) {
    overallHealth = 'warning';
  } else {
    overallHealth = 'healthy';
  }

  return {
    overallHealth,
    checks,
    recommendations,
  };
}
