import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2, FiSettings, FiSliders, FiCopy, FiCheck } from 'react-icons/fi';
import { toast } from 'sonner';

import VariableDialog, { type VariableDefinition } from '../VariableDialog';
import PythonCodeEditor from '../PythonCodeEditor';
import ParameterMappingDialog from '../ParameterMappingDialog';
import DiagramSettingsDialog from '../DiagramSettingsDialog';
import ActivityBlockEditor from './editors/ActivityBlockEditor';
import BlockEditorSelector from './editors/BlockEditorSelector';
import { type VariableOption } from './editors/ActivityParamEditor';
import { useBlockDataHandlers } from './hooks/useBlockDataHandlers';
import { useVariableStore } from '../../../stores/variableStore';
import { useBlockStore } from '../../../stores/blockStore';
import { useHistoryStore } from '../../../stores/historyStore';
import { useSelectionStore } from '../../../stores/selectionStore';
import { useDiagramStore, type DiagramMetadata } from '../../../stores/diagramStore';
import { isSubDiagramCallBlock } from '../../../types/blocks';

const PropertyPanel: React.FC = () => {
  const nodes = useBlockStore((state) => state.nodes);
  const updateNode = useBlockStore((state) => state.updateNode);
  const removeNode = useBlockStore((state) => state.removeNode);
  const pushHistory = useHistoryStore((state) => state.pushHistory);
  const selectedNodeId = useSelectionStore((state) => state.selectedNodeId);
  const { variables, addVariable } = useVariableStore();
  const getDiagram = useDiagramStore((state) => state.getDiagram);
  const openDiagram = useDiagramStore((state) => state.openDiagram);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [showParameterMappingDialog, setShowParameterMappingDialog] = useState(false);
  const [editingCodeParam, setEditingCodeParam] = useState<{ name: string; value: string } | null>(null);
  const [showDiagramSettings, setShowDiagramSettings] = useState(false);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((node) => node.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const projectId = useDiagramStore((state) => state.project?.id || '');

  const projectVariables = useMemo(() => {
    if (!projectId) return variables;
    return variables.filter((v) => v.projectId === projectId);
  }, [variables, projectId]);

  const variableOptions = useMemo<VariableOption[]>(
    () => projectVariables.map((v) => ({ name: v.name, type: v.type, scope: v.scope, value: v.value ?? undefined })),
    [projectVariables]
  );

  const handlers = useBlockDataHandlers({ selectedNodeId, selectedNode, updateNode });

  const handleCreateVariable = (variable: VariableDefinition) => addVariable(variable, '', undefined);

  const handleDeleteNode = () => {
    if (!selectedNodeId) return;
    pushHistory(nodes, []);
    removeNode(selectedNodeId);
  };

  if (!selectedNode) {
    const activeDiagram = activeDiagramId ? getDiagram(activeDiagramId) : undefined;
    return (
      <div className="h-full flex flex-col">
        <DiagramHeader diagram={activeDiagram ?? null} onSettings={() => setShowDiagramSettings(true)} />
        <DiagramInputsOutputs diagram={activeDiagram ?? null} />
        <DiagramSettingsDialog
          isOpen={showDiagramSettings}
          diagramId={activeDiagramId}
          onClose={() => setShowDiagramSettings(false)}
        />
      </div>
    );
  }

  const { data } = selectedNode;
  const activity = data.activity;
  const blockData = data.blockData;
  const title = activity?.name || blockData?.name || 'Block';
  const subtitle = activity?.library || (blockData?.type === 'activity' ? blockData.library : blockData?.category);
  const selectedSubDiagram = blockData && isSubDiagramCallBlock(blockData) ? getDiagram(blockData.diagramId) : undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title={title} subtitle={subtitle} nodeId={selectedNodeId || undefined} onDelete={handleDeleteNode} />

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <DescriptionField value={data.description || ''} onChange={(v) => handlers.handleUpdateNode({ description: v })} />

        {activity ? (
          <ActivityBlockEditor
            activity={activity}
            data={data}
            onUpdateActivityParam={handlers.updateActivityParam}
            onUpdateBuiltinSettings={handlers.updateBuiltinSettings}
            onUpdateNode={handlers.handleUpdateNode}
            variables={variableOptions}
            onCreateVariable={() => setShowVariableDialog(true)}
            onOpenCodeEditor={(p) => { setEditingCodeParam(p); setShowCodeEditor(true); }}
          />
        ) : blockData ? (
          <BlockEditorSelector
            blockData={blockData}
            variables={variableOptions}
            onCreateVariable={() => setShowVariableDialog(true)}
            onUpdateBlockData={handlers.updateBlockData}
            onUpdateSwitchCase={handlers.updateSwitchCase}
            onAddSwitchCase={handlers.addSwitchCase}
            onRemoveSwitchCase={handlers.removeSwitchCase}
            onUpdateParallelBranch={handlers.updateParallelBranch}
            onAddParallelBranch={handlers.addParallelBranch}
            onRemoveParallelBranch={handlers.removeParallelBranch}
            onUpdateExceptBlock={handlers.updateExceptBlock}
            onAddExceptBlock={handlers.addExceptBlock}
            onRemoveExceptBlock={handlers.removeExceptBlock}
            onToggleFinallyBlock={handlers.toggleFinallyBlock}
            onConfigureMappings={() => setShowParameterMappingDialog(true)}
            onOpenDiagram={() => selectedSubDiagram && openDiagram(selectedSubDiagram.id)}
            selectedSubDiagram={selectedSubDiagram}
          />
        ) : (
          <NoParametersState blockType={title} />
        )}

        {data.tags && data.tags.length > 0 && <TagsList tags={data.tags} />}
      </div>

      <Dialogs
        showVariableDialog={showVariableDialog}
        showCodeEditor={showCodeEditor}
        showParameterMappingDialog={showParameterMappingDialog}
        editingCodeParam={editingCodeParam}
        variableOptions={variableOptions}
        variables={variables}
        blockData={blockData}
        selectedSubDiagram={selectedSubDiagram}
        onCloseVariableDialog={() => setShowVariableDialog(false)}
        onCreateVariable={handleCreateVariable}
        onCloseCodeEditor={() => { setShowCodeEditor(false); setEditingCodeParam(null); }}
        onSaveCode={(code) => editingCodeParam && handlers.updateActivityParam(editingCodeParam.name, code)}
        onCloseParameterMapping={() => setShowParameterMappingDialog(false)}
        onSaveParameterMapping={(m) => blockData && isSubDiagramCallBlock(blockData) && handlers.updateBlockData({ parameters: m.inputs, returns: m.outputs })}
      />
    </div>
  );
};

