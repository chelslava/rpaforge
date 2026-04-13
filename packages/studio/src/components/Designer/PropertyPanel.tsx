import React, { useCallback, useMemo, useState } from 'react';
import { FiTrash2, FiCode, FiMoreHorizontal, FiSettings } from 'react-icons/fi';

import VariableDialog, { type VariableDefinition } from './VariableDialog';
import VariablePicker from './VariablePicker';
import ExpressionEditor from './ExpressionEditor';
import PythonCodeEditor from './PythonCodeEditor';
import ParameterMappingDialog from './ParameterMappingDialog';
import ParallelBlockEditor from './PropertyEditors/ParallelBlockEditor';
import AssignBlockEditor from './PropertyEditors/AssignBlockEditor';
import EndBlockEditor from './PropertyEditors/EndBlockEditor';
import ForEachBlockEditor from './PropertyEditors/ForEachBlockEditor';
import IfBlockEditor from './PropertyEditors/IfBlockEditor';
import StartBlockEditor from './PropertyEditors/StartBlockEditor';
import SubDiagramCallBlockEditor from './PropertyEditors/SubDiagramCallBlockEditor';
import SwitchBlockEditor from './PropertyEditors/SwitchBlockEditor';
import TryCatchBlockEditor from './PropertyEditors/TryCatchBlockEditor';
import WhileBlockEditor from './PropertyEditors/WhileBlockEditor';
import DiagramSettingsDialog from './DiagramSettingsDialog';
import { useVariableStore } from '../../stores/variableStore';
import { useProcessStore, type ProcessNodeData } from '../../stores/processStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { isSubDiagramCallBlock } from '../../types/blocks';
import type { ActivityParam, ActivityParamType } from '../../types/engine';

const multilineParamTypes: ActivityParamType[] = ['code', 'dict', 'expression', 'list'];
const generateNestedId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

