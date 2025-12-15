import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { parseCsv, getDatasetStats } from '@/lib/data-processor';
import type { Dataset, ColumnStat } from '@shared/types';
interface AppState {
  rawFile: File | null;
  dataset: Dataset | null;
  datasetStats: Record<string, ColumnStat> | null;
  isProcessing: boolean;
  error: string | null;
}
interface AppActions {
  setFile: (file: File | null) => void;
  processFile: () => Promise<void>;
  clearDataset: () => void;
}
const initialState: AppState = {
  rawFile: null,
  dataset: null,
  datasetStats: null,
  isProcessing: false,
  error: null,
};
export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    ...initialState,
    setFile: (file) => {
      set((state) => {
        state.rawFile = file;
        state.dataset = null;
        state.datasetStats = null;
        state.error = null;
      });
    },
    processFile: async () => {
      const file = useAppStore.getState().rawFile;
      if (!file) return;
      set({ isProcessing: true, error: null });
      try {
        const parsedData = await parseCsv(file);
        if (parsedData.rows.length === 0) {
          throw new Error("CSV file is empty or could not be parsed.");
        }
        const stats = getDatasetStats(parsedData);
        set((state) => {
          state.dataset = parsedData;
          state.datasetStats = stats;
          state.isProcessing = false;
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file processing.";
        console.error("File processing error:", error);
        set({ isProcessing: false, error: errorMessage, dataset: null, datasetStats: null });
      }
    },
    clearDataset: () => {
      set(initialState);
    },
  }))
);