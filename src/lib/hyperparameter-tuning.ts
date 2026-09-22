/**
 * Hyperparameter Tuning Module for ChurnGuard AI
 * Provides grid search and random search optimization.
 *
 * Fixes applied:
 *  - P0: Replaced biased `sort(() => Math.random() - 0.5)` shuffle with
 *        seeded Fisher-Yates shuffle. Old version did NOT produce a uniform
 *        permutation, and was non-reproducible.
 *  - P1: Removed misleading `bayesianOptimization` export (it was just
 *        random search). Now named `randomSearchWithRanges` and honest.
 *  - P3: Added a hard cap on grid-search combinations to prevent users
 *        from kicking off thousands of trainings in the browser.
 *  - Bonus: `null` values now pass through (needed for `maxDepth: null`).
 *  - Bonus: All randomness is driven by a single seed for reproducibility.
 */

import type { HyperparameterTuningResult, ModelMetrics } from '@shared/types';

export interface ParameterGrid {
  [paramName: string]: (number | string | boolean | null)[];
}

type ParamValue = number | null;
type Params = Record<string, ParamValue>;

type TrainAndEvaluateFn = (
  XTrain: number[][],
  yTrain: number[],
  XVal: number[][],
  yVal: number[],
  params: Params
) => ModelMetrics;

interface CVResult {
  params: Params;
  meanScore: number;
  stdScore: number;
  foldScores: number[];
}

// ----------------------------------------------------------------------------
// Seeded PRNG + Fisher-Yates shuffle
// ----------------------------------------------------------------------------

/**
 * Mulberry32 — tiny, fast, decent-quality 32-bit PRNG.
 * Seeded so the same `randomState` gives the same split every run.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * P0 FIX — Fisher-Yates (Knuth) shuffle.
 * The previous `sort(() => Math.random() - 0.5)` produces a biased,
 * non-uniform permutation. This is the correct O(n) algorithm.
 */
function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ----------------------------------------------------------------------------
// Parameter value coercion
// ----------------------------------------------------------------------------

/**
 * P1/P3 FIX — Allow `null` to survive coercion.
 * The old code did `parseFloat(String(null)) || 0`, turning `null` into 0,
 * which silently broke `maxDepth: null` (unlimited depth in RF).
 */
