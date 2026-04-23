import React, { useState, useEffect } from 'react';
import { FiX, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useDiagramStore, type DiagramMetadata } from '../../stores/diagramStore';

interface DiagramSettingsDialogProps {
  isOpen: boolean;
  diagramId: string | null;
  onClose: () => void;
}

const DiagramSettingsDialog: React.FC<DiagramSettingsDialogProps> = ({
  isOpen,
  diagramId,
  onClose,
}) => {
  const { updateDiagram, getDiagram } = useDiagramStore();
  const [diagram, setDiagram] = useState<DiagramMetadata | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inputs, setInputs] = useState<string[]>([]);
  const [outputs, setOutputs] = useState<string[]>([]);
  const [newInput, setNewInput] = useState('');
  const [newOutput, setNewOutput] = useState('');

  useEffect(() => {
    if (isOpen && diagramId) {
      const diag = getDiagram(diagramId);
      setDiagram(diag);
      if (diag) {
        setName(diag.name);
        setDescription(diag.description || '');
        setInputs(diag.inputs || []);
        setOutputs(diag.outputs || []);
      }
    } else {
      setDiagram(null);
      setName('');
      setDescription('');
      setInputs([]);
      setOutputs([]);
    }
  }, [isOpen, diagramId, getDiagram]);

  if (!isOpen || !diagram) return null;

  const handleSave = () => {
    updateDiagram(diagram.id, {
      name,
      description,
      inputs,
      outputs,
    });
    onClose();
  };

  const addInput = () => {
    if (newInput.trim() && !inputs.includes(newInput.trim())) {
      setInputs([...inputs, newInput.trim()]);
      setNewInput('');
    }
  };

  const removeInput = (index: number) => {
    setInputs(inputs.filter((_, i) => i !== index));
  };

  const addOutput = () => {
    if (newOutput.trim() && !outputs.includes(newOutput.trim())) {
      setOutputs([...outputs, newOutput.trim()]);
      setNewOutput('');
    }
  };

  const removeOutput = (index: number) => {
    setOutputs(outputs.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold">Diagram Settings</h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
            onClick={onClose}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Input Arguments
              <span className="text-xs text-slate-500 ml-2">
                Values passed into the diagram
              </span>
            </label>
            <div className="space-y-2">
              {inputs.map((input, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded font-mono text-sm">
                    {input}
                  </span>
                  <button
                    onClick={() => removeInput(index)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInput}
                  onChange={(e) => setNewInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addInput()}
                  placeholder="argument_name"
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-mono text-sm"
                />
                <button
                  onClick={addInput}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
                >
                  <FiPlus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Output Arguments
              <span className="text-xs text-slate-500 ml-2">
                Values returned from the diagram
              </span>
            </label>
            <div className="space-y-2">
              {outputs.map((output, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded font-mono text-sm">
                    {output}
                  </span>
                  <button
                    onClick={() => removeOutput(index)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOutput}
                  onChange={(e) => setNewOutput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addOutput()}
                  placeholder="result_name"
                  className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 font-mono text-sm"
                />
                <button
                  onClick={addOutput}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
                >
                  <FiPlus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiagramSettingsDialog;
