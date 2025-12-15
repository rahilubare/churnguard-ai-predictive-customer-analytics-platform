export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
// SaaS & Auth Types
export type Role = 'owner' | 'member';
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  orgId: string;
  role: Role;
  name?: string;
}
export interface OrgState {
  id: string;
  name: string;
  subTier: 'free' | 'pro' | 'enterprise';
  maxRows: number;
}
export interface SessionState {
  id: string; // Required for IndexedEntity
  userId: string;
  orgId: string;
  exp: number; // Expiration timestamp
}
export interface AuthResponse {
  token: string;
  user: Pick<User, 'id' | 'email' | 'role'>;
  org: Pick<OrgState, 'id' | 'name' | 'subTier'>;
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
export interface FeatureImportance {
  [feature: string]: number;
}
export interface ModelMetadata {
  id: string;
  orgId: string;
  name: string;
  createdAt: number;
  targetVariable: string;
  features: string[];
  performance: ModelMetrics;
  encodingMap: Record<string, Record<string, number>>; // For categorical features
  featureImportance?: FeatureImportance;
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
export interface BatchPredictRequest {
  modelId: string;
  customers: Record<string, any>[];
}
export interface PredictionBatchResult {
  predictions: PredictionResult[];
  total: number;
}