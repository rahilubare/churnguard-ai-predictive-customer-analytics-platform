export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
// Demo types to fix compilation errors
export interface User {
  id: string;
  name: string;
}
export interface Chat {
  id: string;
  title: string;
}
export interface ChatMessage {
  id: string;
  chatId: string;
  userId: string;
  text: string;
  ts: number;
}
// ChurnGuard AI Specific Types
export interface Dataset {
  headers: string[];
  rows: Record<string, any>[];
}
export interface ColumnStat {
  total: number;
  missing: number;
  unique: number;
  type: 'numerical' | 'categorical';
  valueCounts: Record<string, number>;
}
export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  confusionMatrix: {
    truePositive: number;
    trueNegative: number;
    falsePositive: number;
    falseNegative: number;
  };
}
export interface ModelMetadata {
  id: string;
  name: string;
  createdAt: number;
  targetVariable: string;
  features: string[];
  performance: ModelMetrics;
  encodingMap: Record<string, Record<string, number>>; // For categorical features
}
// This will store the serialized model from ml-random-forest
export interface ModelArtifact extends ModelMetadata {
  modelJson: string;
}
export interface TrainingParams {
  nEstimators?: number;
  maxDepth?: number;
  testSize?: number;
}
export interface PredictionResult {
  churnProbability: number;
  prediction: 0 | 1;
  featureContributions: Record<string, number>;
}