const NoParametersState: React.FC<{ blockType: string }> = ({ blockType }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
      <FiSliders className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" aria-hidden="true" />
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {blockType === 'start' || blockType === 'end'
          ? t('propertyPanel.noParamsStartEnd', { type: blockType })
          : t('propertyPanel.noParams')}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
        {t('propertyPanel.documentPurpose')}
      </p>
    </div>
  );
};

const DiagramHeader: React.FC<{ diagram: DiagramMetadata | null; onSettings: () => void }> = ({ diagram, onSettings }) => {
  const { t } = useTranslation();
  return (
    <div className="p-3 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-700 dark:text-slate-200">{diagram?.name || 'Diagram'}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {diagram?.type === 'sub-diagram' ? t('propertyPanel.subDiagram') : t('propertyPanel.mainDiagram')}
          </div>
        </div>
        {diagram && (
          <button onClick={onSettings} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title={t('propertyPanel.diagramSettings')}>
            <FiSettings className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};

const DiagramInputsOutputs: React.FC<{ diagram: DiagramMetadata | null }> = ({ diagram }) => {
  const { t } = useTranslation();
  if (!diagram?.inputs?.length && !diagram?.outputs?.length) return null;
  return (
    <div className="p-3 space-y-3">
      {diagram.inputs && diagram.inputs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('propertyPanel.inputArgs')}</div>
          <div className="space-y-1">
            {diagram.inputs.map((input) => (
              <div key={input} className="text-sm font-mono text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">{input}</div>
            ))}
          </div>
        </div>
      )}
      {diagram.outputs && diagram.outputs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('propertyPanel.outputArgs')}</div>
          <div className="space-y-1">
            {diagram.outputs.map((output) => (
              <div key={output} className="text-sm font-mono text-green-600 dark:text-green-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">{output}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const PanelHeader: React.FC<{ title: string; subtitle?: string; nodeId?: string; onDelete: () => void }> = ({ title, subtitle, nodeId, onDelete }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    if (nodeId) {
      await navigator.clipboard.writeText(nodeId);
      setCopied(true);
      toast.success(t('propertyPanel.nodeIdCopied'));
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border-b border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h2 id="property-panel-title" className="font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          {nodeId && (
            <button
              className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700"
              onClick={handleCopyId}
              title="Copy Node ID"
              aria-label="Copy Node ID"
            >
              {copied ? <FiCheck className="h-4 w-4 text-green-500" /> : <FiCopy className="h-4 w-4" />}
            </button>
          )}
          <button
            className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
            onClick={onDelete}
            aria-label="Delete selected node"
          >
            <FiTrash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
      {nodeId && (
        <div className="mt-1 text-[10px] text-slate-400 font-mono">
          ID: {nodeId.slice(0, 8)}...
        </div>
      )}
    </div>
  );
};

const DescriptionField: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor="block-description" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{t('propertyPanel.description')}</label>
      <textarea
        id="block-description"
        className="w-full resize-none rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('propertyPanel.addDescription')}
      />
    </div>
  );
};

const TagsList: React.FC<{ tags: string[] }> = ({ tags }) => {
  const { t } = useTranslation();
  return (
    <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
      <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">{t('propertyPanel.tags')}</div>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span key={tag} className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">{tag}</span>
        ))}
      </div>
    </div>
  );
};

