import React, { useCallback } from 'react';
import { FiFolder, FiFile, FiSave } from 'react-icons/fi';
import { createLogger } from '../../utils/logger';

const logger = createLogger('FilePicker');

export type FilePickerMode = 'file' | 'folder' | 'save';

interface FileFilter {
  name: string;
  extensions: string[];
}

interface FilePickerProps {
  value: string;
  onChange: (value: string) => void;
  mode?: FilePickerMode;
  placeholder?: string;
  filters?: FileFilter[];
  disabled?: boolean;
  className?: string;
}

const FilePicker: React.FC<FilePickerProps> = ({
  value,
  onChange,
  mode = 'file',
  placeholder = 'Select a path...',
  filters,
  disabled = false,
  className = '',
}) => {
  const handleBrowse = useCallback(async () => {
    if (!window.rpaforge?.dialog) {
      logger.error('Dialog API not available');
      return;
    }

    try {
      if (mode === 'folder') {
        const result = await window.rpaforge.dialog.showOpenDialog({
          title: 'Select Folder',
          defaultPath: value || undefined,
          properties: ['openDirectory'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          onChange(result.filePaths[0]);
        }
      } else if (mode === 'save') {
        const result = await window.rpaforge.dialog.showSaveDialog({
          title: 'Save File',
          defaultPath: value || undefined,
          filters: filters,
        });
        if (!result.canceled && result.filePath) {
          onChange(result.filePath);
        }
      } else {
        const result = await window.rpaforge.dialog.showOpenDialog({
          title: 'Select File',
          defaultPath: value || undefined,
          filters: filters,
          properties: ['openFile'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          onChange(result.filePaths[0]);
        }
      }
    } catch (error) {
      logger.error('Failed to open file dialog:', error);
    }
  }, [mode, value, filters, onChange]);

  const Icon = mode === 'folder' ? FiFolder : mode === 'save' ? FiSave : FiFile;
  const buttonTitle = mode === 'folder' ? 'Browse folders' : mode === 'save' ? 'Save as...' : 'Browse files';

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded border px-2 py-1.5 text-sm font-mono dark:border-slate-600 dark:bg-slate-700 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={handleBrowse}
        disabled={disabled}
        className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50"
        title={buttonTitle}
      >
        <Icon className="w-4 h-4" />
      </button>
    </div>
  );
};

export default FilePicker;
