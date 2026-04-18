import { create } from 'zustand';

interface SelectionState {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  multiSelectIds: string[];

  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  toggleMultiSelect: (id: string) => void;
  clearSelection: () => void;
  setMultiSelectIds: (ids: string[]) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  multiSelectIds: [],

  setSelectedNode: (id) =>
    set({
      selectedNodeId: id,
      selectedEdgeId: null,
      multiSelectIds: [],
    }),

  setSelectedEdge: (id) =>
    set({
      selectedEdgeId: id,
      selectedNodeId: null,
      multiSelectIds: [],
    }),

  toggleMultiSelect: (id) =>
    set((state) => {
      const isSelected = state.multiSelectIds.includes(id);
      if (isSelected) {
        return {
          multiSelectIds: state.multiSelectIds.filter((i) => i !== id),
        };
      }
      return {
        multiSelectIds: [...state.multiSelectIds, id],
        selectedNodeId: null,
        selectedEdgeId: null,
      };
    }),

  clearSelection: () =>
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      multiSelectIds: [],
    }),

  setMultiSelectIds: (ids) =>
    set({
      multiSelectIds: ids,
      selectedNodeId: null,
      selectedEdgeId: null,
    }),
}));