interface DialogsProps {
  showVariableDialog: boolean;
  showCodeEditor: boolean;
  showParameterMappingDialog: boolean;
  editingCodeParam: { name: string; value: string } | null;
  variableOptions: VariableOption[];
  variables: { name: string }[];
  blockData: Parameters<typeof isSubDiagramCallBlock>[0] | undefined;
  selectedSubDiagram: DiagramMetadata | undefined;
  onCloseVariableDialog: () => void;
  onCreateVariable: (v: VariableDefinition) => void;
  onCloseCodeEditor: () => void;
  onSaveCode: (code: string) => void;
  onCloseParameterMapping: () => void;
  onSaveParameterMapping: (m: { inputs: Record<string, string>; outputs: Record<string, string> }) => void;
}

const Dialogs: React.FC<DialogsProps> = ({
  showVariableDialog, showCodeEditor, showParameterMappingDialog, editingCodeParam,
  variableOptions, variables, blockData, selectedSubDiagram,
  onCloseVariableDialog, onCreateVariable, onCloseCodeEditor, onSaveCode,
  onCloseParameterMapping, onSaveParameterMapping,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <VariableDialog
        isOpen={showVariableDialog}
        onClose={onCloseVariableDialog}
        onCreate={onCreateVariable}
        existingVariables={variables.map((v) => v.name)}
        variables={variableOptions}
      />
      <PythonCodeEditor
        isOpen={showCodeEditor}
        code={editingCodeParam?.value || ''}
        onClose={onCloseCodeEditor}
        onSave={onSaveCode}
        title={editingCodeParam ? t('propertyPanel.editParam', { name: editingCodeParam.name }) : t('propertyPanel.editCode')}
      />
      <ParameterMappingDialog
        isOpen={showParameterMappingDialog}
        diagram={selectedSubDiagram || null}
        currentMapping={blockData && isSubDiagramCallBlock(blockData)
          ? { ...blockData.parameters, ...Object.fromEntries(Object.entries(blockData.returns || {}).map(([k, v]) => [`output_${k}`, String(v)])) }
          : {}}
        variables={variableOptions}
        onSave={onSaveParameterMapping}
        onClose={onCloseParameterMapping}
        onCreateVariable={onCloseVariableDialog}
      />
    </>
  );
};

export default PropertyPanel;
