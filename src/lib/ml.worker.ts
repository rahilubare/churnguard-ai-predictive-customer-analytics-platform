import { Matrix } from 'ml-matrix';
import { RandomForestClassifier as RFClassifier } from 'ml-random-forest';
import { DecisionTreeRegression } from 'ml-cart';
import { GBDTClassifier } from '../../shared/gbdt';
import type { Dataset, ModelMetrics, FeatureImportance, CrossValidationResult, ScaledResult } from '@shared/types';

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

function trainTestSplit(X: number[][], y: number[], testSize: number, stratified: boolean = true) {
    const n = X.length;
    
    if (stratified) {
        // Stratified split to maintain class distribution
        const class0Indices: number[] = [];
        const class1Indices: number[] = [];
        
        y.forEach((label, idx) => {
            if (label === 0) class0Indices.push(idx);
            else class1Indices.push(idx);
        });
        
        // Shuffle each class
        shuffleArray(class0Indices);
        shuffleArray(class1Indices);
        
        // Split each class proportionally
        const train0Count = Math.floor(class0Indices.length * (1 - testSize));
        const train1Count = Math.floor(class1Indices.length * (1 - testSize));
        
        const trainIndices = [
            ...class0Indices.slice(0, train0Count),
            ...class1Indices.slice(0, train1Count)
        ];
        const testIndices = [
            ...class0Indices.slice(train0Count),
            ...class1Indices.slice(train1Count)
        ];
        
        shuffleArray(trainIndices);
        shuffleArray(testIndices);
        
        const X_train = trainIndices.map(i => X[i]);
        const y_train = trainIndices.map(i => y[i]);
        const X_test = testIndices.map(i => X[i]);
        const y_test = testIndices.map(i => y[i]);
        
        return { X_train, y_train, X_test, y_test };
    } else {
        // Random split
        const indices = Array.from({ length: n }, (_, i) => i);
        shuffleArray(indices);
        const splitPoint = Math.floor(n * (1 - testSize));
        const trainIndices = indices.slice(0, splitPoint);
        const testIndices = indices.slice(splitPoint);
        const X_train = trainIndices.map(i => X[i]);
        const y_train = trainIndices.map(i => y[i]);
        const X_test = testIndices.map(i => X[i]);
        const y_test = testIndices.map(i => y[i]);
        return { X_train, y_train, X_test, y_test };
    }
}

/**
 * Shuffle array in place using Fisher-Yates
 */
function shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Scale features using standard or min-max scaling
 */
function scaleFeatures(X: number[][], method: 'standard' | 'minmax' = 'standard'): ScaledResult {
    const n = X.length;
    const m = X[0]?.length ?? 0;
    
    if (n === 0 || m === 0) {
        return { scaledData: X, scalerParams: {} };
    }
    
    const scaledData: number[][] = [];
    const mean: number[] = [];
    const std: number[] = [];
    const min: number[] = [];
    const max: number[] = [];
    
    for (let j = 0; j < m; j++) {
        const colValues = X.map(row => row[j]).filter(v => !isNaN(v));
        
        if (colValues.length === 0) {
            mean.push(0);
            std.push(1);
            min.push(0);
            max.push(1);
            continue;
        }
        
        const colMean = colValues.reduce((a, b) => a + b, 0) / colValues.length;
        const colStd = Math.sqrt(colValues.reduce((sum, v) => sum + Math.pow(v - colMean, 2), 0) / colValues.length) || 1;
        const colMin = Math.min(...colValues);
        const colMax = Math.max(...colValues);
        
        mean.push(colMean);
        std.push(colStd);
        min.push(colMin);
        max.push(colMax);
    }
    
    for (let i = 0; i < n; i++) {
        const scaledRow: number[] = [];
        for (let j = 0; j < m; j++) {
            const val = X[i][j];
            if (isNaN(val)) {
                scaledRow.push(0);
                continue;
            }
            
            if (method === 'standard') {
                scaledRow.push((val - mean[j]) / std[j]);
            } else {
                const range = max[j] - min[j] || 1;
                scaledRow.push((val - min[j]) / range);
            }
        }
        scaledData.push(scaledRow);
    }
    
    return {
        scaledData,
        scalerParams: method === 'standard' ? { mean, std } : { min, max }
    };
}

