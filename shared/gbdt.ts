import { DecisionTreeRegression } from 'ml-cart';

export class GBDTClassifier {
    private trees: DecisionTreeRegression[] = [];
    private learningRate: number;
    private nEstimators: number;
    private initialPrediction: number = 0;
    private maxDepth: number;

    constructor(options: { nEstimators?: number, learningRate?: number, maxDepth?: number } = {}) {
        this.nEstimators = options.nEstimators || 50;
        this.learningRate = options.learningRate || 0.1;
        this.maxDepth = options.maxDepth || 5;
    }

    train(X: number[][], y: number[]) {
        const n = X.length;
        const posCount = y.filter(val => val === 1).length;
        const negCount = n - posCount;
        this.initialPrediction = Math.log((posCount || 1) / (negCount || 1));

        let currentPredictions = new Array(n).fill(this.initialPrediction);

        for (let i = 0; i < this.nEstimators; i++) {
            const residuals = y.map((val, idx) => {
                const p = 1 / (1 + Math.exp(-currentPredictions[idx]));
                return val - p;
            });

            const tree = new DecisionTreeRegression({
                maxDepth: this.maxDepth
            });
            tree.train(X, residuals);

            const treePreds = tree.predict(X);
            for (let j = 0; j < n; j++) {
                currentPredictions[j] += this.learningRate * treePreds[j];
            }

            this.trees.push(tree);
        }
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

        for (const tree of this.trees) {
            const treePreds = tree.predict(X);
            for (let j = 0; j < n; j++) {
                scores[j] += this.learningRate * treePreds[j];
            }
        }

        return scores.map(score => 1 / (1 + Math.exp(-score)));
    }

    toJSON() {
        return {
            initialPrediction: this.initialPrediction,
            learningRate: this.learningRate,
            nEstimators: this.nEstimators,
            maxDepth: this.maxDepth,
            trees: this.trees.map(tree => tree.toJSON())
        };
    }

    static load(json: any): GBDTClassifier {
        const classifier = new GBDTClassifier({
            nEstimators: json.nEstimators,
            learningRate: json.learningRate,
            maxDepth: json.maxDepth
        });
        classifier.initialPrediction = json.initialPrediction;
        classifier.trees = json.trees.map((treeJson: any) => DecisionTreeRegression.load(treeJson));
        return classifier;
    }
}
