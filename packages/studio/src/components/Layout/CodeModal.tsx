import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload, FiFile, FiCode, FiCopy, FiCheck } from 'react-icons/fi';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useFocusTrap } from '../../hooks/useFocusTrap';

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
   const { t } = useTranslation('common');
  const trapRef = useFocusTrap(isOpen);
  const fileEntries = useMemo(() => Object.entries(files || {}), [files]);
  const [selectedFile, setSelectedFile] = useState<string | null>(
    fileEntries[0]?.[0] || null
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelectedFile(fileEntries[0]?.[0] || null);
  }, [fileEntries]);

  if (!isOpen || !code) {
    return null;
  }

  const displayedCode = selectedFile
    ? files?.[selectedFile] || code
    : code;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const lineCount = displayedCode.split('\n').length;
  const fileName = selectedFile || 'process.py';
  const runCommand = `robot ${fileName}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div ref={trapRef as React.RefObject<HTMLDivElement>} className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
              <FiCode className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t('codeModal.exportComplete')}</h2>
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <FiFile className="w-3 h-3" />
                {fileName} — {lineCount} lines — Python
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
              onClick={onDownload}
            >
              <FiDownload className="w-4 h-4" />
              {fileCount > 1 ? t('download_files', { count: fileCount }) : t('download')}
            </button>
            <button
              className="px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
              onClick={onClose}
            >
              {t('close')}
            </button>
          </div>
        </div>

        <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200">
            <span className="font-medium">{t('to_run_standalone')}</span>{' '}
            <code className="bg-green-100 dark:bg-green-800 px-1.5 py-0.5 rounded text-xs">{runCommand}</code>
          </p>
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
        <div className="flex-1 overflow-auto p-4 relative">
          <button
            className="absolute top-6 right-6 z-10 px-2 py-1 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600 flex items-center gap-1"
            onClick={handleCopy}
            aria-label="Copy code"
          >
            {copied ? <FiCheck className="w-3 h-3" /> : <FiCopy className="w-3 h-3" />}
            {copied ? t('copied') : t('copy')}
          </button>
          <SyntaxHighlighter
            language="python"
            style={vscDarkPlus}
            showLineNumbers
            customStyle={{ margin: 0, borderRadius: '0.5rem' }}
          >
            {displayedCode}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
};

export default CodeModal;
