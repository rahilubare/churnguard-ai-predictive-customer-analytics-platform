import type { Dataset, ModelMetrics, FeatureImportance } from '@shared/types';
import MLWorker from './ml.worker.ts?worker'; // Vite syntax for worker import

export async function trainChurnModel(
  dataset: Dataset,
  targetVariable: string,
  features: string[]
): Promise<{
  metrics: ModelMetrics;
  featureImportance: FeatureImportance;
  encodingMap: Record<string, Record<string, number>>;
  modelJson: string;
}> {
  return new Promise((resolve, reject) => {
    const worker = new MLWorker();

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'complete') {
        resolve(payload);
        worker.terminate();
      } else if (type === 'error') {
        reject(new Error(payload));
        worker.terminate();
      } else if (type === 'progress') {
        // Optional: Could expose a progress callback
        // console.log(`Training progress: ${payload}%`);
      }
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    worker.postMessage({
      type: 'train',
      payload: { dataset, targetVariable, features }
    });
  });
}