/**
 * K-fold cross-validation
 */
function crossValidate(
    X: number[][],
    y: number[],
    k: number,
    trainFn: (X: number[][], y: number[]) => any,
    predictFn: (model: any, X: number[][]) => number[],
    predictProbFn: (model: any, X: number[][]) => number[]
): CrossValidationResult {
    const n = X.length;
    const foldResults: ModelMetrics[] = [];
    
    // Create stratified folds
    const class0Indices: number[] = [];
    const class1Indices: number[] = [];
    
    y.forEach((label, idx) => {
        if (label === 0) class0Indices.push(idx);
        else class1Indices.push(idx);
    });
    
    shuffleArray(class0Indices);
    shuffleArray(class1Indices);
    
    // Distribute indices to folds
    const folds: number[][] = Array.from({ length: k }, () => []);
    
    class0Indices.forEach((idx, i) => folds[i % k].push(idx));
    class1Indices.forEach((idx, i) => folds[i % k].push(idx));
    
    for (let fold = 0; fold < k; fold++) {
        // Use current fold as test, rest as train
        const testIndices = folds[fold];
        const trainIndices = folds.flatMap((f, i) => i === fold ? [] : f);
        
        const X_train = trainIndices.map(i => X[i]);
        const y_train = trainIndices.map(i => y[i]);
        const X_test = testIndices.map(i => X[i]);
        const y_test = testIndices.map(i => y[i]);
        
        const model = trainFn(X_train, y_train);
        const metrics = evaluateModelGeneric(model, X_test, y_test, predictFn, predictProbFn);
        foldResults.push(metrics);
    }
    
    // Calculate mean and std
    const calcMean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const calcStd = (arr: number[]) => {
        const mean = calcMean(arr);
        return Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length);
    };
    
    return {
        meanAccuracy: calcMean(foldResults.map(m => m.accuracy)),
        stdAccuracy: calcStd(foldResults.map(m => m.accuracy)),
        meanPrecision: calcMean(foldResults.map(m => m.precision)),
        stdPrecision: calcStd(foldResults.map(m => m.precision)),
        meanRecall: calcMean(foldResults.map(m => m.recall)),
        stdRecall: calcStd(foldResults.map(m => m.recall)),
        meanF1: calcMean(foldResults.map(m => m.f1)),
        stdF1: calcStd(foldResults.map(m => m.f1)),
        meanRocAuc: calcMean(foldResults.map(m => m.rocAuc)),
        stdRocAuc: calcStd(foldResults.map(m => m.rocAuc)),
        foldResults,
    };
}

/**
 * Generic model evaluation
 */
function evaluateModelGeneric(
    model: any,
    X_test: number[][],
    y_test: number[],
    predictFn: (model: any, X: number[][]) => number[],
    predictProbFn: (model: any, X: number[][]) => number[]
): ModelMetrics {
    const y_pred = predictFn(model, X_test);
    const y_probs = predictProbFn(model, X_test);
    
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
    
    // ROC AUC calculation
    let rocAuc = 0.5;
    if (y_probs && y_probs.length > 0) {
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
    }
    
    return {
        accuracy, precision, recall, f1, rocAuc,
        confusionMatrix: { truePositive: tp, trueNegative: tn, falsePositive: fp, falseNegative: fn },
    };
}

function trainGBDT(X_train: number[][], y_train: number[], options: { 
    nEstimators?: number; 
    learningRate?: number; 
    maxDepth?: number;
    earlyStoppingRounds?: number;
} = {}) {
    const classifier = new GBDTClassifier({ 
        nEstimators: options.nEstimators ?? 100, 
        learningRate: options.learningRate ?? 0.1, 
        maxDepth: options.maxDepth ?? 5,
        earlyStoppingRounds: options.earlyStoppingRounds ?? 10,
        subsample: 0.8,
        classWeights: 'balanced',
    });
    classifier.train(X_train, y_train);
    return classifier;
}

