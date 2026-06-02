import { create } from 'zustand';

interface LoadingState {
  save: boolean;
  load: boolean;
  execute: boolean;
  export: boolean;
  connect: boolean;
  import: boolean;
  open: boolean;
}

interface UIState {
  loading: LoadingState;
  loadingMessage: string | null;
  /** True once the app finished initial loading (splash dismissed). */
  appReady: boolean;
  setLoading: (operation: keyof LoadingState, value: boolean) => void;
  setLoadingMessage: (message: string | null) => void;
  setAppReady: (ready: boolean) => void;
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
    open: false,
  },
  loadingMessage: null,
  appReady: false,

  setLoading: (operation, value) =>
    set((state) => ({
      loading: { ...state.loading, [operation]: value },
    })),

  setLoadingMessage: (message) => set({ loadingMessage: message }),

  setAppReady: (ready) => set({ appReady: ready }),

  isAnyLoading: () => {
    const { loading } = get();
    return Object.values(loading).some((v) => v);
  },
}));