const PropertyPanel: React.FC = () => {
  const { nodes, selectedNodeId, updateNode, removeNode } = useProcessStore();
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
    if (!selectedNodeId) {
      return null;
    }

    return nodes.find((node) => node.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const variableOptions = useMemo(
    () =>
      variables.map((variable) => ({
        name: variable.name,
        type: variable.type,
        scope: variable.scope,
        value: variable.value,
      })),
    [variables]
  );

  const handleCreateVariable = (variable: VariableDefinition) => {
    addVariable(variable);
  };

  const handleUpdateNode = useCallback(
    (updates: Partial<ProcessNodeData>) => {
      if (!selectedNodeId) {
        return;
      }

      updateNode(selectedNodeId, updates);
    },
    [selectedNodeId, updateNode]
  );

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }

    removeNode(selectedNodeId);
  }, [removeNode, selectedNodeId]);

  const updateBlockData = useCallback(
    (updates: Record<string, unknown>) => {
      if (!selectedNode?.data.blockData) {
        return;
      }

      handleUpdateNode({
        blockData: {
          ...selectedNode.data.blockData,
          ...updates,
        },
      });
    },
    [handleUpdateNode, selectedNode]
  );

  const updateActivityParam = useCallback(
    (paramName: string, value: unknown) => {
      if (selectedNode?.data.blockData?.type !== 'activity') {
        return;
      }

      handleUpdateNode({
        activityValues: {
          ...(selectedNode.data.activityValues || {}),
          [paramName]: value,
        },
        blockData: {
          ...selectedNode.data.blockData,
          params: {
            ...selectedNode.data.blockData.params,
            [paramName]: value,
          },
        },
      });
    },
    [handleUpdateNode, selectedNode]
  );

  const updateBuiltinSettings = useCallback(
    (updates: Partial<NonNullable<ProcessNodeData['builtinSettings']>>) => {
      handleUpdateNode({
        builtinSettings: {
          ...(selectedNode?.data.builtinSettings || {}),
          ...updates,
        },
      });
    },
    [handleUpdateNode, selectedNode]
  );

  const updateSwitchCase = useCallback(
    (index: number, updates: { value?: string; label?: string }) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'switch') {
        return;
      }

      const nextCases = selectedNode.data.blockData.cases.map((switchCase, currentIndex) =>
        currentIndex === index ? { ...switchCase, ...updates } : switchCase
      );
      updateBlockData({ cases: nextCases });
    },
    [selectedNode, updateBlockData]
  );

  const addSwitchCase = useCallback(() => {
    if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'switch') {
      return;
    }

    updateBlockData({
      cases: [
        ...selectedNode.data.blockData.cases,
        {
          id: generateNestedId('case'),
          value: '',
          label: `Case ${selectedNode.data.blockData.cases.length + 1}`,
        },
      ],
    });
  }, [selectedNode, updateBlockData]);

  const removeSwitchCase = useCallback(
    (index: number) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'switch') {
        return;
      }

      updateBlockData({
        cases: selectedNode.data.blockData.cases.filter((_, currentIndex) => currentIndex !== index),
      });
    },
    [selectedNode, updateBlockData]
  );

  const updateParallelBranch = useCallback(
    (index: number, updates: { name?: string }) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'parallel') {
        return;
      }

      updateBlockData({
        branches: selectedNode.data.blockData.branches.map((branch, currentIndex) =>
          currentIndex === index ? { ...branch, ...updates } : branch
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const addParallelBranch = useCallback(() => {
    if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'parallel') {
      return;
    }

    updateBlockData({
      branches: [
        ...selectedNode.data.blockData.branches,
        {
          id: generateNestedId('branch'),
          name: `Branch ${selectedNode.data.blockData.branches.length + 1}`,
          activities: [],
        },
      ],
    });
  }, [selectedNode, updateBlockData]);

  const removeParallelBranch = useCallback(
    (index: number) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'parallel') {
        return;
      }

      updateBlockData({
        branches: selectedNode.data.blockData.branches.filter(
          (_, currentIndex) => currentIndex !== index
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const updateExceptBlock = useCallback(
    (index: number, updates: { exceptionType?: string; variable?: string }) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
        return;
      }

      updateBlockData({
        exceptBlocks: selectedNode.data.blockData.exceptBlocks.map((exceptBlock, currentIndex) =>
          currentIndex === index ? { ...exceptBlock, ...updates } : exceptBlock
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const addExceptBlock = useCallback(() => {
    if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
      return;
    }

    updateBlockData({
      exceptBlocks: [
        ...selectedNode.data.blockData.exceptBlocks,
        {
          id: generateNestedId('except'),
          exceptionType: 'Exception',
          variable: '',
          handler: [],
        },
      ],
    });
  }, [selectedNode, updateBlockData]);

  const removeExceptBlock = useCallback(
    (index: number) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
        return;
      }

      updateBlockData({
        exceptBlocks: selectedNode.data.blockData.exceptBlocks.filter(
          (_, currentIndex) => currentIndex !== index
        ),
      });
    },
    [selectedNode, updateBlockData]
  );

  const toggleFinallyBlock = useCallback(
    (enabled: boolean) => {
      if (!selectedNode?.data.blockData || selectedNode.data.blockData.type !== 'try-catch') {
        return;
      }

      updateBlockData({
        finallyBlock: enabled ? selectedNode.data.blockData.finallyBlock || [] : undefined,
      });
    },
    [selectedNode, updateBlockData]
  );

  if (!selectedNode) {
    const activeDiagram = activeDiagramId ? getDiagram(activeDiagramId) : null;
    
    return (
      <div className="h-full flex flex-col">
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-700 dark:text-slate-200">
                {activeDiagram?.name || 'Diagram'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {activeDiagram?.type === 'sub-diagram' ? 'Sub-diagram' : 'Main diagram'}
              </div>
            </div>
            {activeDiagram && (
              <button
                onClick={() => setShowDiagramSettings(true)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Diagram settings"
              >
                <FiSettings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        {activeDiagram && (activeDiagram.inputs || activeDiagram.outputs) && (
          <div className="p-3 space-y-3">
            {activeDiagram.inputs && activeDiagram.inputs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Input Arguments
                </div>
                <div className="space-y-1">
                  {activeDiagram.inputs.map((input) => (
                    <div key={input} className="text-sm font-mono text-indigo-600 dark:text-indigo-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">
                      {input}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {activeDiagram.outputs && activeDiagram.outputs.length > 0 && (
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Output Arguments
                </div>
                <div className="space-y-1">
                  {activeDiagram.outputs.map((output) => (
                    <div key={output} className="text-sm font-mono text-green-600 dark:text-green-400 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">
                      {output}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
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
  const subtitle =
    activity?.library ||
    (blockData?.type === 'activity' ? blockData.library : blockData?.category);
  const selectedSubDiagram =
    blockData && isSubDiagramCallBlock(blockData)
      ? getDiagram(blockData.diagramId)
      : undefined;

  const renderParamEditor = (param: ActivityParam) => {
    const value = data.activityValues?.[param.name] ?? param.default ?? '';
    const commonLabel = (
      <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {param.label}
        {param.required && <span className="ml-1 text-red-500">*</span>}
      </label>
    );

    if (param.options.length > 0) {
      return (
        <div key={param.name}>
          {commonLabel}
          <select
            className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
            value={stringifyValue(value)}
            onChange={(event) => updateActivityParam(param.name, event.target.value)}
          >
            {!param.required && <option value="">Select…</option>}
            {param.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {param.description && (
            <div className="mt-1 text-xs text-slate-500">{param.description}</div>
          )}
        </div>
      );
    }

    if (param.type === 'boolean') {
      return (
        <div key={param.name}>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => updateActivityParam(param.name, event.target.checked)}
              className="rounded border-slate-300 dark:border-slate-600"
            />
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {param.label}
            </span>
          </label>
          {param.description && (
            <div className="mt-1 text-xs text-slate-500">{param.description}</div>
          )}
        </div>
      );
    }

    if (param.type === 'variable') {
      return (
        <div key={param.name}>
          {commonLabel}
          <VariablePicker
            value={stringifyValue(value)}
            onChange={(nextValue) => updateActivityParam(param.name, nextValue)}
            variables={variableOptions}
            onCreateNew={() => setShowVariableDialog(true)}
            placeholder={param.description || `Select ${param.label.toLowerCase()}...`}
          />
          {param.description && (
            <div className="mt-1 text-xs text-slate-500">{param.description}</div>
          )}
        </div>
      );
    }

    if (param.type === 'expression') {
      return (
        <div key={param.name}>
          {commonLabel}
          <ExpressionEditor
            value={stringifyValue(value)}
            onChange={(val) => updateActivityParam(param.name, val)}
            variables={variableOptions}
            onCreateNew={() => setShowVariableDialog(true)}
            placeholder={param.description || `Enter ${param.label.toLowerCase()}...`}
            rows={2}
          />
        </div>
      );
    }

    if (multilineParamTypes.includes(param.type)) {
      if (param.type === 'code') {
        const codeValue = stringifyValue(value) || stringifyValue(param.default) || '';
        const lineCount = (codeValue.match(/\n/g) || []).length + 1;
        return (
          <div key={param.name}>
            {commonLabel}
            <div className="flex gap-2">
              <textarea
                className="flex-1 resize-y rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
                rows={lineCount > 3 ? 3 : lineCount}
                value={codeValue}
                onChange={(event) => updateActivityParam(param.name, event.target.value)}
                placeholder={param.description || `Enter ${param.label.toLowerCase()}...`}
              />
              <button
                type="button"
                className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1 self-start"
                onClick={() => {
                  setEditingCodeParam({ name: param.name, value: codeValue });
                  setShowCodeEditor(true);
                }}
                title="Open in code editor"
              >
                <FiCode className="w-4 h-4" />
                Edit
              </button>
            </div>
            {param.description && (
              <div className="mt-1 text-xs text-slate-500">{param.description}</div>
            )}
          </div>
        );
      }
      return (
        <div key={param.name}>
          {commonLabel}
          <div className="flex gap-2">
            <textarea
              className="flex-1 resize-y rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
              rows={3}
              value={stringifyValue(value)}
              onChange={(event) => updateActivityParam(param.name, event.target.value)}
            />
            <button
              type="button"
              className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 self-start"
              onClick={() => {
                setEditingCodeParam({ name: param.name, value: stringifyValue(value) });
                setShowCodeEditor(true);
              }}
              title="Open in editor"
            >
              <FiMoreHorizontal className="w-4 h-4" />
            </button>
          </div>
          {param.description && (
            <div className="mt-1 text-xs text-slate-500">{param.description}</div>
          )}
        </div>
      );
    }

    if (param.type === 'integer' || param.type === 'float') {
      return (
        <div key={param.name}>
          {commonLabel}
          <input
            type="number"
            step={param.type === 'float' ? 'any' : '1'}
            className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
            value={stringifyValue(value)}
            onChange={(event) =>
              updateActivityParam(
                param.name,
                param.type === 'float'
                  ? Number.parseFloat(event.target.value || '0')
                  : Number.parseInt(event.target.value || '0', 10)
              )
            }
          />
          {param.description && (
            <div className="mt-1 text-xs text-slate-500">{param.description}</div>
          )}
        </div>
      );
    }

    return (
      <div key={param.name}>
        {commonLabel}
        <div className="flex gap-2">
          <input
            type={param.type === 'secret' ? 'password' : 'text'}
            className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
            value={stringifyValue(value)}
            onChange={(event) => updateActivityParam(param.name, event.target.value)}
          />
          <button
            type="button"
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
            onClick={() => {
              setEditingCodeParam({ name: param.name, value: stringifyValue(value) });
              setShowCodeEditor(true);
            }}
            title="Open in editor"
          >
            <FiMoreHorizontal className="w-4 h-4" />
          </button>
        </div>
        {param.description && (
          <div className="mt-1 text-xs text-slate-500">{param.description}</div>
        )}
      </div>
    );
  };

  const renderBlockEditor = () => {
    if (!blockData || blockData.type === 'activity') {
      return null;
    }

    switch (blockData.type) {
      case 'start':
        return (
          <StartBlockEditor
            blockData={blockData}
            onUpdateBlockData={updateBlockData}
          />
        );
      case 'end':
        return (
          <EndBlockEditor
            blockData={blockData}
            onUpdateBlockData={updateBlockData}
          />
        );
      case 'if':
        return (
          <IfBlockEditor
            blockData={blockData}
            variables={variableOptions}
            onCreateVariable={() => setShowVariableDialog(true)}
            onUpdateBlockData={updateBlockData}
          />
        );
      case 'while':
        return (
          <WhileBlockEditor
            blockData={blockData}
            variables={variableOptions}
            onCreateVariable={() => setShowVariableDialog(true)}
            onUpdateBlockData={updateBlockData}
          />
        );
      case 'for-each':
        return (
          <ForEachBlockEditor
            blockData={blockData}
            variables={variableOptions}
            onCreateVariable={() => setShowVariableDialog(true)}
            onUpdateBlockData={updateBlockData}
          />
        );
      case 'switch':
        return (
          <SwitchBlockEditor
            blockData={blockData}
            onUpdateBlockData={updateBlockData}
            onUpdateSwitchCase={updateSwitchCase}
            onAddSwitchCase={addSwitchCase}
            onRemoveSwitchCase={removeSwitchCase}
          />
        );
      case 'parallel':
        return (
          <ParallelBlockEditor
            blockData={blockData}
            onUpdateParallelBranch={updateParallelBranch}
            onAddParallelBranch={addParallelBranch}
            onRemoveParallelBranch={removeParallelBranch}
          />
        );
      case 'try-catch':
        return (
          <TryCatchBlockEditor
            blockData={blockData}
            onUpdateExceptBlock={updateExceptBlock}
            onAddExceptBlock={addExceptBlock}
            onRemoveExceptBlock={removeExceptBlock}
            onToggleFinallyBlock={toggleFinallyBlock}
          />
        );
      case 'sub-diagram-call':
        return (
          <SubDiagramCallBlockEditor
            blockData={blockData}
            selectedSubDiagram={selectedSubDiagram}
            onConfigureMappings={() => setShowParameterMappingDialog(true)}
            onOpenDiagram={() => {
              if (selectedSubDiagram) {
                openDiagram(selectedSubDiagram.id);
              }
            }}
          />
        );
      case 'assign':
        return (
          <AssignBlockEditor
            blockData={blockData}
            variables={variableOptions}
            onCreateVariable={() => setShowVariableDialog(true)}
            onUpdateBlockData={updateBlockData}
          />
        );
      default:
        return (
          <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
            This block does not yet expose dedicated property editors.
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-slate-200 p-3 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button
            className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
            onClick={handleDeleteNode}
            title="Delete node"
          >
            <FiTrash2 className="h-4 w-4" />
          </button>
        </div>
        {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Description
          </label>
          <textarea
            className="w-full resize-none rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
            rows={2}
            value={data.description || ''}
            onChange={(event) => handleUpdateNode({ description: event.target.value })}
            placeholder="Add description..."
          />
        </div>

        {activity ? (
          <>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Parameters
              </div>
              <div className="space-y-3">
                {activity.params.length > 0 ? (
                  activity.params.map(renderParamEditor)
                ) : (
                  <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                    This activity does not expose editable SDK params.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Built-in Settings
              </div>
              <div className="space-y-3">
                {activity.timeout_ms > 0 && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                      Timeout (seconds)
                    </label>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                      value={data.builtinSettings?.timeout ?? 30}
                      onChange={(event) =>
                        updateBuiltinSettings({
                          timeout: Number.parseInt(event.target.value || '30', 10),
                        })
                      }
                    />
                  </div>
                )}

                {activity.has_retry && (
                  <div className="space-y-2 rounded bg-slate-50 p-3 dark:bg-slate-800">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(data.builtinSettings?.retryEnabled)}
                        onChange={(event) =>
                          updateBuiltinSettings({ retryEnabled: event.target.checked })
                        }
                        className="rounded border-slate-300 dark:border-slate-600"
                      />
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        Enable retry
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                          Retry Count
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                          value={data.builtinSettings?.retryCount ?? 3}
                          onChange={(event) =>
                            updateBuiltinSettings({
                              retryCount: Number.parseInt(event.target.value || '3', 10),
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                          Retry Interval
                        </label>
                        <input
                          type="text"
                          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                          value={data.builtinSettings?.retryInterval ?? '2s'}
                          onChange={(event) =>
                            updateBuiltinSettings({ retryInterval: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activity.has_continue_on_error && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(data.builtinSettings?.continueOnError)}
                      onChange={(event) =>
                        updateBuiltinSettings({ continueOnError: event.target.checked })
                      }
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      Continue on Error
                    </span>
                  </label>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-3">{renderBlockEditor()}</div>
        )}

        {data.tags && data.tags.length > 0 && (
          <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
            <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {data.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <VariableDialog
        isOpen={showVariableDialog}
        onClose={() => setShowVariableDialog(false)}
        onCreate={handleCreateVariable}
        existingVariables={variables.map((variable) => variable.name)}
      />

      <PythonCodeEditor
        isOpen={showCodeEditor}
        code={editingCodeParam?.value || ''}
        onClose={() => {
          setShowCodeEditor(false);
          setEditingCodeParam(null);
        }}
        onSave={(code) => {
          if (editingCodeParam) {
            updateActivityParam(editingCodeParam.name, code);
          }
        }}
        title={editingCodeParam ? `Edit ${editingCodeParam.name}` : 'Edit Code'}
      />

      <ParameterMappingDialog
        isOpen={showParameterMappingDialog}
        diagram={selectedSubDiagram || null}
        currentMapping={
          blockData && isSubDiagramCallBlock(blockData)
            ? {
                ...blockData.parameters,
                ...Object.fromEntries(
                  Object.entries(blockData.returns || {}).map(([key, value]) => [
                    `output_${key}`,
                    value,
                  ])
                ),
              }
            : {}
        }
        variables={variableOptions}
        onSave={(mapping) => {
          if (!blockData || !isSubDiagramCallBlock(blockData)) {
            return;
          }

          updateBlockData({
            parameters: mapping.inputs,
            returns: mapping.outputs,
          });
        }}
        onClose={() => setShowParameterMappingDialog(false)}
        onCreateVariable={() => setShowVariableDialog(true)}
      />
    </div>
  );
};

export default PropertyPanel;
