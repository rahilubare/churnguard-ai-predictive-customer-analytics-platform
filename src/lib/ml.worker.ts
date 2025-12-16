import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
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

function evaluateModel(classifier: RFClassifier, X_test: number[][], y_test: number[]): ModelMetrics {
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
    const fpr = (fp + tn) > 0 ? fp / (fp + tn) : 0;
    const rocAuc = (1 + recall - fpr) / 2;
    return {
        accuracy, precision, recall, f1, rocAuc,
        confusionMatrix: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn },
    };
}

function getFeatureImportance(classifier: any, features: string[]): FeatureImportance {
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
            const { dataset, targetVariable, features } = payload;

            // Simulate progress updates (optional, difficult in synchronous ML task but we can fake it or break it up if needed)
            // For now, RF training is blocking, so we just run it.
            self.postMessage({ type: 'progress', payload: 10 });

            const { X, y, encodingMap } = preprocessData(dataset, targetVariable, features);
            self.postMessage({ type: 'progress', payload: 30 });

            const { X_train, y_train, X_test, y_test } = trainTestSplit(X, y, 0.2);

            const classifier = trainRandomForest(X_train, y_train);
            self.postMessage({ type: 'progress', payload: 70 });

            const metrics = evaluateModel(classifier, X_test, y_test);
            const featureImportance = getFeatureImportance(classifier, features);
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
