/**
 * RPAForge Watch Store (issue #836)
 *
 * Debugger watch expressions, persisted per diagram. Runtime evaluation
 * results (value/error) are intentionally NOT persisted — they are refreshed
 * from the engine snapshot on every pause/step via evaluateExpression.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WatchEntry {
  id: string;
  expression: string;
  enabled: boolean;
  /** Runtime state, never persisted */
  status: 'idle' | 'ok' | 'error';
  /** Formatted value when status === 'ok' */
  value?: string;
  valueType?: string;
  /** Error message when status === 'error' */
  error?: string;
}

export interface PersistedWatch {
  id: string;
  expression: string;
  enabled: boolean;
}

interface WatchState {
  watchesByDiagram: Record<string, WatchEntry[]>;
  addWatch: (diagramId: string, expression: string) => void;
  removeWatch: (diagramId: string, id: string) => void;
  updateWatch: (diagramId: string, id: string, expression: string) => void;
  toggleWatch: (diagramId: string, id: string) => void;
  /** Replace runtime results for one diagram (kept out of persistence). */
  setResults: (
    diagramId: string,
    results: Record<
      string,
      { status: WatchEntry['status']; value?: string; valueType?: string; error?: string }
    >,
  ) => void;
  clearDiagramWatches: (diagramId: string) => void;
}

const runtimeFields = {
  status: 'idle' as const,
  value: undefined,
  valueType: undefined,
  error: undefined,
};

export const useWatchStore = create<WatchState>()(
  persist(
    (set) => ({
      watchesByDiagram: {},

      addWatch: (diagramId, expression) =>
        set((state) => {
          const trimmed = expression.trim();
          if (!trimmed) return state;
          const list = state.watchesByDiagram[diagramId] ?? [];
          if (list.some((w) => w.expression === trimmed)) return state;
          return {
            watchesByDiagram: {
              ...state.watchesByDiagram,
              [diagramId]: [
                ...list,
                {
                  id: `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  expression: trimmed,
                  enabled: true,
                  ...runtimeFields,
                },
              ],
            },
          };
        }),

      removeWatch: (diagramId, id) =>
        set((state) => ({
          watchesByDiagram: {
            ...state.watchesByDiagram,
            [diagramId]: (state.watchesByDiagram[diagramId] ?? []).filter(
              (w) => w.id !== id,
            ),
          },
        })),

      updateWatch: (diagramId, id, expression) =>
        set((state) => ({
          watchesByDiagram: {
            ...state.watchesByDiagram,
            [diagramId]: (state.watchesByDiagram[diagramId] ?? []).map((w) =>
              w.id === id
                ? { ...w, expression: expression.trim(), ...runtimeFields }
                : w,
            ),
          },
        })),

      toggleWatch: (diagramId, id) =>
        set((state) => ({
          watchesByDiagram: {
            ...state.watchesByDiagram,
            [diagramId]: (state.watchesByDiagram[diagramId] ?? []).map((w) =>
              w.id === id ? { ...w, enabled: !w.enabled, ...runtimeFields } : w,
            ),
          },
        })),

      setResults: (diagramId, results) =>
        set((state) => ({
          watchesByDiagram: {
            ...state.watchesByDiagram,
            [diagramId]: (state.watchesByDiagram[diagramId] ?? []).map((w) => {
              const result = results[w.id];
              if (!result || !w.enabled) {
                return { ...w, ...runtimeFields };
              }
              return { ...w, ...result };
            }),
          },
        })),

      clearDiagramWatches: (diagramId) =>
        set((state) => {
          const next = { ...state.watchesByDiagram };
          delete next[diagramId];
          return { watchesByDiagram: next };
        }),
    }),
    {
      name: 'rpaforge-watches',
      partialize: (state) => ({
        watchesByDiagram: Object.fromEntries(
          Object.entries(state.watchesByDiagram).map(([diagramId, list]) => [
            diagramId,
            list.map((w) => ({
              id: w.id,
              expression: w.expression,
              enabled: w.enabled,
            })),
          ]),
        ),
      }),
      merge: (persisted, current) => {
        const p = persisted as { watchesByDiagram?: Record<string, PersistedWatch[]> };
        const merged: Record<string, WatchEntry[]> = {};
        for (const [diagramId, list] of Object.entries(
          p?.watchesByDiagram ?? {},
        )) {
          merged[diagramId] = list.map((w) => ({
            ...w,
            ...runtimeFields,
          }));
        }
        return { ...current, watchesByDiagram: merged };
      },
    },
  ),
);

export default useWatchStore;
