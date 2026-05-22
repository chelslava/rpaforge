import { create } from 'zustand';

interface DesignerState {
  activitySearchQuery: string;
  setActivitySearchQuery: (q: string) => void;
}

export const useDesignerStore = create<DesignerState>((set) => ({
  activitySearchQuery: '',
  setActivitySearchQuery: (q) => set({ activitySearchQuery: q }),
}));
