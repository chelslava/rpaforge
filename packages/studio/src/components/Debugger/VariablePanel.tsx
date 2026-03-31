import React from 'react';

const VariablePanel: React.FC = () => {
  const variables = [
    { name: '${excel_path}', value: 'C:/data/invoice.xlsx', scope: 'global' },
    { name: '${counter}', value: '5', scope: 'test' },
    { name: '${result}', value: 'SUCCESS', scope: 'local' },
  ];

  return (
    <div className="p-4">
      <h2 className="font-semibold mb-4">Variables</h2>
      <div className="space-y-2">
        {variables.map((variable) => (
          <div
            key={variable.name}
            className="flex justify-between items-center p-2 bg-slate-100 dark:bg-slate-800 rounded"
          >
            <div>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">
                {variable.name}
              </span>
              <span className="text-xs text-slate-400 ml-2">({variable.scope})</span>
            </div>
            <span className="font-mono">{variable.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VariablePanel;
