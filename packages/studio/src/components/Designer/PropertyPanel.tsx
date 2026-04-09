import React, { useCallback, useMemo, useState } from 'react';
import { FiPlus, FiTrash2, FiX, FiCode } from 'react-icons/fi';
import VariableDialog, { type VariableDefinition } from './VariableDialog';
import VariablePicker from './VariablePicker';
import ExpressionEditor from './ExpressionEditor';
import PythonCodeEditor from './PythonCodeEditor';
import { useVariableStore } from '../../stores/variableStore';
import { useProcessStore, type ProcessNodeData } from '../../stores/processStore';
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
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [editingCodeParam, setEditingCodeParam] = useState<{ name: string; value: string } | null>(null);

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
    return (
      <div className="h-full p-4">
        <div className="text-center text-slate-500 dark:text-slate-400">
          <div className="text-sm">No node selected</div>
          <div className="mt-1 text-xs">Select a block or activity to edit its properties.</div>
        </div>
      </div>
    );
  }

  const { data } = selectedNode;
  const activity = data.activity;
  const blockData = data.blockData;
  const title = activity?.name || blockData?.name || 'Block';
  const subtitle =
    activity?.robotFramework.library ||
    (blockData?.type === 'activity' ? blockData.library : blockData?.category);

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
          <textarea
            className="w-full resize-y rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
            rows={3}
            value={stringifyValue(value)}
            onChange={(event) => updateActivityParam(param.name, event.target.value)}
          />
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
        <input
          type={param.type === 'secret' ? 'password' : 'text'}
          className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={stringifyValue(value)}
          onChange={(event) => updateActivityParam(param.name, event.target.value)}
        />
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
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Process Name
            </label>
            <input
              type="text"
              className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
              value={blockData.processName}
              onChange={(event) => updateBlockData({ processName: event.target.value })}
            />
          </div>
        );
      case 'end':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Status
              </label>
              <select
                className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                value={blockData.status}
                onChange={(event) => updateBlockData({ status: event.target.value })}
              >
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Message
              </label>
              <input
                type="text"
                className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                value={blockData.message || ''}
                onChange={(event) => updateBlockData({ message: event.target.value })}
              />
            </div>
          </>
        );
      case 'if':
        return (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Condition
            </label>
            <ExpressionEditor
              value={blockData.condition}
              onChange={(value) => updateBlockData({ condition: value })}
              variables={variableOptions}
              onCreateNew={() => setShowVariableDialog(true)}
              placeholder="${value} > 0"
              rows={2}
            />
          </div>
        );
      case 'while':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Condition
              </label>
              <ExpressionEditor
                value={blockData.condition}
                onChange={(value) => updateBlockData({ condition: value })}
                variables={variableOptions}
                onCreateNew={() => setShowVariableDialog(true)}
                placeholder="${True}"
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Max Iterations
              </label>
              <input
                type="number"
                min={1}
                className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                value={blockData.maxIterations ?? 100}
                onChange={(event) =>
                  updateBlockData({ maxIterations: Number.parseInt(event.target.value || '100', 10) })
                }
              />
              <div className="mt-1 text-xs text-slate-500">
                Safety limit to prevent infinite loops
              </div>
            </div>
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              <strong>Body</strong> port: Connect activities to execute inside the loop.<br />
              <strong>Next</strong> port: Connect activities to execute after the loop.
            </div>
          </>
        );
      case 'for-each':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Item Variable
              </label>
              <input
                type="text"
                className="w-full rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700"
                value={blockData.itemVariable}
                onChange={(event) => updateBlockData({ itemVariable: event.target.value })}
                placeholder="${item}"
              />
              <div className="mt-1 text-xs text-slate-500">
                Variable name for current item (e.g., ${'{item}'})
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Collection
              </label>
              <VariablePicker
                value={blockData.collection}
                onChange={(value) => updateBlockData({ collection: value })}
                variables={variableOptions}
                onCreateNew={() => setShowVariableDialog(true)}
                placeholder="@{list}"
              />
              <div className="mt-1 text-xs text-slate-500">
                List or iterable variable (e.g., @{'{items}'})
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(blockData.parallel)}
                onChange={(event) => updateBlockData({ parallel: event.target.checked })}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Parallel Execution
              </span>
            </label>
            {blockData.parallel && (
              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300">
                Items will be processed in parallel. Use with caution for side effects.
              </div>
            )}
            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              <strong>Body</strong> port: Connect activities to execute for each item.<br />
              <strong>Next</strong> port: Connect activities to execute after all items.
            </div>
          </>
        );
      case 'switch':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Expression
              </label>
              <input
                type="text"
                className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                value={blockData.expression}
                onChange={(event) => updateBlockData({ expression: event.target.value })}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Cases
                </label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={addSwitchCase}
                >
                  <FiPlus className="h-3.5 w-3.5" />
                  Add case
                </button>
              </div>
              <div className="space-y-2">
                {blockData.cases.length > 0 ? (
                  blockData.cases.map((switchCase, index) => (
                    <div
                      key={switchCase.id}
                      className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Case {index + 1}
                        </span>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                          onClick={() => removeSwitchCase(index)}
                          title="Remove case"
                        >
                          <FiX className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            Label
                          </label>
                          <input
                            type="text"
                            className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                            value={switchCase.label}
                            onChange={(event) =>
                              updateSwitchCase(index, { label: event.target.value })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            Value
                          </label>
                          <input
                            type="text"
                            className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                            value={switchCase.value}
                            onChange={(event) =>
                              updateSwitchCase(index, { value: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                    No cases configured. Add cases to expose dedicated switch outputs.
                  </div>
                )}
              </div>
            </div>
          </>
        );
      case 'parallel':
        return (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
                Branches
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={addParallelBranch}
              >
                <FiPlus className="h-3.5 w-3.5" />
                Add branch
              </button>
            </div>
            <div className="space-y-2">
              {(blockData.branches.length > 0
                ? blockData.branches
                : [
                    { id: 'branch-1', name: 'Branch 1', activities: [] },
                    { id: 'branch-2', name: 'Branch 2', activities: [] },
                  ]).map((branch, index) => (
                <div
                  key={branch.id}
                  className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800"
                >
                  <input
                    type="text"
                    className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                    value={branch.name}
                    onChange={(event) =>
                      updateParallelBranch(index, { name: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                    onClick={() => removeParallelBranch(index)}
                    title="Remove branch"
                    disabled={blockData.branches.length <= 1}
                  >
                    <FiX className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Each branch creates a dedicated parallel output handle on the node.
            </div>
          </div>
        );
      case 'try-catch':
        return (
          <div className="space-y-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Exception handlers
                </label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={addExceptBlock}
                >
                  <FiPlus className="h-3.5 w-3.5" />
                  Add handler
                </button>
              </div>
              <div className="space-y-2">
                {blockData.exceptBlocks.length > 0 ? (
                  blockData.exceptBlocks.map((exceptBlock, index) => (
                    <div
                      key={exceptBlock.id}
                      className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Handler {index + 1}
                        </span>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-red-500 dark:hover:bg-slate-700"
                          onClick={() => removeExceptBlock(index)}
                          title="Remove handler"
                        >
                          <FiX className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            Exception type
                          </label>
                          <input
                            type="text"
                            className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                            value={exceptBlock.exceptionType}
                            onChange={(event) =>
                              updateExceptBlock(index, {
                                exceptionType: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-500">
                            Variable
                          </label>
                          <input
                            type="text"
                            className="w-full rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
                            value={exceptBlock.variable || ''}
                            onChange={(event) =>
                              updateExceptBlock(index, { variable: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
                    No EXCEPT handlers configured. Add one to expose the error path semantics.
                  </div>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(blockData.finallyBlock)}
                onChange={(event) => toggleFinallyBlock(event.target.checked)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Enable FINALLY path
              </span>
            </label>

            <div className="rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">
              Success, EXCEPT and optional FINALLY handles are exposed directly on the block.
            </div>
          </div>
        );
      case 'sub-diagram-call':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Sub-Diagram
              </label>
              <div className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                {(blockData as any).diagramName || 'Not selected'}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Double-click on a sub-diagram from the explorer to configure this call.
              </div>
            </div>
            {(blockData as any).parameters && Object.keys((blockData as any).parameters).length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Parameters
                </label>
                <div className="space-y-1">
                  {Object.entries((blockData as any).parameters).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-indigo-600 dark:text-indigo-400">{key}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-slate-600 dark:text-slate-300">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(blockData as any).returns && Object.keys((blockData as any).returns).length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                  Returns
                </label>
                <div className="space-y-1">
                  {Object.entries((blockData as any).returns).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-600 dark:text-slate-300">{String(value)}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-mono text-green-600 dark:text-green-400">{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
      case 'assign':
        return (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Variable Name
              </label>
              <VariablePicker
                value={blockData.variableName}
                onChange={(value) => updateBlockData({ variableName: value })}
                variables={variableOptions}
                onCreateNew={() => setShowVariableDialog(true)}
                placeholder="${variable_name}"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
                Expression
              </label>
              <ExpressionEditor
                value={blockData.expression}
                onChange={(value) => updateBlockData({ expression: value })}
                variables={variableOptions}
                onCreateNew={() => setShowVariableDialog(true)}
                placeholder="value or ${other_var}"
                rows={2}
              />
            </div>
          </>
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
                {activity.builtin.timeout && (
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

                {activity.builtin.retry && (
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

                {activity.builtin.continueOnError && (
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

                {activity.builtin.nested && (
                  <div className="rounded border border-dashed border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-300">
                    This activity supports nested content / child graph semantics.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
              <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Robot Framework
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Keyword
                  </dt>
                  <dd className="font-mono text-slate-700 dark:text-slate-200">
                    {activity.robotFramework.keyword}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Library
                  </dt>
                  <dd className="font-mono text-slate-700 dark:text-slate-200">
                    {activity.robotFramework.library}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Activity Id
                  </dt>
                  <dd className="font-mono text-slate-700 dark:text-slate-200">
                    {activity.id}
                  </dd>
                </div>
              </dl>
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
    </div>
  );
};

export default PropertyPanel;
