import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { DecisionTreeRegression } from 'ml-cart';
import { GBDTClassifier } from '../../shared/gbdt';
import type { Dataset, ModelMetrics, FeatureImportance } from '@shared/types';

// --- Replicated Logic from ml-engine.ts ---

function preprocessData(
    dataset: Dataset,
    targetVariable: string,
    features: string[]
) {
    const { rows } = dataset;
    const y: number[] = new Array(rows.length).fill(0);
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
            const mode = Object.keys(valueCounts).length > 0 ? Object.keys(valueCounts).reduce((a, b) => valueCounts[a] > valueCounts[b] ? a : b) : '';
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
    return { X: X.to2DArray(), y, encodingMap };
}

function trainTestSplit(X: number[][], y: number[], testSize: number) {
    const n = X.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    indices.sort(() => 0.5 - Math.random());
    const splitPoint = Math.floor(n * (1 - testSize));
    const trainIndices = indices.slice(0, splitPoint);
    const testIndices = indices.slice(splitPoint);
    const X_train = trainIndices.map(i => X[i]);
    const y_train = trainIndices.map(i => y[i]);
    const X_test = testIndices.map(i => X[i]);
    const y_test = testIndices.map(i => y[i]);
    return { X_train, y_train, X_test, y_test };
}

function trainRandomForest(X_train: number[][], y_train: number[]) {
    const options = { nEstimators: 50, maxDepth: 10, seed: 42 };
    const classifier = new RFClassifier(options);
    classifier.train(X_train, y_train);
    return classifier;
}

function trainGBDT(X_train: number[][], y_train: number[]) {
    const classifier = new GBDTClassifier({ nEstimators: 50, learningRate: 0.1, maxDepth: 4 });
    classifier.train(X_train, y_train);
    return classifier;
}

function evaluateModel(classifier: any, X_test: number[][], y_test: number[]): ModelMetrics {
    const y_pred = classifier.predict(X_test);
    const y_probs = classifier.predictProbability ? classifier.predictProbability(X_test) : null;

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

    // Simple ROC AUC estimation if probabilities are available
    let rocAuc = 0.5;
    if (y_probs) {
        let pairs = 0, concordant = 0;
        for (let i = 0; i < y_test.length; i++) {
            if (y_test[i] === 1) {
                for (let j = 0; j < y_test.length; j++) {
                    if (y_test[j] === 0) {
                        pairs++;
                        if (y_probs[i] > y_probs[j]) concordant++;
                        else if (y_probs[i] === y_probs[j]) concordant += 0.5;
                    }
                }
            }
        }
        rocAuc = pairs > 0 ? concordant / pairs : 0.5;
    } else {
        const fpr = (fp + tn) > 0 ? fp / (fp + tn) : 0;
        rocAuc = (1 + recall - fpr) / 2;
    }

    return {
        accuracy, precision, recall, f1, rocAuc,
        confusionMatrix: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn },
    };
}

function calculatePermutationImportance(classifier: any, X_test: number[][], y_test: number[], features: string[]): FeatureImportance {
    const baselineResults = evaluateModel(classifier, X_test, y_test);
    const baselineAccuracy = baselineResults.accuracy;
    const importance: FeatureImportance = {};
    const n = X_test.length;

    features.forEach((feature, featureIdx) => {
        // Create a copy of X_test with feature featureIdx shuffled
        const X_shuffled = X_test.map(row => [...row]);
        const shuffledValues = X_test.map(row => row[featureIdx]);

        // Fisher-Yates shuffle
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledValues[i], shuffledValues[j]] = [shuffledValues[j], shuffledValues[i]];
        }

        for (let i = 0; i < n; i++) {
            X_shuffled[i][featureIdx] = shuffledValues[i];
        }

        const shuffledResults = evaluateModel(classifier, X_shuffled, y_test);
        const shuffledAccuracy = shuffledResults.accuracy;

        // Importance is the drop in performance
        importance[feature] = Math.max(0, baselineAccuracy - shuffledAccuracy);
    });

    // Normalize
    const total = Object.values(importance).reduce((a, b) => a + b, 0) || 1;
    Object.keys(importance).forEach(key => {
        importance[key] = importance[key] / total;
    });

    return importance;
}

function getFeatureImportance(classifier: any, features: string[], X_test: number[][], y_test: number[]): FeatureImportance {
    // For GBDT, we use permutation importance because ml-cart doesn't expose tree importances easily
    if (classifier instanceof GBDTClassifier) {
        return calculatePermutationImportance(classifier, X_test, y_test, features);
    }

    const result: FeatureImportance = {};
    const numTrees = classifier.variableImportances?.length ?? 0;
    if (numTrees > 0) {
        const numFeatures = features.length;
        const firstTree = classifier.variableImportances[0];
        if (Array.isArray(firstTree) && firstTree.length === numFeatures) {
            const sumImp = new Array(numFeatures).fill(0);
            for (let t = 0; t < numTrees; t++) {
                const treeImp = classifier.variableImportances[t];
                if (Array.isArray(treeImp) && treeImp.length === numFeatures) {
                    for (let f = 0; f < numFeatures; f++) {
                        sumImp[f] += treeImp[f];
                    }
                }
            }
            const meanImp = sumImp.map(s => s / numTrees);
            const total = meanImp.reduce((a, b) => a + b, 0) || 1;
            const normImp = meanImp.map(i => i / total);
            features.forEach((feature, i) => {
                result[feature] = normImp[i];
            });
        } else {
            const uniform = 1 / features.length;
            features.forEach(feature => { result[feature] = uniform; });
        }
    } else {
        const uniform = 1 / features.length;
        features.forEach(feature => { result[feature] = uniform; });
    }
    return result;
}

function serializeModel(classifier: RFClassifier): string {
    return JSON.stringify(classifier.toJSON());
}

// --- Worker Message Handler ---

self.onmessage = (e: MessageEvent) => {
    const { type, payload } = e.data;

    if (type === 'train') {
        try {
            const { dataset, targetVariable, features, algorithm = 'random_forest' } = payload;

            // Simulate progress updates
            self.postMessage({ type: 'progress', payload: 10 });

            const { X, y, encodingMap } = preprocessData(dataset, targetVariable, features);
            self.postMessage({ type: 'progress', payload: 30 });

            const { X_train, y_train, X_test, y_test } = trainTestSplit(X, y, 0.2);

            let classifier: any;
            if (algorithm === 'gradient_boosting') {
                classifier = trainGBDT(X_train, y_train);
            } else {
                classifier = trainRandomForest(X_train, y_train);
            }
            self.postMessage({ type: 'progress', payload: 70 });

            const metrics = evaluateModel(classifier, X_test, y_test);
            const featureImportance = getFeatureImportance(classifier, features, X_test, y_test);
            const modelJson = serializeModel(classifier);

            self.postMessage({ type: 'progress', payload: 100 });
            self.postMessage({
                type: 'complete',
                payload: { metrics, featureImportance, encodingMap, modelJson }
            });

        } catch (error) {
            self.postMessage({
                type: 'error',
                payload: error instanceof Error ? error.message : "Checking error"
            });
        }
    }
};
