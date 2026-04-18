import type { BlockData } from '../../../../types/blocks';
import type { VariableOption } from './ActivityParamEditor';

export interface BlockEditorProps {
  blockData: BlockData;
  variables: VariableOption[];
  onCreateVariable: () => void;
  onUpdateBlockData: (updates: Record<string, unknown>) => void;
  onUpdateSwitchCase: (index: number, updates: { value?: string; label?: string }) => void;
  onAddSwitchCase: () => void;
  onRemoveSwitchCase: (index: number) => void;
  onUpdateParallelBranch: (index: number, updates: { name?: string }) => void;
  onAddParallelBranch: () => void;
  onRemoveParallelBranch: (index: number) => void;
  onUpdateExceptBlock: (index: number, updates: { exceptionType?: string; variable?: string }) => void;
  onAddExceptBlock: () => void;
  onRemoveExceptBlock: (index: number) => void;
  onToggleFinallyBlock: (enabled: boolean) => void;
  onConfigureMappings: () => void;
  onOpenDiagram: () => void;
  selectedSubDiagram?: { id: string; name: string } | null;
}