function trainRandomForest(X_train: number[][], y_train: number[], options: {
    nEstimators?: number;
    maxDepth?: number;
} = {}) {
    const classifier = new RFClassifier({ 
        nEstimators: options.nEstimators ?? 100, 
        maxDepth: options.maxDepth ?? 10, 
        seed: 42,
        replacement: true,
        nFeatures: Math.sqrt(X_train[0]?.length ?? 1),
    });
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
            const { dataset, targetVariable, features, algorithm = 'random_forest', options = {} } = payload;
            const { 
                scaleMethod = 'standard',
                useCrossValidation = false,
                crossValidationFolds = 5,
                nEstimators,
                maxDepth,
                learningRate,
                earlyStoppingRounds,
            } = options;

            // Validate inputs
            if (!dataset || !dataset.rows || dataset.rows.length === 0) {
                throw new Error('Dataset is empty or invalid');
            }
            if (!targetVariable) {
                throw new Error('Target variable is required');
            }
            if (!features || features.length === 0) {
                throw new Error('At least one feature is required');
            }

            self.postMessage({ type: 'progress', payload: 5 });

            // Preprocess data
            const { X, y, encodingMap } = preprocessData(dataset, targetVariable, features);
            
            // Validate processed data
            if (X.length === 0) {
                throw new Error('No valid data rows after preprocessing');
            }
            
            // Check for single class
            const uniqueClasses = new Set(y);
            if (uniqueClasses.size < 2) {
                throw new Error('Target variable has only one class. Need at least two classes for classification.');
            }
            
            self.postMessage({ type: 'progress', payload: 15 });

            // Scale features
            const { scaledData: XScaled, scalerParams } = scaleFeatures(X, scaleMethod);
            
            self.postMessage({ type: 'progress', payload: 25 });

            let metrics: ModelMetrics;
            let featureImportance: FeatureImportance;
            let classifier: any;
            let cvResults: CrossValidationResult | null = null;

            if (useCrossValidation) {
                // Cross-validation mode
                self.postMessage({ type: 'progress', payload: 30 });
                
                const trainFn = algorithm === 'gradient_boosting' 
                    ? (X: number[][], y: number[]) => trainGBDT(X, y, { nEstimators, maxDepth, learningRate, earlyStoppingRounds })
                    : (X: number[][], y: number[]) => trainRandomForest(X, y, { nEstimators, maxDepth });
                
                const predictFn = (model: any, X: number[][]) => model.predict(X);
                const predictProbFn = (model: any, X: number[][]) => 
                    model.predictProbability ? model.predictProbability(X) : null;
                
                cvResults = crossValidate(XScaled, y, crossValidationFolds, trainFn, predictFn, predictProbFn);
                
                // Use mean metrics from CV
                metrics = {
                    accuracy: cvResults.meanAccuracy,
                    precision: cvResults.meanPrecision,
                    recall: cvResults.meanRecall,
                    f1: cvResults.meanF1,
                    rocAuc: cvResults.meanRocAuc,
                    confusionMatrix: { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 },
                };
                
                // Train final model on all data
                if (algorithm === 'gradient_boosting') {
                    classifier = trainGBDT(XScaled, y, { nEstimators, maxDepth, learningRate, earlyStoppingRounds });
                } else {
                    classifier = trainRandomForest(XScaled, y, { nEstimators, maxDepth });
                }
                
                self.postMessage({ type: 'progress', payload: 85 });
            } else {
                // Standard train/test split mode
                const { X_train, y_train, X_test, y_test } = trainTestSplit(XScaled, y, 0.2, true);

                if (algorithm === 'gradient_boosting') {
                    classifier = trainGBDT(X_train, y_train, { nEstimators, maxDepth, learningRate, earlyStoppingRounds });
                } else {
                    classifier = trainRandomForest(X_train, y_train, { nEstimators, maxDepth });
                }
                
                self.postMessage({ type: 'progress', payload: 70 });

                metrics = evaluateModel(classifier, X_test, y_test);
            }

            // Calculate feature importance
            featureImportance = getFeatureImportance(classifier, features, XScaled, y);
            
            self.postMessage({ type: 'progress', payload: 90 });
            
            const modelJson = serializeModel(classifier);

            self.postMessage({ type: 'progress', payload: 100 });
            self.postMessage({
                type: 'complete',
                payload: { 
                    metrics, 
                    featureImportance, 
                    encodingMap, 
                    modelJson,
                    scalerParams,
                    cvResults,
                }
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown training error';
            console.error('Training error:', errorMessage);
            self.postMessage({
                type: 'error',
                payload: errorMessage
            });
        }
    }
};
