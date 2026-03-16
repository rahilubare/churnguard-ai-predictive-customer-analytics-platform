/**
 * Hyperparameter Tuning Module for ChurnGuard AI
 * Provides grid search and random search optimization
 */

import type { HyperparameterConfig, HyperparameterTuningResult, ModelMetrics } from '@shared/types';

/**
 * Parameter grid for tuning
 */
export interface ParameterGrid {
  [paramName: string]: (number | string | boolean)[];
}

/**
 * Training function type
 */
type TrainFunction = (params: Record<string, number>) => {
  metrics: ModelMetrics;
  model: any;
};

/**
 * Cross-validation result for a single parameter set
 */
interface CVResult {
  params: Record<string, number>;
  meanScore: number;
  stdScore: number;
  foldScores: number[];
}

/**
 * Grid search for hyperparameter optimization
 */
export function gridSearch(
  X: number[][],
  y: number[],
  paramGrid: ParameterGrid,
  trainAndEvaluateFn: (
    XTrain: number[][],
    yTrain: number[],
    XVal: number[][],
    yVal: number[],
    params: Record<string, number>
  ) => ModelMetrics,
  options: {
    cvFolds?: number;
    scoring?: 'accuracy' | 'f1' | 'rocAuc' | 'recall' | 'precision';
    nJobs?: number;
    verbose?: boolean;
  } = {}
): HyperparameterTuningResult {
  const { cvFolds = 5, scoring = 'f1', verbose = false } = options;

  // Generate all parameter combinations
  const paramCombinations = generateParamCombinations(paramGrid);
  
  if (verbose) {
    console.log(`Grid search: evaluating ${paramCombinations.length} parameter combinations`);
  }

  const allResults: CVResult[] = [];

  // Evaluate each parameter combination
  for (const params of paramCombinations) {
    const result = evaluateWithCV(X, y, params, trainAndEvaluateFn, cvFolds, scoring);
    allResults.push(result);

    if (verbose) {
      console.log(`Params: ${JSON.stringify(params)}, Score: ${result.meanScore.toFixed(4)} (+/- ${result.stdScore.toFixed(4)})`);
    }
  }

  // Find best parameters
  const best = allResults.reduce((prev, curr) => 
    curr.meanScore > prev.meanScore ? curr : prev
  );

  return {
    bestParams: best.params,
    bestScore: best.meanScore,
    allResults: allResults.map(r => ({
      params: r.params,
      score: r.meanScore,
      std: r.stdScore,
    })),
  };
}

/**
 * Random search for hyperparameter optimization
 */
export function randomSearch(
  X: number[][],
  y: number[],
  paramDistributions: ParameterGrid,
  trainAndEvaluateFn: (
    XTrain: number[][],
    yTrain: number[],
    XVal: number[][],
    yVal: number[],
    params: Record<string, number>
  ) => ModelMetrics,
  options: {
    nIter?: number;
    cvFolds?: number;
    scoring?: 'accuracy' | 'f1' | 'rocAuc' | 'recall' | 'precision';
    randomState?: number;
    verbose?: boolean;
  } = {}
): HyperparameterTuningResult {
  const { 
    nIter = 10, 
    cvFolds = 5, 
    scoring = 'f1', 
    randomState = 42,
    verbose = false 
  } = options;

  // Generate random parameter combinations
  const paramCombinations = generateRandomParamCombinations(paramDistributions, nIter, randomState);

  if (verbose) {
    console.log(`Random search: evaluating ${nIter} parameter combinations`);
  }

  const allResults: CVResult[] = [];

  // Evaluate each parameter combination
  for (const params of paramCombinations) {
    const result = evaluateWithCV(X, y, params, trainAndEvaluateFn, cvFolds, scoring);
    allResults.push(result);

    if (verbose) {
      console.log(`Params: ${JSON.stringify(params)}, Score: ${result.meanScore.toFixed(4)} (+/- ${result.stdScore.toFixed(4)})`);
    }
  }

  // Find best parameters
  const best = allResults.reduce((prev, curr) => 
    curr.meanScore > prev.meanScore ? curr : prev
  );

  return {
    bestParams: best.params,
    bestScore: best.meanScore,
    allResults: allResults.map(r => ({
      params: r.params,
      score: r.meanScore,
      std: r.stdScore,
    })),
  };
}

/**
 * Generate all parameter combinations from grid
 */
function generateParamCombinations(paramGrid: ParameterGrid): Record<string, number>[] {
  const keys = Object.keys(paramGrid);
  
  if (keys.length === 0) {
    return [{}];
  }

  const combinations: Record<string, number>[] = [];
  const values = keys.map(k => paramGrid[k]);

  // Generate Cartesian product
  const indices = new Array(keys.length).fill(0);
  
  while (true) {
    const combo: Record<string, number> = {};
    for (let i = 0; i < keys.length; i++) {
      const val = values[i][indices[i]];
      // Convert to number if possible
      combo[keys[i]] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
    }
    combinations.push(combo);

    // Increment indices
    let i = keys.length - 1;
    while (i >= 0 && indices[i] === values[i].length - 1) {
      indices[i] = 0;
      i--;
    }
    
    if (i < 0) break;
    indices[i]++;
  }

  return combinations;
}

/**
 * Generate random parameter combinations
 */
