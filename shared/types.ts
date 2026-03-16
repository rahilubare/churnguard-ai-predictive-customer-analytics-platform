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
  algorithm?: string;
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

// Data Source Types
export type DataSourceType = 'file' | 'sql' | 'nosql' | 'api';

export interface DatabaseConfig {
  type: 'postgresql' | 'mysql' | 'mssql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface NoSQLConfig {
  type: 'mongodb';
  uri: string;
  database: string;
  collection: string;
}

export interface APIConfig {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  authType?: 'none' | 'bearer' | 'basic' | 'api_key';
  authToken?: string;
  pagination?: {
    type: 'offset' | 'page' | 'cursor';
    limitParam: string;
    offsetParam?: string;
    pageParam?: string;
    cursorParam?: string;
    cursorPath?: string;
  };
}

export interface DataSource {
  type: DataSourceType;
  config: DatabaseConfig | NoSQLConfig | APIConfig | FileConfig;
}

export interface FileConfig {
  file: File;
  delimiter?: string;
  encoding?: string;
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  row?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  row?: number;
}

// ML Types
export interface CrossValidationResult {
  meanAccuracy: number;
  stdAccuracy: number;
  meanPrecision: number;
  stdPrecision: number;
  meanRecall: number;
  stdRecall: number;
  meanF1: number;
  stdF1: number;
  meanRocAuc: number;
  stdRocAuc: number;
  foldResults: ModelMetrics[];
}

export interface ScaledResult {
  scaledData: number[][];
  scalerParams: {
    mean?: number[];
    std?: number[];
    min?: number[];
    max?: number[];
  };
}

export interface HyperparameterConfig {
  nEstimators?: number[];
  maxDepth?: number[];
  learningRate?: number[];
  minSamplesSplit?: number[];
  minSamplesLeaf?: number[];
}

export interface HyperparameterTuningResult {
  bestParams: Record<string, number>;
  bestScore: number;
  allResults: Array<{
    params: Record<string, number>;
    score: number;
  std: number;
  }>;
}

// Feature Engineering Types
export interface FeatureEngineeringConfig {
  datetimeExtraction?: string[];
  oneHotEncode?: string[];
  targetEncode?: string[];
  scaleMethod?: 'standard' | 'minmax' | 'none';
  handleOutliers?: 'remove' | 'clip' | 'none';
  outlierMethod?: 'iqr' | 'zscore';
  outlierThreshold?: number;
}

export interface EngineeredFeatures {
  originalFeatures: string[];
  newFeatures: string[];
  transformations: Record<string, string>;
}

// Error Types
export type ErrorType = 'validation' | 'network' | 'system' | 'user' | 'model';

export interface AppErrorInfo {
  type: ErrorType;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  suggestedAction?: string;
}

// Model Comparison Types
export interface ModelComparison {
  modelA: ModelArtifact;
  modelB: ModelArtifact;
  metricComparison: Record<string, { modelA: number; modelB: number; difference: number }>;
  featureImportanceDiff: Record<string, { modelA: number; modelB: number; difference: number }>;
}

// Data Quality Types
export interface DataQualityReport {
  overallScore: number;
  completeness: number;
  consistency: number;
  validity: number;
  uniqueness: number;
  issues: DataQualityIssue[];
}

export interface DataQualityIssue {
  type: 'missing' | 'duplicate' | 'outlier' | 'invalid' | 'inconsistent';
  severity: 'low' | 'medium' | 'high' | 'critical';
  column: string;
  count: number;
  percentage: number;
  description: string;
}