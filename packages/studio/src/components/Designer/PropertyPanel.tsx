import React, { useCallback, useMemo } from 'react';
import { FiTrash2, FiCopy, FiX } from 'react-icons/fi';
import { useProcessStore, type NodeArgument, type ProcessNodeData } from '../../stores/processStore';

const ArgumentEditor: React.FC<{
  argument: NodeArgument;
  onChange: (arg: NodeArgument) => void;
  onRemove: () => void;
}> = ({ argument, onChange, onRemove }) => {
  const typeOptions = ['string', 'variable', 'expression', 'number', 'boolean'] as const;

  return (
    <div className="argument-editor flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded">
      <div className="flex-1">
        <input
          type="text"
          className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
          value={argument.name}
          onChange={(e) => onChange({ ...argument, name: e.target.value })}
          placeholder="Argument name"
        />
      </div>
      <select
        className="px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
        value={argument.type}
        onChange={(e) =>
          onChange({ ...argument, type: e.target.value as NodeArgument['type'] })
        }
      >
        {typeOptions.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <input
        type="text"
        className="w-32 px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
        value={String(argument.value)}
        onChange={(e) => {
          const value =
            argument.type === 'number'
              ? parseFloat(e.target.value) || 0
              : argument.type === 'boolean'
              ? e.target.value === 'true'
              : e.target.value;
          onChange({ ...argument, value });
        }}
        placeholder="Value"
      />
      <button
        className="p-1 text-slate-400 hover:text-red-500"
        onClick={onRemove}
        title="Remove argument"
      >
        <FiX className="w-4 h-4" />
      </button>
    </div>
  );
};

const PropertyPanel: React.FC = () => {
  const { nodes, selectedNodeId, updateNode, removeNode } = useProcessStore();

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  const handleUpdateData = useCallback(
    (updates: Partial<ProcessNodeData>) => {
      if (!selectedNodeId) return;
      updateNode(selectedNodeId, updates);
    },
    [selectedNodeId, updateNode]
  );

  const handleArgumentChange = useCallback(
    (index: number, argument: NodeArgument) => {
      if (!selectedNode) return;
      const newArguments = [...selectedNode.data.arguments];
      newArguments[index] = argument;
      handleUpdateData({ arguments: newArguments });
    },
    [selectedNode, handleUpdateData]
  );

  const handleAddArgument = useCallback(() => {
    if (!selectedNode) return;
    const newArgument: NodeArgument = {
      name: '',
      type: 'string',
      value: '',
    };
    handleUpdateData({
      arguments: [...selectedNode.data.arguments, newArgument],
    });
  }, [selectedNode, handleUpdateData]);

  const handleRemoveArgument = useCallback(
    (index: number) => {
      if (!selectedNode) return;
      const newArguments = selectedNode.data.arguments.filter((_, i) => i !== index);
      handleUpdateData({ arguments: newArguments });
    },
    [selectedNode, handleUpdateData]
  );

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    removeNode(selectedNodeId);
  }, [selectedNodeId, removeNode]);

  if (!selectedNode) {
    return (
      <div className="property-panel h-full p-4">
        <div className="text-center text-slate-500 dark:text-slate-400">
          <div className="text-sm">No activity selected</div>
          <div className="text-xs mt-1">Select an activity on the canvas to edit properties</div>
        </div>
      </div>
    );
  }

  const { data } = selectedNode;
  const activity = data.activity;

  return (
    <div className="property-panel h-full flex flex-col overflow-hidden">
      <div className="panel-header p-3 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{activity?.name || 'Activity'}</h2>
          <div className="flex items-center gap-1">
            <button
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Duplicate activity"
            >
              <FiCopy className="w-4 h-4" />
            </button>
            <button
              className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
              onClick={handleDeleteNode}
              title="Delete activity"
            >
              <FiTrash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {activity?.library && (
          <div className="text-xs text-slate-500 mt-1">{activity.library}</div>
        )}
      </div>

      <div className="panel-content flex-1 overflow-y-auto p-3 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Description
          </label>
          <textarea
            className="w-full px-2 py-1.5 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 resize-none"
            rows={2}
            value={data.description || ''}
            onChange={(e) => handleUpdateData({ description: e.target.value })}
            placeholder="Add description..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
            Arguments
          </label>
          <div className="space-y-2">
            {data.arguments.map((arg, index) => (
              <ArgumentEditor
                key={index}
                argument={arg}
                onChange={(a) => handleArgumentChange(index, a)}
                onRemove={() => handleRemoveArgument(index)}
              />
            ))}
            <button
              className="w-full px-2 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-700 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
              onClick={handleAddArgument}
            >
              + Add Argument
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Timeout (s)
            </label>
            <input
              type="number"
              className="w-full px-2 py-1.5 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
              value={data.timeout || 30}
              onChange={(e) => handleUpdateData({ timeout: parseInt(e.target.value) || 30 })}
              min={1}
              max={600}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data.continueOnError || false}
                onChange={(e) => handleUpdateData({ continueOnError: e.target.checked })}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-slate-600 dark:text-slate-300">Continue on Error</span>
            </label>
          </div>
        </div>

        {activity?.description && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Documentation
            </label>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {activity.description}
            </div>
          </div>
        )}

        {data.tags && data.tags.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              Tags
            </label>
            <div className="flex flex-wrap gap-1">
              {data.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyPanel;
