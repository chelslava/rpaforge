import React from 'react';

const CallStackPanel: React.FC = () => {
  const frames = [
    { keyword: 'Main Task', file: 'process.robot', line: 5 },
    { keyword: 'Open Application', file: 'process.robot', line: 6 },
    { keyword: 'Input Text', file: 'process.robot', line: 7 },
  ];

  return (
    <div className="p-4">
      <h2 className="font-semibold mb-4">Call Stack</h2>
      <div className="space-y-1">
        {frames.map((frame, index) => (
          <div
            key={index}
            className={`p-2 rounded text-sm ${
              index === 0 ? 'bg-indigo-100 dark:bg-indigo-900' : 'bg-slate-100 dark:bg-slate-800'
            }`}
          >
            <div className="font-medium">{frame.keyword}</div>
            <div className="text-xs text-slate-500">
              {frame.file}:{frame.line}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CallStackPanel;
