import React, { useEffect, useMemo, useState } from 'react';
import { FiDownload } from 'react-icons/fi';

interface CodeModalProps {
  isOpen: boolean;
  code: string | null;
  files?: Record<string, string> | null;
  fileCount?: number;
  onClose: () => void;
  onDownload: () => void;
}

const CodeModal: React.FC<CodeModalProps> = ({
  isOpen,
  code,
  files = null,
  fileCount = 0,
  onClose,
  onDownload,
}) => {
  const fileEntries = useMemo(() => Object.entries(files || {}), [files]);
  const [selectedFile, setSelectedFile] = useState<string | null>(
    fileEntries[0]?.[0] || null
  );

  useEffect(() => {
    setSelectedFile(fileEntries[0]?.[0] || null);
  }, [fileEntries]);

  if (!isOpen || !code) {
    return null;
  }

  const displayedCode = selectedFile
    ? files?.[selectedFile] || code
    : code;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold">Generated Robot Framework Code</h2>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
              onClick={onDownload}
            >
              <FiDownload className="w-4 h-4" />
              {fileCount > 1 ? `Download ${fileCount} Files` : 'Download'}
            </button>
            <button
              className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        {fileEntries.length > 1 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            {fileEntries.map(([path]) => (
              <button
                key={path}
                className={`px-3 py-1 text-sm rounded whitespace-nowrap ${
                  selectedFile === path
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
                onClick={() => setSelectedFile(path)}
              >
                {path}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-sm font-mono bg-slate-100 dark:bg-slate-900 p-4 rounded overflow-x-auto">
            {displayedCode}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default CodeModal;
