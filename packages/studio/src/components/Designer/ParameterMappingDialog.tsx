import React, { useEffect, useState } from 'react';
import { FiX, FiArrowRight } from 'react-icons/fi';
import VariablePicker from './VariablePicker';
import type { VariableInfo } from './VariablePicker';
import type { DiagramMetadata } from '../../stores/diagramStore';

interface ParameterMappingDialogProps {
  isOpen: boolean;
  diagram: DiagramMetadata | null;
  currentMapping: Record<string, string>;
  variables: VariableInfo[];
  onSave: (mapping: { inputs: Record<string, string>; outputs: Record<string, string> }) => void;
  onClose: () => void;
  onCreateVariable?: () => void;
}

const ParameterMappingDialog: React.FC<ParameterMappingDialogProps> = ({
  isOpen,
  diagram,
  currentMapping,
  variables,
  onSave,
  onClose,
  onCreateVariable,
}) => {
  const [inputMapping, setInputMapping] = useState<Record<string, string>>({});
  const [outputMapping, setOutputMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && diagram) {
      const inputs: Record<string, string> = {};
      const outputs: Record<string, string> = {};

      diagram.inputs?.forEach((input) => {
        inputs[input] = currentMapping[input] || '';
      });

      diagram.outputs?.forEach((output) => {
        outputs[output] = currentMapping[`output_${output}`] || '';
      });

      setInputMapping(inputs);
      setOutputMapping(outputs);
    }
  }, [isOpen, diagram, currentMapping]);

  if (!isOpen || !diagram) return null;

  const handleInputChange = (param: string, value: string) => {
    setInputMapping((prev) => ({ ...prev, [param]: value }));
  };

  const handleOutputChange = (param: string, value: string) => {
    setOutputMapping((prev) => ({ ...prev, [param]: value }));
  };

  const handleSave = () => {
    onSave({ inputs: inputMapping, outputs: outputMapping });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="font-semibold">Call: {diagram.name}</h3>
            <p className="text-xs text-slate-500">Map parameters for this sub-diagram call</p>
          </div>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
            onClick={onClose}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {diagram.inputs && diagram.inputs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-slate-600 dark:text-slate-300">
                Input Parameters
              </h4>
              <div className="space-y-2">
                {diagram.inputs.map((input) => (
                  <div key={input} className="flex items-center gap-2">
                    <div className="w-32 text-sm font-mono text-indigo-600 dark:text-indigo-400">
                      {input}
                    </div>
                    <FiArrowRight className="w-4 h-4 text-slate-400" />
                    <div className="flex-1">
                      <VariablePicker
                        value={inputMapping[input] || ''}
                        onChange={(value) => handleInputChange(input, value)}
                        variables={variables}
                        onCreateNew={onCreateVariable}
                        placeholder="${variable}"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diagram.outputs && diagram.outputs.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 text-slate-600 dark:text-slate-300">
                Return Values
              </h4>
              <div className="space-y-2">
                {diagram.outputs.map((output) => (
                  <div key={output} className="flex items-center gap-2">
                    <div className="flex-1">
                      <VariablePicker
                        value={outputMapping[output] || ''}
                        onChange={(value) => handleOutputChange(output, value)}
                        variables={variables}
                        onCreateNew={onCreateVariable}
                        placeholder="${result_variable}"
                      />
                    </div>
                    <FiArrowRight className="w-4 h-4 text-slate-400" />
                    <div className="w-32 text-sm font-mono text-green-600 dark:text-green-400">
                      {output}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(!diagram.inputs || diagram.inputs.length === 0) &&
            (!diagram.outputs || diagram.outputs.length === 0) && (
              <div className="text-center text-sm text-slate-500 py-4">
                This sub-diagram has no input or output parameters defined.
                <div className="text-xs mt-1">
                  Edit the diagram to add parameters.
                </div>
              </div>
            )}
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
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParameterMappingDialog;