function coerceParam(v: number | string | boolean | null): ParamValue {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const parsed = parseFloat(v);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ----------------------------------------------------------------------------
// Combination counting & limiting
// ----------------------------------------------------------------------------

function countCombinations(grid: ParameterGrid): number {
  const keys = Object.keys(grid);
  if (keys.length === 0) return 1;
  return keys.reduce((acc, k) => acc * Math.max(1, grid[k].length), 1);
}

const DEFAULT_MAX_COMBINATIONS = 200;

// ----------------------------------------------------------------------------
// Grid search
// ----------------------------------------------------------------------------

export function gridSearch(
  X: number[][],
  y: number[],
  paramGrid: ParameterGrid,
  trainAndEvaluateFn: TrainAndEvaluateFn,
  options: {
    cvFolds?: number;
    scoring?: 'accuracy' | 'f1' | 'rocAuc' | 'recall' | 'precision';
    randomState?: number;
    maxCombinations?: number;
    verbose?: boolean;
  } = {}
): HyperparameterTuningResult {
  const {
    cvFolds = 5,
    scoring = 'f1',
    randomState = 42,
    maxCombinations = DEFAULT_MAX_COMBINATIONS,
    verbose = false,
  } = options;

  let paramCombinations = generateParamCombinations(paramGrid);
  const totalCombos = paramCombinations.length;

  // P3 FIX — Hard cap. Otherwise an RF grid like 3×5×3×3 = 135 combos
  // × 5 folds = 675 fits, which will freeze the worker for hours.
  if (totalCombos > maxCombinations) {
    const rand = mulberry32(randomState);
    paramCombinations = seededShuffle(paramCombinations, rand).slice(0, maxCombinations);
    console.warn(
      `[gridSearch] Grid had ${totalCombos} combinations; subsampled to ${maxCombinations}. ` +
      `Use randomSearch for a more principled exploration.`
    );
  }

  if (verbose) {
    console.log(`[gridSearch] Evaluating ${paramCombinations.length} combinations (cv=${cvFolds})`);
  }

  const rand = mulberry32(randomState);
  const allResults: CVResult[] = [];

  for (const params of paramCombinations) {
    const result = evaluateWithCV(X, y, params, trainAndEvaluateFn, cvFolds, scoring, rand);
    allResults.push(result);

    if (verbose) {
      console.log(
        `Params: ${JSON.stringify(params)} → ${result.meanScore.toFixed(4)} (±${result.stdScore.toFixed(4)})`
      );
    }
  }

  const best = allResults.reduce((prev, curr) => (curr.meanScore > prev.meanScore ? curr : prev));

  return {
    bestParams: best.params as Record<string, number>,
    bestScore: best.meanScore,
    allResults: allResults.map((r) => ({
      params: r.params as Record<string, number>,
      score: r.meanScore,
      std: r.stdScore,
    })),
  };
}

// ----------------------------------------------------------------------------
// Random search
// ----------------------------------------------------------------------------

export function randomSearch(
  X: number[][],
  y: number[],
  paramDistributions: ParameterGrid,
  trainAndEvaluateFn: TrainAndEvaluateFn,
  options: {
    nIter?: number;
    cvFolds?: number;
    scoring?: 'accuracy' | 'f1' | 'rocAuc' | 'recall' | 'precision';
    randomState?: number;
    verbose?: boolean;
  } = {}
): HyperparameterTuningResult {
  const { nIter = 10, cvFolds = 5, scoring = 'f1', randomState = 42, verbose = false } = options;

  const rand = mulberry32(randomState);
  const paramCombinations = generateRandomParamCombinations(paramDistributions, nIter, rand);

  if (verbose) console.log(`[randomSearch] Evaluating ${paramCombinations.length} combinations`);

  const allResults: CVResult[] = [];
  for (const params of paramCombinations) {
    const result = evaluateWithCV(X, y, params, trainAndEvaluateFn, cvFolds, scoring, rand);
    allResults.push(result);

    if (verbose) {
      console.log(
        `Params: ${JSON.stringify(params)} → ${result.meanScore.toFixed(4)} (±${result.stdScore.toFixed(4)})`
      );
    }
  }

  const best = allResults.reduce((prev, curr) => (curr.meanScore > prev.meanScore ? curr : prev));

  return {
    bestParams: best.params as Record<string, number>,
    bestScore: best.meanScore,
    allResults: allResults.map((r) => ({
      params: r.params as Record<string, number>,
      score: r.meanScore,
      std: r.stdScore,
    })),
  };
}

// ----------------------------------------------------------------------------
// Combination generators
// ----------------------------------------------------------------------------

function generateParamCombinations(paramGrid: ParameterGrid): Params[] {
  const keys = Object.keys(paramGrid);
  if (keys.length === 0) return [{}];

  const combinations: Params[] = [];
  const values = keys.map((k) => paramGrid[k]);
  const indices = new Array(keys.length).fill(0);

  // Cartesian product
  while (true) {
    const combo: Params = {};
    for (let i = 0; i < keys.length; i++) {
      combo[keys[i]] = coerceParam(values[i][indices[i]]);
    }
    combinations.push(combo);

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

function generateRandomParamCombinations(
  paramDistributions: ParameterGrid,
  nIter: number,
  rand: () => number
): Params[] {
  const keys = Object.keys(paramDistributions);
  const combinations: Params[] = [];

  for (let i = 0; i < nIter; i++) {
    const combo: Params = {};
    for (const key of keys) {
      const values = paramDistributions[key];
      const idx = Math.floor(rand() * values.length);
      combo[key] = coerceParam(values[idx]);
    }
    combinations.push(combo);
  }

  return combinations;
}

// ----------------------------------------------------------------------------
// Cross-validation
// ----------------------------------------------------------------------------

function evaluateWithCV(
  X: number[][],
  y: number[],
  params: Params,
  trainAndEvaluateFn: TrainAndEvaluateFn,
  cvFolds: number,
  scoring: string,
  rand: () => number
): CVResult {
  const class0: number[] = [];
  const class1: number[] = [];
  y.forEach((label, idx) => (label === 0 ? class0 : class1).push(idx));

  // P0 FIX — Seeded Fisher-Yates instead of the biased `.sort(() => rand-0.5)`
  const shuffled0 = seededShuffle(class0, rand);
  const shuffled1 = seededShuffle(class1, rand);

  const folds: number[][] = Array.from({ length: cvFolds }, () => []);
  shuffled0.forEach((idx, i) => folds[i % cvFolds].push(idx));
  shuffled1.forEach((idx, i) => folds[i % cvFolds].push(idx));

  const foldScores: number[] = [];

  for (let f = 0; f < cvFolds; f++) {
    const valIndices = folds[f];
    const trainIndices: number[] = [];
    for (let k = 0; k < cvFolds; k++) {
      if (k !== f) trainIndices.push(...folds[k]);
    }

    // Guard: a fold might be empty if a class is tiny
    if (trainIndices.length === 0 || valIndices.length === 0) continue;

    const XTrain = trainIndices.map((i) => X[i]);
    const yTrain = trainIndices.map((i) => y[i]);
    const XVal = valIndices.map((i) => X[i]);
    const yVal = valIndices.map((i) => y[i]);

    // Guard: yVal must have both classes for metrics like rocAuc
    const hasBothClasses = new Set(yVal).size > 1;
    if (!hasBothClasses) continue;

    const metrics = trainAndEvaluateFn(XTrain, yTrain, XVal, yVal, params);
    foldScores.push(getScore(metrics, scoring));
  }

  const meanScore =
    foldScores.length > 0 ? foldScores.reduce((a, b) => a + b, 0) / foldScores.length : 0;
  const stdScore =
    foldScores.length > 0
      ? Math.sqrt(
        foldScores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0) / foldScores.length
      )
      : 0;

  return { params, meanScore, stdScore, foldScores };
}

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

// ----------------------------------------------------------------------------
// Default grids
// ----------------------------------------------------------------------------

export function getDefaultGBDTGrid(): ParameterGrid {
  return {
    nEstimators: [50, 100, 200],
    maxDepth: [3, 5, 7, 10],
    learningRate: [0.01, 0.05, 0.1, 0.2],
  };
}

export function getDefaultRandomForestGrid(): ParameterGrid {
  return {
    nEstimators: [50, 100, 200],
    maxDepth: [5, 10, 15, 20, null], // `null` now survives coercion
    minSamplesSplit: [2, 5, 10],
    minSamplesLeaf: [1, 2, 4],
  };
}

// ----------------------------------------------------------------------------
// Ranges → random search (formerly misnamed "bayesianOptimization")
// ----------------------------------------------------------------------------

/**
 * P1 FIX — Renamed from `bayesianOptimization`. It was never Bayesian; it
 * was random search over a discretized range grid. Now the name matches
 * reality. If you later want real Bayesian optimization, drop in
 * `ml-gaussian-process` and build an Expected-Improvement loop on top of
 * `randomSearchWithRanges`.
 */
export function randomSearchWithRanges(
  X: number[][],
  y: number[],
  paramRanges: Record<string, { min: number; max: number; steps?: number }>,
  trainAndEvaluateFn: TrainAndEvaluateFn,
  options: {
    nIter?: number;
    cvFolds?: number;
    scoring?: 'accuracy' | 'f1' | 'rocAuc';
    randomState?: number;
    verbose?: boolean;
  } = {}
): HyperparameterTuningResult {
  const { nIter = 15, cvFolds = 5, scoring = 'f1', randomState = 42, verbose = false } = options;

  const paramGrid: ParameterGrid = {};
  for (const [key, range] of Object.entries(paramRanges)) {
    const steps = range.steps ?? 10;
    const values: number[] = [];
    const step = (range.max - range.min) / steps;
    for (let i = 0; i <= steps; i++) {
      values.push(Math.round((range.min + i * step) * 1000) / 1000);
    }
    paramGrid[key] = values;
  }

  return randomSearch(X, y, paramGrid, trainAndEvaluateFn, {
    nIter,
    cvFolds,
    scoring,
    randomState,
    verbose,
  });
}

// ----------------------------------------------------------------------------
// Early stopping
// ----------------------------------------------------------------------------

export class EarlyStoppingCallback {
  private bestScore = -Infinity;
  private noImprovementCount = 0;
  private readonly patience: number;
  private readonly minDelta: number;

  constructor(patience = 10, minDelta = 0.001) {
    this.patience = patience;
    this.minDelta = minDelta;
  }

  shouldStop(currentScore: number): boolean {
    if (currentScore > this.bestScore + this.minDelta) {
      this.bestScore = currentScore;
      this.noImprovementCount = 0;
      return false;
    }
    this.noImprovementCount++;
    return this.noImprovementCount >= this.patience;
  }

  getBestScore(): number {
    return this.bestScore;
  }
}