function generateRandomParamCombinations(
  paramDistributions: ParameterGrid,
  nIter: number,
  randomState: number
): Record<string, number>[] {
  const keys = Object.keys(paramDistributions);
  const combinations: Record<string, number>[] = [];
  
  // Simple seeded random
  let seed = randomState;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let i = 0; i < nIter; i++) {
    const combo: Record<string, number> = {};
    for (const key of keys) {
      const values = paramDistributions[key];
      const idx = Math.floor(random() * values.length);
      const val = values[idx];
      combo[key] = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
    }
    combinations.push(combo);
  }

  return combinations;
}

/**
 * Evaluate parameters with cross-validation
 */
function evaluateWithCV(
  X: number[][],
  y: number[],
  params: Record<string, number>,
  trainAndEvaluateFn: (
    XTrain: number[][],
    yTrain: number[],
    XVal: number[][],
    yVal: number[],
    params: Record<string, number>
  ) => ModelMetrics,
  cvFolds: number,
  scoring: string
): CVResult {
  const n = X.length;
  const foldScores: number[] = [];

  // Create stratified folds
  const class0Indices: number[] = [];
  const class1Indices: number[] = [];
  
  y.forEach((label, idx) => {
    if (label === 0) class0Indices.push(idx);
    else class1Indices.push(idx);
  });

  // Shuffle indices
  const shuffled0 = [...class0Indices].sort(() => Math.random() - 0.5);
  const shuffled1 = [...class1Indices].sort(() => Math.random() - 0.5);

  // Distribute to folds
  const folds: number[][] = Array.from({ length: cvFolds }, () => []);
  shuffled0.forEach((idx, i) => folds[i % cvFolds].push(idx));
  shuffled1.forEach((idx, i) => folds[i % cvFolds].push(idx));

  // Evaluate each fold
  for (let fold = 0; fold < cvFolds; fold++) {
    const valIndices = folds[fold];
    const trainIndices = folds.flatMap((f, i) => i === fold ? [] : f);

    const XTrain = trainIndices.map(i => X[i]);
    const yTrain = trainIndices.map(i => y[i]);
    const XVal = valIndices.map(i => X[i]);
    const yVal = valIndices.map(i => y[i]);

    const metrics = trainAndEvaluateFn(XTrain, yTrain, XVal, yVal, params);
    
    const score = getScore(metrics, scoring);
    foldScores.push(score);
  }

  const meanScore = foldScores.reduce((a, b) => a + b, 0) / foldScores.length;
  const stdScore = Math.sqrt(
    foldScores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0) / foldScores.length
  );

  return {
    params,
    meanScore,
    stdScore,
    foldScores,
  };
}

/**
 * Get score from metrics based on scoring type
 */
function getScore(metrics: ModelMetrics, scoring: string): number {
  switch (scoring) {
    case 'accuracy':
      return metrics.accuracy;
    case 'precision':
      return metrics.precision;
    case 'recall':
      return metrics.recall;
    case 'f1':
      return metrics.f1;
    case 'rocAuc':
      return metrics.rocAuc;
    default:
      return metrics.f1;
  }
}

/**
 * Get default hyperparameter grid for GBDT
 */
export function getDefaultGBDTGrid(): ParameterGrid {
  return {
    nEstimators: [50, 100, 200],
    maxDepth: [3, 5, 7, 10],
    learningRate: [0.01, 0.05, 0.1, 0.2],
  };
}

/**
 * Get default hyperparameter grid for Random Forest
 */
export function getDefaultRandomForestGrid(): ParameterGrid {
  return {
    nEstimators: [50, 100, 200],
    maxDepth: [5, 10, 15, 20, null],
    minSamplesSplit: [2, 5, 10],
    minSamplesLeaf: [1, 2, 4],
  };
}

/**
 * Bayesian optimization placeholder (simplified version)
 * In production, you would use a library like bayesjs
 */
export function bayesianOptimization(
  X: number[][],
  y: number[],
  paramRanges: Record<string, { min: number; max: number }>,
  trainAndEvaluateFn: (
    XTrain: number[][],
    yTrain: number[],
    XVal: number[][],
    yVal: number[],
    params: Record<string, number>
  ) => ModelMetrics,
  options: {
    nIter?: number;
    initPoints?: number;
    scoring?: 'accuracy' | 'f1' | 'rocAuc';
    verbose?: boolean;
  } = {}
): HyperparameterTuningResult {
  const { nIter = 15, initPoints = 5, scoring = 'f1', verbose = false } = options;

  // Simplified: just do random search with better exploration
  const paramGrid: ParameterGrid = {};
  
  for (const [key, range] of Object.entries(paramRanges)) {
    // Generate evenly spaced values
    const values: number[] = [];
    const step = (range.max - range.min) / 10;
    for (let v = range.min; v <= range.max; v += step) {
      values.push(Math.round(v * 100) / 100);
    }
    paramGrid[key] = values;
  }

  return randomSearch(X, y, paramGrid, trainAndEvaluateFn, {
    nIter,
    scoring,
    verbose,
  });
}

/**
 * Early stopping callback for iterative algorithms
 */
export class EarlyStoppingCallback {
  private bestScore: number = -Infinity;
  private noImprovementCount: number = 0;
  private readonly patience: number;
  private readonly minDelta: number;

  constructor(patience: number = 10, minDelta: number = 0.001) {
    this.patience = patience;
    this.minDelta = minDelta;
  }

  /**
   * Check if training should stop
   */
  shouldStop(currentScore: number): boolean {
    if (currentScore > this.bestScore + this.minDelta) {
      this.bestScore = currentScore;
      this.noImprovementCount = 0;
      return false;
    }

    this.noImprovementCount++;
    return this.noImprovementCount >= this.patience;
  }

  /**
   * Get the best score achieved
   */
  getBestScore(): number {
    return this.bestScore;
  }
}
