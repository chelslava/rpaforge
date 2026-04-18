import { create } from 'zustand';

interface LoadingState {
  save: boolean;
  load: boolean;
  execute: boolean;
  export: boolean;
  connect: boolean;
  import: boolean;
}

interface UIState {
  loading: LoadingState;
  loadingMessage: string | null;
  setLoading: (operation: keyof LoadingState, value: boolean) => void;
  setLoadingMessage: (message: string | null) => void;
  isAnyLoading: () => boolean;
}

export const useUIStore = create<UIState>((set, get) => ({
  loading: {
    save: false,
    load: false,
    execute: false,
    export: false,
    connect: false,
    import: false,
  },
  loadingMessage: null,

  setLoading: (operation, value) =>
    set((state) => ({
      loading: { ...state.loading, [operation]: value },
    })),

  setLoadingMessage: (message) => set({ loadingMessage: message }),

  isAnyLoading: () => {
    const { loading } = get();
    return Object.values(loading).some((v) => v);
  },
}));
