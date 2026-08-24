import React from 'react';
import { useTranslation } from 'react-i18next';

import ParallelBlockEditor from '../../PropertyEditors/ParallelBlockEditor';
import AssignBlockEditor from '../../PropertyEditors/AssignBlockEditor';
import EndBlockEditor from '../../PropertyEditors/EndBlockEditor';
import ForEachBlockEditor from '../../PropertyEditors/ForEachBlockEditor';
import IfBlockEditor from '../../PropertyEditors/IfBlockEditor';
import StartBlockEditor from '../../PropertyEditors/StartBlockEditor';
import SubDiagramCallBlockEditor from '../../PropertyEditors/SubDiagramCallBlockEditor';
import SwitchBlockEditor from '../../PropertyEditors/SwitchBlockEditor';
import TryCatchBlockEditor from '../../PropertyEditors/TryCatchBlockEditor';
import WhileBlockEditor from '../../PropertyEditors/WhileBlockEditor';
import ThrowBlockEditor from '../../PropertyEditors/ThrowBlockEditor';
import SimpleFieldsBlockEditor, {
  type SimpleFieldSpec,
} from './SimpleFieldsBlockEditor';
import RetryScopeBlockEditor from '../../PropertyEditors/RetryScopeBlockEditor';
import type { BlockData } from '../../../../types/blocks';
import type { DiagramMetadata } from '../../../../stores/diagramStore';
import type { VariableOption } from './ActivityParamEditor';

export interface BlockEditorSelectorProps {
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
  selectedSubDiagram?: DiagramMetadata;
}

const APPROVAL_FIELDS: SimpleFieldSpec[] = [
  { key: 'question', label: 'Question', type: 'textarea', placeholder: 'Approve deployment?' },
  { key: 'approvers_hint', label: 'Approvers hint', type: 'text' },
  { key: 'timeout_ttl', label: 'Timeout TTL (seconds)', type: 'number' },
  {
    key: 'on_reject',
    label: 'On reject',
    type: 'select',
    options: [
      { value: 'fail', label: 'Fail process' },
      { value: 'fallback', label: 'Run rejected branch' },
    ],
  },
  { key: 'output_variable', label: 'Output variable', type: 'text' },
];

const LLM_DECISION_FIELDS: SimpleFieldSpec[] = [
  { key: 'question', label: 'Question', type: 'textarea' },
  { key: 'model', label: 'Model', type: 'text' },
];

const AGENTIC_LOOP_FIELDS: SimpleFieldSpec[] = [
  { key: 'goal', label: 'Goal', type: 'textarea' },
  { key: 'max_iterations', label: 'Max iterations', type: 'number' },
  { key: 'max_total_tokens', label: 'Max total tokens', type: 'number' },
  { key: 'model', label: 'Model', type: 'text' },
  { key: 'output_variable', label: 'Output variable', type: 'text' },
];

const BlockEditorSelector: React.FC<BlockEditorSelectorProps> = ({
  blockData,
  variables,
  onCreateVariable,
  onUpdateBlockData,
  onUpdateSwitchCase,
  onAddSwitchCase,
  onRemoveSwitchCase,
  onUpdateParallelBranch,
  onAddParallelBranch,
  onRemoveParallelBranch,
  onUpdateExceptBlock,
  onAddExceptBlock,
  onRemoveExceptBlock,
  onToggleFinallyBlock,
  onConfigureMappings,
  onOpenDiagram,
  selectedSubDiagram,
}) => {
  const { t } = useTranslation('blocks');

  if (blockData.type === 'activity') {
    return null;
  }

  switch (blockData.type) {
    case 'start':
      return <StartBlockEditor blockData={blockData} onUpdateBlockData={onUpdateBlockData} />;
    case 'end':
      return <EndBlockEditor blockData={blockData} onUpdateBlockData={onUpdateBlockData} />;
    case 'if':
      return (
        <IfBlockEditor
          blockData={blockData}
          variables={variables}
          onCreateVariable={onCreateVariable}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    case 'while':
      return (
        <WhileBlockEditor
          blockData={blockData}
          variables={variables}
          onCreateVariable={onCreateVariable}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    case 'for-each':
      return (
        <ForEachBlockEditor
          blockData={blockData}
          variables={variables}
          onCreateVariable={onCreateVariable}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    case 'switch':
      return (
        <SwitchBlockEditor
          blockData={blockData}
          onUpdateBlockData={onUpdateBlockData}
          onUpdateSwitchCase={onUpdateSwitchCase}
          onAddSwitchCase={onAddSwitchCase}
          onRemoveSwitchCase={onRemoveSwitchCase}
        />
      );
    case 'parallel':
      return (
        <ParallelBlockEditor
          blockData={blockData}
          onUpdateParallelBranch={onUpdateParallelBranch}
          onAddParallelBranch={onAddParallelBranch}
          onRemoveParallelBranch={onRemoveParallelBranch}
        />
      );
    case 'try-catch':
      return (
        <TryCatchBlockEditor
          blockData={blockData}
          onUpdateExceptBlock={onUpdateExceptBlock}
          onAddExceptBlock={onAddExceptBlock}
          onRemoveExceptBlock={onRemoveExceptBlock}
          onToggleFinallyBlock={onToggleFinallyBlock}
        />
      );
    case 'sub-diagram-call':
      return (
        <SubDiagramCallBlockEditor
          blockData={blockData}
          selectedSubDiagram={selectedSubDiagram}
          onConfigureMappings={onConfigureMappings}
          onOpenDiagram={onOpenDiagram}
        />
      );
    case 'assign':
      return (
        <AssignBlockEditor
          blockData={blockData}
          variables={variables}
          onCreateVariable={onCreateVariable}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    case 'throw':
      return <ThrowBlockEditor blockData={blockData} onUpdateBlockData={onUpdateBlockData} />;
    case 'retry-scope':
      return <RetryScopeBlockEditor blockData={blockData} onUpdateBlockData={onUpdateBlockData} />;
    case 'llm-decision':
      return (
        <SimpleFieldsBlockEditor
          blockData={blockData}
          fields={LLM_DECISION_FIELDS}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    case 'agentic-loop':
      return (
        <SimpleFieldsBlockEditor
          blockData={blockData}
          fields={AGENTIC_LOOP_FIELDS}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    case 'approval':
      return (
        <SimpleFieldsBlockEditor
          blockData={blockData}
          fields={APPROVAL_FIELDS}
          onUpdateBlockData={onUpdateBlockData}
        />
      );
    default:
      return (
        <div className="rounded border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
          {t('blocks:noEditor')}
        </div>
      );
  }
};

export default BlockEditorSelector;
