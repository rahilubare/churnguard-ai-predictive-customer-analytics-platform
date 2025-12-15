export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
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
export interface ModelMetadata {
  id: string;
  name: string;
  createdAt: number;
  targetVariable: string;
  features: string[];
  performance: Record<string, number>; // e.g., { accuracy: 0.95, precision: 0.92 }
}
// This will store the serialized model from ml-random-forest
export interface ModelArtifact extends ModelMetadata {
  modelJson: string; 
}