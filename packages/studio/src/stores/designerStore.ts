import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DesignerState {
  activitySearchQuery: string;
  paletteTab: 'all' | 'recent' | 'favorites';
  recentActivityIds: string[];
  favoriteActivityIds: string[];

  setActivitySearchQuery: (q: string) => void;
  setPaletteTab: (tab: 'all' | 'recent' | 'favorites') => void;
  addRecentActivity: (activityId: string) => void;
  toggleFavoriteActivity: (activityId: string) => void;
  isFavorite: (activityId: string) => boolean;
}

const MAX_RECENT_ACTIVITY_IDS = 10;

export const useDesignerStore = create<DesignerState>()(
  persist(
    (set, get) => ({
      activitySearchQuery: '',
      paletteTab: 'all',
      recentActivityIds: [],
      favoriteActivityIds: [],

      setActivitySearchQuery: (q) => set({ activitySearchQuery: q }),
      setPaletteTab: (tab: 'all' | 'recent' | 'favorites') => set({ paletteTab: tab }),
      
      addRecentActivity: (activityId: string) => {
        set((state) => {
          const filtered = state.recentActivityIds.filter((id) => id !== activityId);
          const updated = [activityId, ...filtered].slice(0, MAX_RECENT_ACTIVITY_IDS);
          return { recentActivityIds: updated };
        });
      },
      
      toggleFavoriteActivity: (activityId: string) => {
        set((state) => {
          const isFavorited = state.favoriteActivityIds.includes(activityId);
          if (isFavorited) {
            return { favoriteActivityIds: state.favoriteActivityIds.filter((id) => id !== activityId) };
          } else {
            return { favoriteActivityIds: [...state.favoriteActivityIds, activityId] };
          }
        });
      },
      
      isFavorite: (activityId: string) => {
        return get().favoriteActivityIds.includes(activityId);
      },
    }),
    {
      name: 'rpaforge-designer',
      partialize: (state) => ({
        recentActivityIds: state.recentActivityIds,
        favoriteActivityIds: state.favoriteActivityIds,
      }),
    }
  )
);
