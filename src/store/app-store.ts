import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { parseFile, getDatasetStats } from '@/lib/data-processor';
import type { Dataset, ColumnStat } from '@shared/types';
import type { ParseError } from 'papaparse';
import { get, set as setKey, del } from 'idb-keyval';
interface AppState {
  rawFile: File | null;
  dataset: Dataset | null;
  datasetStats: Record<string, ColumnStat> | null;
  isProcessing: boolean;
  error: string | null;
  parseErrors: ParseError[] | null;
}
interface AppActions {
  setFile: (file: File | null) => void;
  processFile: (delimiter?: string) => Promise<void>;
  clearDataset: () => void;
}
const initialState: AppState = {
  rawFile: null,
  dataset: null,
  datasetStats: null,
  isProcessing: false,
  error: null,
  parseErrors: null,
};
const DATASET_KEY = 'churnguard_dataset';
const STATS_KEY = 'churnguard_stats';

// Helper to hydrate state from IDB
const hydrate = async () => {
  try {
    const [dataset, stats] = await Promise.all([
      get<Dataset>(DATASET_KEY),
      get<Record<string, ColumnStat>>(STATS_KEY)
    ]);
    if (dataset && stats) {
      useAppStore.setState({ dataset, datasetStats: stats });
    }
  } catch (e) {
    console.error('Failed to hydrate dataset', e);
  }
};

export const useAppStore = create<AppState & AppActions>()(
  immer((set, getStore) => ({
    ...initialState,
    setFile: (file) => {
      set((state) => {
        state.rawFile = file;
        state.dataset = null;
        state.datasetStats = null;
        state.error = null;
        state.parseErrors = null;
      });
      // Clear persistence
      del(DATASET_KEY);
      del(STATS_KEY);
    },
    processFile: async (delimiter?: string) => {
      const file = getStore().rawFile;
      if (!file) return;
      set({ isProcessing: true, error: null, parseErrors: null });
      try {
        const parsedData = await parseFile(file, delimiter);
        if (parsedData.rows.length === 0) {
          throw new Error("File is empty or could not be parsed.");
        }
        const stats = getDatasetStats(parsedData);

        // Persist to IDB
        await Promise.all([
          setKey(DATASET_KEY, parsedData),
          setKey(STATS_KEY, stats)
        ]);

        set((state) => {
          state.dataset = parsedData;
          state.datasetStats = stats;
          state.isProcessing = false;
          state.parseErrors = parsedData.errors || null;
        });
      } catch (error) {
        // Build a detailed error message depending on the error type
        let errorMsg: string;
        if (error instanceof Error) {
          errorMsg = error.message;
        } else if (typeof error === 'object' && error !== null) {
          try {
            // Attempt to stringify the error object
            errorMsg = JSON.stringify(error) || 'Parse failed';
          } catch {
            errorMsg = 'Parse failed';
          }
        } else {
          // Fallback for primitive error values
          errorMsg = String(error) || 'Parse failed';
        }
        console.error(`File processing error: ${errorMsg}`);
        // Reset state and store the derived error message; no parse errors are available here
        set({ isProcessing: false, error: errorMsg, dataset: null, datasetStats: null, parseErrors: null });
      }
    },
    clearDataset: () => {
      set(initialState);
      del(DATASET_KEY);
      del(STATS_KEY);
    },
  }))
);

// Initialize hydration
hydrate();