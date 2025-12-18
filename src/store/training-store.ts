import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ModelMetrics, ModelArtifact, FeatureImportance } from '@shared/types';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth-store';
export type TrainingStatus = 'idle' | 'configuring' | 'preprocessing' | 'training' | 'evaluating' | 'complete' | 'error' | 'deploying';
interface TrainingState {
  targetVariable: string | null;
  selectedFeatures: string[];
  status: TrainingStatus;
  progress: number;
  error: string | null;
  metrics: ModelMetrics | null;
  featureImportance: FeatureImportance | null;
  trainedModel: {
    modelJson: string;
    encodingMap: Record<string, Record<string, number>>;
  } | null;
  algorithm: string;
}
interface TrainingActions {
  setConfig: (target: string, features: string[], algorithm?: string) => void;
  startTraining: () => void;
  setTrainingState: (
    partialState: Partial<Omit<TrainingState, 'targetVariable' | 'selectedFeatures'>>
  ) => void;
  deployModel: (modelName: string) => Promise<ModelArtifact | null>;
  reset: () => void;
}
const initialState: TrainingState = {
  targetVariable: null,
  selectedFeatures: [],
  status: 'idle',
  progress: 0,
  error: null,
  metrics: null,
  featureImportance: null,
  trainedModel: null,
  algorithm: 'random_forest',
};
export const useTrainingStore = create<TrainingState & TrainingActions>()(
  immer((set, get) => ({
    ...initialState,
    setConfig: (target, features, algorithm = 'random_forest') => {
      set((state) => {
        state.targetVariable = target;
        state.selectedFeatures = features;
        state.algorithm = algorithm;
        state.status = 'configuring';
        state.metrics = null;
        state.featureImportance = null;
        state.trainedModel = null;
        state.error = null;
        state.progress = 0;
      });
    },
    startTraining: () => {
      set({ status: 'preprocessing', progress: 0, error: null });
    },
    setTrainingState: (partialState) => {
      set((state) => {
        Object.assign(state, partialState);
      });
    },
    deployModel: async (modelName: string) => {
      const { trainedModel, targetVariable, selectedFeatures, metrics, featureImportance } = get();
      const authStore = useAuthStore.getState();
      if (!trainedModel || !targetVariable || !metrics) {
        set({ status: 'error', error: 'No trained model to deploy.' });
        return null;
      }
      if (!authStore.orgId) {
        set({ status: 'error', error: 'Authentication error: No organization ID found.' });
        return null;
      }
      set({ status: 'deploying' });
      try {
        const modelToDeploy: Omit<ModelArtifact, 'id' | 'createdAt'> = {
          name: modelName,
          orgId: authStore.orgId,
          targetVariable,
          features: selectedFeatures,
          performance: metrics,
          modelJson: trainedModel.modelJson,
          encodingMap: trainedModel.encodingMap,
          featureImportance: featureImportance || {},
        };
        const deployedModel = await api<ModelArtifact>('/api/models', {
          method: 'POST',
          body: JSON.stringify(modelToDeploy),
        });
        set({ status: 'complete' });
        return deployedModel;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Deployment failed.';
        set({ status: 'error', error: errorMessage });
        return null;
      }
    },
    reset: () => {
      set(initialState);
    },
  }))
);