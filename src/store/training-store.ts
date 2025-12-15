import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ModelMetrics, ModelArtifact } from '@shared/types';
import { api } from '@/lib/api-client';
export type TrainingStatus = 'idle' | 'configuring' | 'preprocessing' | 'training' | 'evaluating' | 'complete' | 'error' | 'deploying';
interface TrainingState {
  targetVariable: string | null;
  selectedFeatures: string[];
  status: TrainingStatus;
  progress: number;
  error: string | null;
  metrics: ModelMetrics | null;
  featureImportance: Record<string, number> | null;
  trainedModel: {
    modelJson: string;
    encodingMap: Record<string, Record<string, number>>;
  } | null;
}
interface TrainingActions {
  setConfig: (target: string, features: string[]) => void;
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
};
export const useTrainingStore = create<TrainingState & TrainingActions>()(
  immer((set, get) => ({
    ...initialState,
    setConfig: (target, features) => {
      set((state) => {
        state.targetVariable = target;
        state.selectedFeatures = features;
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
      set(partialState);
    },
    deployModel: async (modelName: string) => {
      const { trainedModel, targetVariable, selectedFeatures, metrics } = get();
      if (!trainedModel || !targetVariable || !metrics) {
        set({ status: 'error', error: 'No trained model to deploy.' });
        return null;
      }
      set({ status: 'deploying' });
      try {
        const modelToDeploy: Omit<ModelArtifact, 'id' | 'createdAt'> = {
          name: modelName,
          targetVariable,
          features: selectedFeatures,
          performance: metrics,
          modelJson: trainedModel.modelJson,
          encodingMap: trainedModel.encodingMap,
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