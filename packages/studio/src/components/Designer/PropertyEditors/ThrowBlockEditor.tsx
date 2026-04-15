import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

interface ThrowBlockEditorProps {
  blockData: {
    message?: string;
    exceptionType?: string;
  };
  onUpdateBlockData: (updates: Partial<{ message: string; exceptionType: string }>) => void;
}

const EXCEPTION_TYPES = [
  { value: 'Exception', label: 'Exception', description: 'Generic exception' },
  { value: 'ValueError', label: 'ValueError', description: 'Invalid value' },
  { value: 'TypeError', label: 'TypeError', description: 'Wrong type' },
  { value: 'RuntimeError', label: 'RuntimeError', description: 'Runtime error' },
  { value: 'KeyError', label: 'KeyError', description: 'Key not found' },
  { value: 'IndexError', label: 'IndexError', description: 'Index out of range' },
  { value: 'AttributeError', label: 'AttributeError', description: 'Attribute not found' },
  { value: 'ImportError', label: 'ImportError', description: 'Import failed' },
  { value: 'OSError', label: 'OSError', description: 'OS error' },
  { value: 'TimeoutError', label: 'TimeoutError', description: 'Operation timed out' },
  { value: 'FileNotFoundError', label: 'FileNotFoundError', description: 'File not found' },
  { value: 'PermissionError', label: 'PermissionError', description: 'Permission denied' },
  { value: 'ConnectionError', label: 'ConnectionError', description: 'Connection failed' },
];

const ThrowBlockEditor: React.FC<ThrowBlockEditorProps> = ({
  blockData,
  onUpdateBlockData,
}) => {
  return (
    <div className="space-y-4">
      <div className="rounded border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <FiAlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">Throw Exception</span>
        </div>
        <p className="mt-1 text-xs text-red-500 dark:text-red-300">
          This block will raise an exception and stop execution unless caught by a Try-Catch block.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Exception Type
        </label>
        <select
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          value={blockData.exceptionType || 'Exception'}
          onChange={(e) => onUpdateBlockData({ exceptionType: e.target.value })}
        >
          {EXCEPTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {EXCEPTION_TYPES.find((t) => t.value === (blockData.exceptionType || 'Exception'))?.description}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
          Error Message
        </label>
        <textarea
          className="w-full resize-none rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
          rows={2}
          value={blockData.message || ''}
          onChange={(e) => onUpdateBlockData({ message: e.target.value })}
          placeholder="Enter error message..."
        />
      </div>

      <div className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Generated Code Preview
        </div>
        <pre className="mt-2 text-xs text-slate-700 dark:text-slate-300">
          raise {blockData.exceptionType || 'Exception'}("{blockData.message || 'Error occurred'}")
        </pre>
      </div>
    </div>
  );
};

export default ThrowBlockEditor;
