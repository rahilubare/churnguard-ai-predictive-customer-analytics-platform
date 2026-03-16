import { DecisionTreeRegression } from 'ml-cart';

export interface GBDTOptions {
    nEstimators?: number;
    learningRate?: number;
    maxDepth?: number;
    minSamplesSplit?: number;
    minSamplesLeaf?: number;
    subsample?: number;
    classWeights?: { 0: number; 1: number } | 'balanced';
    earlyStoppingRounds?: number;
    validationFraction?: number;
    randomState?: number;
}

export class GBDTClassifier {
    private trees: DecisionTreeRegression[] = [];
    private learningRate: number;
    private nEstimators: number;
    private initialPrediction: number = 0;
    private maxDepth: number;
    private minSamplesSplit: number;
    private minSamplesLeaf: number;
    private subsample: number;
    private classWeights: { 0: number; 1: number };
    private earlyStoppingRounds: number;
    private validationFraction: number;
    private randomState: number;
    private bestIteration: number = 0;
    private trainingHistory: Array<{ iteration: number; trainLoss: number; valLoss?: number }> = [];

    constructor(options: GBDTOptions = {}) {
        this.nEstimators = options.nEstimators || 100;
        this.learningRate = options.learningRate || 0.1;
        this.maxDepth = options.maxDepth || 5;
        this.minSamplesSplit = options.minSamplesSplit || 2;
        this.minSamplesLeaf = options.minSamplesLeaf || 1;
        this.subsample = options.subsample || 1.0;
        this.earlyStoppingRounds = options.earlyStoppingRounds || 0; // 0 means disabled
        this.validationFraction = options.validationFraction || 0.1;
        this.randomState = options.randomState || 42;

        // Handle class weights
        if (options.classWeights === 'balanced' || !options.classWeights) {
            // Will be computed during training
            this.classWeights = { 0: 1, 1: 1 };
        } else {
            this.classWeights = options.classWeights;
        }
    }

    train(X: number[][], y: number[]): void {
        const n = X.length;
        
        // Validate input
        if (n === 0) {
            throw new Error('Training data is empty');
        }
        if (X[0].length === 0) {
            throw new Error('Features are empty');
        }

        // Check for single class
        const uniqueClasses = new Set(y);
        if (uniqueClasses.size < 2) {
            console.warn('Warning: Only one class present in training data. Model will predict this class always.');
            this.initialPrediction = y[0] === 1 ? 10 : -10;
            this.bestIteration = 0;
            return;
        }

        // Compute balanced class weights if needed
        const posCount = y.filter(val => val === 1).length;
        const negCount = n - posCount;
        
        if (this.classWeights[0] === 1 && this.classWeights[1] === 1) {
            // Auto-compute balanced weights
            const total = posCount + negCount;
            this.classWeights = {
                0: total / (2 * negCount),
                1: total / (2 * posCount)
            };
        }

        // Initialize with log-odds
        this.initialPrediction = Math.log((posCount || 1) / (negCount || 1));

        // Split data for early stopping if enabled
        let XTrain = X;
        let yTrain = y;
        let XVal: number[][] | null = null;
        let yVal: number[] | null = null;

        if (this.earlyStoppingRounds > 0 && this.validationFraction > 0) {
            const valSize = Math.floor(n * this.validationFraction);
            const indices = this.getShuffledIndices(n);
            
            const valIndices = indices.slice(0, valSize);
            const trainIndices = indices.slice(valSize);

            XTrain = trainIndices.map(i => X[i]);
            yTrain = trainIndices.map(i => y[i]);
            XVal = valIndices.map(i => X[i]);
            yVal = valIndices.map(i => y[i]);
        }

        const nTrain = XTrain.length;
        let currentPredictions = new Array(nTrain).fill(this.initialPrediction);
        let valPredictions: number[] | null = XVal ? new Array(XVal.length).fill(this.initialPrediction) : null;

        let bestValLoss = Infinity;
        let noImprovementCount = 0;
        this.trainingHistory = [];

        for (let i = 0; i < this.nEstimators; i++) {
            // Subsample for stochastic gradient boosting
            const sampleIndices = this.subsample < 1.0
                ? this.getSampleIndices(nTrain, this.subsample)
                : Array.from({ length: nTrain }, (_, idx) => idx);

            const XSample = sampleIndices.map(idx => XTrain[idx]);
            const ySample = sampleIndices.map(idx => yTrain[idx]);
            const predSample = sampleIndices.map(idx => currentPredictions[idx]);

            // Compute weighted gradients (negative gradients for log loss)
            const residuals = ySample.map((val, idx) => {
                const p = 1 / (1 + Math.exp(-predSample[idx]));
                const weight = val === 1 ? this.classWeights[1] : this.classWeights[0];
                return weight * (val - p);
            });

            // Train tree on residuals
            const tree = new DecisionTreeRegression({
                maxDepth: this.maxDepth,
                minSamplesSplit: this.minSamplesSplit,
                minSamplesLeaf: this.minSamplesLeaf,
            });
            tree.train(XSample, residuals);

            // Update predictions
            const treePredsTrain = tree.predict(XTrain);
            for (let j = 0; j < nTrain; j++) {
                currentPredictions[j] += this.learningRate * treePredsTrain[j];
            }

            this.trees.push(tree);

            // Calculate training loss
            const trainLoss = this.calculateLogLoss(yTrain, currentPredictions);

            // Early stopping check
            if (XVal && yVal && valPredictions) {
                const treePredsVal = tree.predict(XVal);
                for (let j = 0; j < valPredictions.length; j++) {
                    valPredictions[j] += this.learningRate * treePredsVal[j];
                }

                const valLoss = this.calculateLogLoss(yVal, valPredictions);
                this.trainingHistory.push({ iteration: i, trainLoss, valLoss });

                if (valLoss < bestValLoss) {
                    bestValLoss = valLoss;
                    this.bestIteration = i;
                    noImprovementCount = 0;
                } else {
                    noImprovementCount++;
                }

                if (noImprovementCount >= this.earlyStoppingRounds) {
                    // Remove trees after best iteration
                    this.trees = this.trees.slice(0, this.bestIteration + 1);
                    break;
                }
            } else {
                this.trainingHistory.push({ iteration: i, trainLoss });
            }
        }

        this.bestIteration = this.trees.length - 1;
    }

