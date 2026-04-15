import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FiFile,
  FiSave,
  FiFolder,
  FiDownload,
  FiPlus,
  FiX,
  FiArrowDown,
  FiRepeat,
  FiAlertCircle,
  FiRefreshCw,
  FiArrowRight,
} from 'react-icons/fi';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { PROJECT_TEMPLATES, PROCESS_TEMPLATES } from '../../templates';

const getTemplateIcon = (iconName: string) => {
  switch (iconName) {
    case 'FiFile':
      return <FiFile className="w-6 h-6" />;
    case 'FiArrowDown':
      return <FiArrowDown className="w-6 h-6" />;
    case 'FiRepeat':
      return <FiRepeat className="w-6 h-6" />;
    case 'FiAlertCircle':
      return <FiAlertCircle className="w-6 h-6" />;
    case 'FiRefreshCw':
      return <FiRefreshCw className="w-6 h-6" />;
    case 'FiArrowRight':
      return <FiArrowRight className="w-6 h-6" />;
    default:
      return <FiFile className="w-6 h-6" />;
  }
};

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId?: string) => void;
  onCreateInFolder: (name: string, templateId?: string) => void;
}

const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ isOpen, onClose, onCreate, onCreateInFolder }) => {
  const [name, setName] = useState('New Project');
  const [selectedTemplate, setSelectedTemplate] = useState('empty');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Project</h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
            autoFocus
          />

          <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Project Template</label>
          <div className="grid grid-cols-3 gap-2">
            {PROJECT_TEMPLATES.map((template) => (
              <button
                key={template.metadata.id}
                onClick={() => setSelectedTemplate(template.metadata.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedTemplate === template.metadata.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={`p-2 rounded-lg ${
                    selectedTemplate === template.metadata.id
                      ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {getTemplateIcon(template.metadata.icon)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {template.metadata.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                      {template.metadata.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 border border-indigo-500 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            onClick={() => {
              onCreate(name.trim() || 'New Project', selectedTemplate);
              setName('New Project');
              setSelectedTemplate('empty');
              onClose();
            }}
          >
            Quick Create
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
            onClick={() => {
              onCreateInFolder(name.trim() || 'New Project', selectedTemplate);
              setName('New Project');
              setSelectedTemplate('empty');
              onClose();
            }}
          >
            <FiFolder className="w-4 h-4" />
            Create in Folder
          </button>
        </div>
      </div>
    </div>
  );
};

interface NewProcessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, templateId?: string) => void;
}

const NewProcessDialog: React.FC<NewProcessDialogProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('New Process');
  const [selectedTemplate, setSelectedTemplate] = useState('empty-process');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Process</h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Process Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
            autoFocus
          />

          <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">Process Template</label>
          <div className="grid grid-cols-2 gap-2">
            {PROCESS_TEMPLATES.map((template) => (
              <button
                key={template.metadata.id}
                onClick={() => setSelectedTemplate(template.metadata.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedTemplate === template.metadata.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`p-1.5 rounded ${
                    selectedTemplate === template.metadata.id
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-400'
                  }`}>
                    {getTemplateIcon(template.metadata.icon)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {template.metadata.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {template.metadata.description}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
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
              onCreate(name.trim() || 'New Process', selectedTemplate);
              setName('New Process');
              setSelectedTemplate('empty-process');
              onClose();
            }}
          >
            Create Process
          </button>
        </div>
      </div>
    </div>
  );
};

interface SaveAsDialogProps {
  isOpen: boolean;
  defaultName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

const SaveAsDialog: React.FC<SaveAsDialogProps> = ({ isOpen, defaultName, onClose, onSave }) => {
  const [name, setName] = useState(defaultName);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Save Project As</h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">Project Name</label>
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
              onSave(name.trim() || 'My Project');
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const FileMenu: React.FC = () => {
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewProcessDialog, setShowNewProcessDialog] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isSaving,
    isLoading,
    lastError,
    save,
    saveAs,
    open,
    openProjectFolder,
    newProject,
    newProjectInFolder,
    newProcess,
    exportDiagram,
  } = useFileOperations();

  const projectPath = useProjectFsStore((state) => state.projectPath);

  useEffect(() => {
    if (lastError) {
      toast.error(lastError);
    }
  }, [lastError]);

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const success = await open(file);
      if (success) {
        toast.success(`Opened ${file.name}`);
      }
    }
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    const success = await openProjectFolder();
    if (success) {
      toast.success('Project opened');
    }
  };

  const handleSave = async () => {
    await save();
    if (!lastError) {
      toast.success('Project saved');
    }
  };

  const handleSaveAs = async () => {
    setShowSaveAsDialog(true);
  };

  const handleSaveAsConfirm = async (name: string) => {
    await saveAs(name);
    if (!lastError) {
      toast.success(`Saved as ${name}`);
    }
  };

  const handleNewProject = (name: string, templateId?: string) => {
    newProject(name, templateId);
    toast.success(`Created project: ${name}`);
  };

  const handleNewProjectInFolder = async (name: string, templateId?: string) => {
    const dialog = window.rpaforge?.dialog;
    if (!dialog) {
      toast.error('Dialog API not available');
      return;
    }

    const result = await dialog.showOpenDialog({
      title: 'Select Parent Folder for Project',
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    const parentFolder = result.filePaths[0];
    const success = await newProjectInFolder(name, parentFolder, templateId);
    if (success) {
      toast.success(`Created project: ${name}`);
    }
  };

  const handleNewProcess = (name: string, templateId?: string) => {
    newProcess(name, templateId);
    toast.success(`Created process: ${name}`);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowNewProjectDialog(true)}
          title="New Project"
        >
          <FiPlus className="w-4 h-4" />
          New Project
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowNewProcessDialog(true)}
          title="New Process"
        >
          <FiFile className="w-4 h-4" />
          New Process
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={handleOpenClick}
          disabled={isLoading}
          title="Open File"
        >
          <FiFolder className="w-4 h-4" />
          Open File
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={handleOpenFolder}
          disabled={isLoading}
          title="Open Project Folder"
        >
          <FiFolder className="w-4 h-4" />
          Open Folder
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".rpaforge,.process"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={handleSave}
          disabled={isSaving}
          title="Save Project"
        >
          <FiSave className="w-4 h-4" />
          Save
        </button>

        {!projectPath && (
          <button
            className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
            onClick={handleSaveAs}
            disabled={isSaving}
            title="Save Project As"
          >
            <FiFile className="w-4 h-4" />
            Save As
          </button>
        )}

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={exportDiagram}
          title="Export Project"
        >
          <FiDownload className="w-4 h-4" />
          Export
        </button>
      </div>

      <NewProjectDialog
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
        onCreate={handleNewProject}
        onCreateInFolder={handleNewProjectInFolder}
      />

      <NewProcessDialog
        isOpen={showNewProcessDialog}
        onClose={() => setShowNewProcessDialog(false)}
        onCreate={handleNewProcess}
      />

      <SaveAsDialog
        isOpen={showSaveAsDialog}
        defaultName="My Project"
        onClose={() => setShowSaveAsDialog(false)}
        onSave={handleSaveAsConfirm}
      />
    </>
  );
};

export default FileMenu;
