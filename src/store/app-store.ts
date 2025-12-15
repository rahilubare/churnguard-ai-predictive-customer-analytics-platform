import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { parseFile, getDatasetStats } from '@/lib/data-processor';
import type { Dataset, ColumnStat } from '@shared/types';
import type { ParseError } from 'papaparse';
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
export const useAppStore = create<AppState & AppActions>()(
  immer((set, get) => ({
    ...initialState,
    setFile: (file) => {
      set((state) => {
        state.rawFile = file;
        state.dataset = null;
        state.datasetStats = null;
        state.error = null;
        state.parseErrors = null;
      });
    },
    processFile: async (delimiter?: string) => {
      const file = get().rawFile;
      if (!file) return;
      set({ isProcessing: true, error: null, parseErrors: null });
      try {
        const parsedData = await parseFile(file, delimiter);
        if (parsedData.rows.length === 0) {
          throw new Error("File is empty or could not be parsed.");
        }
        const stats = getDatasetStats(parsedData);
        set((state) => {
          state.dataset = parsedData;
          state.datasetStats = stats;
          state.isProcessing = false;
          state.parseErrors = parsedData.errors || null;
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during file processing.";
        console.error('File processing error:', error);
        set({ isProcessing: false, error: errorMessage, dataset: null, datasetStats: null, parseErrors: (error as any).errors || null });
      }
    },
    clearDataset: () => {
      set(initialState);
    },
  }))
);