    predict(X: number[][]): number[] {
        const n = X.length;
        const scores = new Array(n).fill(this.initialPrediction);

        for (const tree of this.trees) {
            const treePreds = tree.predict(X);
            for (let j = 0; j < n; j++) {
                scores[j] += this.learningRate * treePreds[j];
            }
        }

        return scores.map(score => (1 / (1 + Math.exp(-score)) > 0.5 ? 1 : 0));
    }

    predictProbability(X: number[][]): number[] {
        const n = X.length;
        const scores = new Array(n).fill(this.initialPrediction);

        // Use only trees up to best iteration for early-stopped models
        const treesToUse = this.trees.slice(0, this.bestIteration + 1);

        for (const tree of treesToUse) {
            const treePreds = tree.predict(X);
            for (let j = 0; j < n; j++) {
                scores[j] += this.learningRate * treePreds[j];
            }
        }

        return scores.map(score => 1 / (1 + Math.exp(-score)));
    }

    /**
     * Get training history for analysis
     */
    getTrainingHistory(): Array<{ iteration: number; trainLoss: number; valLoss?: number }> {
        return [...this.trainingHistory];
    }

    /**
     * Get the number of trees used (may be less than nEstimators with early stopping)
     */
    getActualNTrees(): number {
        return this.bestIteration + 1;
    }

    /**
     * Calculate log loss
     */
    private calculateLogLoss(y: number[], predictions: number[]): number {
        const n = y.length;
        let loss = 0;

        for (let i = 0; i < n; i++) {
            const p = 1 / (1 + Math.exp(-predictions[i]));
            const clippedP = Math.max(1e-15, Math.min(1 - 1e-15, p));
            loss -= y[i] * Math.log(clippedP) + (1 - y[i]) * Math.log(1 - clippedP);
        }

        return loss / n;
    }

    /**
     * Get shuffled indices for train/val split
     */
    private getShuffledIndices(n: number): number[] {
        const indices = Array.from({ length: n }, (_, i) => i);
        // Simple seeded random shuffle
        let seed = this.randomState;
        const random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        return indices;
    }

    /**
     * Get sample indices for subsampling
     */
    private getSampleIndices(n: number, fraction: number): number[] {
        const sampleSize = Math.floor(n * fraction);
        const indices = this.getShuffledIndices(n);
        return indices.slice(0, sampleSize);
    }

    toJSON() {
        return {
            initialPrediction: this.initialPrediction,
            learningRate: this.learningRate,
            nEstimators: this.nEstimators,
            maxDepth: this.maxDepth,
            minSamplesSplit: this.minSamplesSplit,
            minSamplesLeaf: this.minSamplesLeaf,
            subsample: this.subsample,
            classWeights: this.classWeights,
            earlyStoppingRounds: this.earlyStoppingRounds,
            bestIteration: this.bestIteration,
            trees: this.trees.map(tree => tree.toJSON()),
            trainingHistory: this.trainingHistory,
        };
    }

    static load(json: any): GBDTClassifier {
        const classifier = new GBDTClassifier({
            nEstimators: json.nEstimators,
            learningRate: json.learningRate,
            maxDepth: json.maxDepth,
            minSamplesSplit: json.minSamplesSplit,
            minSamplesLeaf: json.minSamplesLeaf,
            subsample: json.subsample,
            classWeights: json.classWeights,
            earlyStoppingRounds: json.earlyStoppingRounds,
        });
        classifier.initialPrediction = json.initialPrediction;
        classifier.bestIteration = json.bestIteration ?? json.trees.length - 1;
        classifier.trees = json.trees.map((treeJson: any) => DecisionTreeRegression.load(treeJson));
        classifier.trainingHistory = json.trainingHistory || [];
        return classifier;
    }
}

/**
 * Calculate feature importance for GBDT by averaging across trees
 */
export function calculateGBDTFeatureImportance(
    classifier: GBDTClassifier,
    featureNames: string[]
): Record<string, number> {
    // This is a simplified importance calculation
    // In production, you'd use permutation importance or Gini importance from trees
    const nFeatures = featureNames.length;
    const importance = new Array(nFeatures).fill(0);

    // For now, return uniform importance
    // Real implementation would require access to tree internals
    const uniform = 1 / nFeatures;
    const result: Record<string, number> = {};
    featureNames.forEach(name => {
        result[name] = uniform;
    });

    return result;
}
