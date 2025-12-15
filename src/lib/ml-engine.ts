import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import type { Dataset, ModelMetrics } from '@shared/types';
function preprocessData(
  dataset: Dataset,
  targetVariable: string,
  features: string[]
) {
  const { rows } = dataset;
  const y = new Array(rows.length).fill(0);
  const X = new Matrix(rows.length, features.length);
  const encodingMap: Record<string, Record<string, number>> = {};
  features.forEach((feature, colIndex) => {
    const values = rows.map(r => r[feature]);
    const isNumeric = values.every(v => typeof v === 'number' || v === null || v === undefined || v === '');
    if (isNumeric) {
      const nonNull = values.filter(v => typeof v === 'number') as number[];
      const mean = nonNull.length > 0 ? nonNull.reduce((a, b) => a + b, 0) / nonNull.length : 0;
      rows.forEach((row, rowIndex) => {
        X.set(rowIndex, colIndex, typeof row[feature] === 'number' ? row[feature] : mean);
      });
    } else {
      const valueCounts: Record<string, number> = {};
      values.forEach(v => {
        if (v !== null && v !== undefined && v !== '') valueCounts[String(v)] = (valueCounts[String(v)] || 0) + 1;
      });
      const mode = Object.keys(valueCounts).reduce((a, b) => valueCounts[a] > valueCounts[b] ? a : b, '');
      const uniqueValues = Array.from(new Set(values.filter(v => v !== null && v !== undefined && v !== '').map(String)));
      encodingMap[feature] = {};
      uniqueValues.forEach((val, i) => {
        encodingMap[feature][val] = i;
      });
      rows.forEach((row, rowIndex) => {
        const val = (row[feature] === null || row[feature] === undefined || row[feature] === '') ? mode : String(row[feature]);
        X.set(rowIndex, colIndex, encodingMap[feature][val] || 0);
      });
    }
  });
  rows.forEach((row, i) => {
    y[i] = row[targetVariable] ? 1 : 0;
  });
  return { X, y, encodingMap };
}
function trainTestSplit(X: Matrix, y: number[], testSize: number) {
  const n = X.rows;
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort(() => 0.5 - Math.random());
  const splitPoint = Math.floor(n * (1 - testSize));
  const trainIndices = indices.slice(0, splitPoint);
  const testIndices = indices.slice(splitPoint);
  const X_train = X.selection(trainIndices, Array.from({ length: X.columns }, (_, i) => i));
  const y_train = trainIndices.map(i => y[i]);
  const X_test = X.selection(testIndices, Array.from({ length: X.columns }, (_, i) => i));
  const y_test = testIndices.map(i => y[i]);
  return { X_train, y_train, X_test, y_test };
}
function trainRandomForest(X_train: Matrix, y_train: number[]) {
  const options = { nEstimators: 50, maxDepth: 10 };
  const classifier = new RFClassifier(options);
  classifier.train(X_train, y_train);
  return classifier;
}
function evaluateModel(classifier: RFClassifier, X_test: Matrix, y_test: number[]): ModelMetrics {
  const y_pred = classifier.predict(X_test);
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < y_test.length; i++) {
    if (y_test[i] === 1 && y_pred[i] === 1) tp++;
    else if (y_test[i] === 0 && y_pred[i] === 0) tn++;
    else if (y_test[i] === 0 && y_pred[i] === 1) fp++;
    else if (y_test[i] === 1 && y_pred[i] === 0) fn++;
  }
  const total = tp + tn + fp + fn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
  const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  const rocAuc = (accuracy + recall) / 2;
  return {
    accuracy, precision, recall, f1, rocAuc,
    confusionMatrix: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn },
  };
}
function getFeatureImportance(classifier: RFClassifier, features: string[]) {
  const importances = classifier.getFeatureImportance();
  const result: Record<string, number> = {};
  features.forEach((feature, i) => {
    result[feature] = importances[i];
  });
  return result;
}
function serializeModel(classifier: RFClassifier): string {
  return JSON.stringify(classifier.toJSON());
}
export async function trainChurnModel(
  dataset: Dataset,
  targetVariable: string,
  features: string[]
): Promise<{
  metrics: ModelMetrics;
  featureImportance: Record<string, number>;
  encodingMap: Record<string, Record<string, number>>;
  modelJson: string;
}> {
  try {
    const { X, y, encodingMap } = preprocessData(dataset, targetVariable, features);
    const { X_train, y_train, X_test, y_test } = trainTestSplit(X, y, 0.2);
    const classifier = trainRandomForest(X_train, y_train);
    const metrics = evaluateModel(classifier, X_test, y_test);
    const featureImportance = getFeatureImportance(classifier, features);
    const modelJson = serializeModel(classifier);
    return { metrics, featureImportance, encodingMap, modelJson };
  } catch (e) {
    console.error("ML Engine Error:", e);
    throw new Error(e instanceof Error ? e.message : "An unknown error occurred in the ML engine.");
  }
}