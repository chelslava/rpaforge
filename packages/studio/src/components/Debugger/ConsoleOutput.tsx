import React from 'react';

const ConsoleOutput: React.FC = () => {
  const logs = [
    { time: '10:30:01', level: 'INFO', message: 'Starting execution...' },
    { time: '10:30:02', level: 'INFO', message: 'Opening application: notepad.exe' },
    { time: '10:30:03', level: 'INFO', message: 'Window found: Notepad' },
    { time: '10:30:04', level: 'INFO', message: 'Input text: Hello World' },
    { time: '10:30:05', level: 'PASS', message: 'Task completed successfully' },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'PASS':
        return 'text-green-400';
      case 'FAIL':
        return 'text-red-400';
      case 'WARN':
        return 'text-yellow-400';
      default:
        return 'text-blue-400';
    }
  };

  return (
    <div className="flex-1 console-output overflow-auto">
      {logs.map((log, index) => (
        <div key={index} className="flex gap-2">
          <span className="text-slate-500">{log.time}</span>
          <span className={getLevelColor(log.level)}>[{log.level}]</span>
          <span>{log.message}</span>
        </div>
      ))}
    </div>
  );
};

export default ConsoleOutput;
