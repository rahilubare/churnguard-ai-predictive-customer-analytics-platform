import type { Dataset, ModelMetrics, FeatureImportance, ModelArtifact } from '@shared/types';
import { useTrainingStore } from '../store/training-store';
import { useAuthStore } from '../store/auth-store';
import MLWorker from './ml.worker.ts?worker'; // Vite syntax for worker import

export async function trainChurnModel(dataset: Dataset, targetVariable: string, features: string[], algorithm: string = 'random_forest'): Promise<ModelArtifact> {
  const trainingStore = useTrainingStore.getState();
  trainingStore.setTrainingState({ status: 'preprocessing', progress: 10 });

  if (algorithm === 'python_gbdt') {
    try {
      return await trainPythonModel(dataset, targetVariable, features);
    } catch (error) {
      console.warn('Python GBDT training failed, falling back to JS implementation:', error);
      // Automatically fallback to JS GBDT if Python fails
      return trainChurnModel(dataset, targetVariable, features, 'gradient_boosting');
    }
  }

  return new Promise((resolve, reject) => {
    const worker = new MLWorker();

    worker.postMessage({
      type: 'train',
      payload: {
        dataset,
        targetVariable,
        features,
        algorithm
      }
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'complete') {
        trainingStore.setTrainingState({ status: 'complete', progress: 100 });
        resolve(payload);
        worker.terminate();
      } else if (type === 'error') {
        trainingStore.setTrainingState({ status: 'error', error: payload });
        reject(new Error(payload));
        worker.terminate();
      } else if (type === 'progress') {
        trainingStore.setTrainingState({ progress: payload });
      }
    };

    worker.onerror = (e) => {
      trainingStore.setTrainingState({ status: 'error', error: 'Worker error: ' + e.message });
      reject(new Error('Worker error: ' + e.message));
      worker.terminate();
    };
  });
}

async function trainPythonModel(dataset: Dataset, targetVariable: string, features: string[]): Promise<ModelArtifact> {
  const trainingStore = useTrainingStore.getState();
  const authStore = useAuthStore.getState();

  // 1. Preprocess data locally (Label Encoding for categories)
  const encodingMap: Record<string, Record<string, number>> = {};
  const X: number[][] = [];
  const y: number[] = [];

  dataset.rows.forEach(row => {
    const xRow: number[] = [];
    features.forEach(feature => {
      const val = row[feature];
      if (typeof val === 'string') {
        if (!encodingMap[feature]) encodingMap[feature] = {};
        if (encodingMap[feature][val] === undefined) {
          encodingMap[feature][val] = Object.keys(encodingMap[feature]).length;
        }
        xRow.push(encodingMap[feature][val]);
      } else {
        xRow.push(Number(val) || 0);
      }
    });
    X.push(xRow);
    const targetVal = row[targetVariable];
    y.push(Number(targetVal) === 1 || String(targetVal).toLowerCase() === 'yes' || String(targetVal).toLowerCase() === 'churn' ? 1 : 0);
  });

  trainingStore.setTrainingState({ status: 'training', progress: 50 });

  const response = await fetch('/api/models/train', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authStore.token}`
    },
    body: JSON.stringify({
      name: `Python-GBDT-${new Date().toLocaleDateString()}`,
      dataset: { X, y },
      targetVariable,
      features,
      algorithm: 'python_gbdt'
    })
  });

  const result = await response.json();
  if (!result.success) {
    trainingStore.setTrainingState({ status: 'error', error: result.error || 'Server-side training failed' });
    throw new Error(result.error || 'Server-side training failed');
  }

  trainingStore.setTrainingState({ status: 'complete', progress: 100 });
  return result.data;
}