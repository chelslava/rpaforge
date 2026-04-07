import React, { useState, useRef } from 'react';
import {
  FiFile,
  FiSave,
  FiFolder,
  FiDownload,
  FiPlus,
  FiX,
} from 'react-icons/fi';
import { useFileOperations } from '../../hooks/useFileOperations';

interface NewFileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

const NewFileDialog: React.FC<NewFileDialogProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('New Process');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Process</h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Process Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => {
              onCreate(name.trim() || 'New Process');
              setName('New Process');
              onClose();
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

const FileMenu: React.FC = () => {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isSaving,
    isLoading,
    lastError,
    save,
    saveAs,
    open,
    newDiagram,
    exportDiagram,
  } = useFileOperations();

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await open(file);
    }
    e.target.value = '';
  };

  const handleSave = async () => {
    await save();
  };

  const handleSaveAs = async () => {
    const name = prompt('Enter process name:', 'My Process');
    if (name) {
      await saveAs(name);
    }
  };

  const handleNew = (name: string) => {
    newDiagram(name);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowNewDialog(true)}
          title="New Process"
        >
          <FiPlus className="w-4 h-4" />
          New
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={handleOpenClick}
          disabled={isLoading}
          title="Open Process"
        >
          <FiFolder className="w-4 h-4" />
          Open
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".rpaforge,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={handleSave}
          disabled={isSaving}
          title="Save Process"
        >
          <FiSave className="w-4 h-4" />
          Save
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={handleSaveAs}
          disabled={isSaving}
          title="Save As"
        >
          <FiFile className="w-4 h-4" />
          Save As
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={exportDiagram}
          title="Export Diagram"
        >
          <FiDownload className="w-4 h-4" />
          Export
        </button>
      </div>

      <NewFileDialog
        isOpen={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreate={handleNew}
      />

      {lastError && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50">
          {lastError}
          <button
            className="ml-2 hover:text-red-200"
            onClick={() => {}}
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  );
};

export default FileMenu;
