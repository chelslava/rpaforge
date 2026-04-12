import React from 'react';
import { FiPhone, FiExternalLink } from 'react-icons/fi';
import { useDiagramStore } from '../../stores/diagramStore';

interface SubDiagramCallBlockProps {
  diagramId: string;
  diagramName: string;
  inputs?: string[];
  outputs?: string[];
  parameterMappings?: Record<string, string>;
  outputMappings?: Record<string, string>;
  onOpenDiagram?: (id: string) => void;
}

const SubDiagramCallBlock: React.FC<SubDiagramCallBlockProps> = ({
  diagramId,
  diagramName,
  inputs = [],
  outputs = [],
  parameterMappings = {},
  outputMappings = {},
  onOpenDiagram,
}) => {
  const { getDiagram, openDiagram } = useDiagramStore();

  const targetDiagram = getDiagram(diagramId);
  const displayInputs = targetDiagram?.inputs || inputs;
  const displayOutputs = targetDiagram?.outputs || outputs;

  const handleOpenDiagram = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenDiagram) {
      onOpenDiagram(diagramId);
    } else {
      openDiagram(diagramId);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2">
        <FiPhone className="w-4 h-4 text-indigo-500" />
        <span className="font-medium text-sm text-slate-700 dark:text-slate-300">
          {diagramName}
        </span>
        <button
          className="ml-auto p-1 text-slate-400 hover:text-indigo-500 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          onClick={handleOpenDiagram}
          title="Open diagram"
        >
          <FiExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {displayInputs.length > 0 && (
        <div className="mb-2">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Inputs:</div>
          <div className="space-y-1">
            {displayInputs.map((input) => (
              <div key={input} className="flex items-center gap-1 text-xs">
                <span className="text-slate-600 dark:text-slate-400">{input}:</span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {parameterMappings[input] || `\${${input}}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {displayOutputs.length > 0 && (
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Outputs:</div>
          <div className="space-y-1">
            {displayOutputs.map((output) => (
              <div key={output} className="flex items-center gap-1 text-xs">
                <span className="text-slate-600 dark:text-slate-400">{output}:</span>
                <span className="text-green-600 dark:text-green-400">
                  {outputMappings[output] || `\${${output}}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SubDiagramCallBlock;
