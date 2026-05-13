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
import { useTranslation } from 'react-i18next';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { PROJECT_TEMPLATES, PROCESS_TEMPLATES } from '../../templates';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const getTemplateIcon = (iconName: string): React.ReactNode => {
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

const NewProjectDialog: React.FC<NewProjectDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
  onCreateInFolder,
}) => {
  const { t } = useTranslation('common');
  const [name, setName] = useState(t('fileMenu.newProject'));
  const [selectedTemplate, setSelectedTemplate] = useState('empty');
  const trapRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('fileMenu.newProject')}
          </h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
            aria-label={t('fileMenu.closeDialog')}
          >
            <FiX className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
            {t('fileMenu.projectName')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
            autoFocus
          />

          <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
            {t('fileMenu.projectTemplate')}
          </label>
          <div className="grid grid-cols-3 gap-2 mb-3">
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
                  <div
                    className={`p-2 rounded-lg ${
                      selectedTemplate === template.metadata.id
                        ? 'bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-300'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
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
          {selectedTemplate && (
            <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-xs">
              {selectedTemplate === 'empty' && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {t('fileMenu.templateEmpty')}
                  </div>
                  <div className="text-slate-500">{t('fileMenu.templateEmptyDesc')}</div>
                  <div className="mt-1 text-slate-400">{t('fileMenu.templateEmptyIncludes')}</div>
                </div>
              )}
              {selectedTemplate === 'simple-sequence' && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {t('fileMenu.templateSimple')}
                  </div>
                  <div className="text-slate-500">{t('fileMenu.templateSimpleDesc')}</div>
                  <div className="mt-1 text-slate-400">{t('fileMenu.templateSimpleIncludes')}</div>
                </div>
              )}
              {selectedTemplate === 'reframework' && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {t('fileMenu.templateRe')}
                  </div>
                  <div className="text-slate-500">{t('fileMenu.templateReDesc')}</div>
                  <div className="mt-1 text-slate-400">{t('fileMenu.templateReIncludes')}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          <button
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            onClick={onClose}
          >
            {t('actions.cancel')}
          </button>
          <button
            className="px-4 py-2 border border-indigo-500 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
            onClick={() => {
              onCreate(name.trim() || t('fileMenu.newProject'), selectedTemplate);
              setName(t('fileMenu.newProject'));
              setSelectedTemplate('empty');
              onClose();
            }}
          >
            {t('fileMenu.quickCreate')}
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-1"
            onClick={() => {
              onCreateInFolder(name.trim() || t('fileMenu.newProject'), selectedTemplate);
              setName(t('fileMenu.newProject'));
              setSelectedTemplate('empty');
              onClose();
            }}
          >
            <FiFolder className="w-4 h-4" />
            {t('fileMenu.createInFolder')}
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
  const { t } = useTranslation('common');
  const [name, setName] = useState(t('fileMenu.newProcess'));
  const [selectedTemplate, setSelectedTemplate] = useState('empty-process');
  const trapRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('fileMenu.newProcess')}
          </h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
            aria-label={t('fileMenu.closeDialog')}
          >
            <FiX className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
            {t('fileMenu.processName')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
            autoFocus
          />

          <label className="block text-sm font-medium mb-2 text-slate-700 dark:text-slate-300">
            {t('fileMenu.processTemplate')}
          </label>
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
                  <div
                    className={`p-1.5 rounded ${
                      selectedTemplate === template.metadata.id
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-400'
                    }`}
                  >
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
            {t('actions.cancel')}
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => {
               onCreate(name.trim() || t('fileMenu.newProcess'), selectedTemplate);
               setName(t('fileMenu.newProcess'));
              setSelectedTemplate('empty-process');
              onClose();
            }}
          >
            {t('fileMenu.createProcess')}
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
  const { t } = useTranslation('common');
  const [name, setName] = useState(defaultName);
  const trapRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('fileMenu.saveProjectAs')}
          </h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={onClose}
            aria-label={t('fileMenu.closeDialog')}
          >
            <FiX className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4">
          <label className="block text-sm font-medium mb-1 text-slate-700 dark:text-slate-300">
            {t('fileMenu.projectName')}
          </label>
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
            {t('actions.cancel')}
          </button>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => {
               onSave(name.trim() || t('fileMenu.myProject'));
              onClose();
            }}
          >
            {t('fileMenu.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

const FileMenu: React.FC = () => {
  const { t } = useTranslation('common');
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
        toast.success(t('fileMenu.opened', { name: file.name }));
      }
    }
    e.target.value = '';
  };

  const handleOpenFolder = async () => {
    const success = await openProjectFolder();
    if (success) {
      toast.success(t('fileMenu.projectOpened'));
    }
  };

  const handleSave = async () => {
    await save();
    if (!lastError) {
      toast.success(t('fileMenu.projectSaved'));
    }
  };

  const handleSaveAs = () => {
    setShowSaveAsDialog(true);
  };

  const handleSaveAsConfirm = async (name: string) => {
    await saveAs(name);
    if (!lastError) {
      toast.success(t('fileMenu.savedAs', { name }));
    }
  };

  const handleNewProject = (name: string, templateId?: string) => {
    newProject(name, templateId);
    toast.success(t('fileMenu.createdProject', { name }));
  };

  const handleNewProjectInFolder = async (name: string, templateId?: string) => {
    const dialog = window.rpaforge?.dialog;
    if (!dialog) {
      toast.error(t('fileMenu.dialogNotAvailable'));
      return;
    }

    const result = await dialog.showOpenDialog({
      title: t('fileMenu.selectFolder'),
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return;
    }

    const parentFolder = result.filePaths[0];
    const success = await newProjectInFolder(name, parentFolder, templateId);
    if (success) {
      toast.success(t('fileMenu.createdProject', { name }));
    }
  };

  const handleNewProcess = (name: string, templateId?: string) => {
    newProcess(name, templateId);
    toast.success(t('fileMenu.createdProcess', { name }));
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowNewProjectDialog(true)}
          title={t('fileMenu.newProject')}
        >
          <FiPlus className="w-4 h-4" />
          {t('fileMenu.newProject')}
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowNewProcessDialog(true)}
          title={t('fileMenu.newProcess')}
        >
          <FiFile className="w-4 h-4" />
          {t('fileMenu.newProcess')}
        </button>

        <button
          className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          onClick={handleOpenClick}
          disabled={isLoading}
          title={t('fileMenu.openFile')}
        >
          {isLoading ? (
            <FiRefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <FiFolder className="w-4 h-4" />
          )}
          {isLoading ? t('status.opening') : t('fileMenu.openFile')}
        </button>

        <button
          className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          onClick={handleOpenFolder}
          disabled={isLoading}
          title={t('fileMenu.openProject')}
        >
          {isLoading ? (
            <FiRefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <FiFolder className="w-4 h-4" />
          )}
          {isLoading ? t('status.opening') : t('fileMenu.openFolder')}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".rpaforge,.process"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1 ${
            isSaving ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          onClick={handleSave}
          disabled={isSaving}
          title={t('fileMenu.saveProject')}
        >
          {isSaving ? (
            <FiRefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <FiSave className="w-4 h-4" />
          )}
          {isSaving ? t('status.saving') : t('fileMenu.save')}
        </button>

        {!projectPath && (
          <button
            className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1 ${
              isSaving ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onClick={handleSaveAs}
            disabled={isSaving}
            title={t('fileMenu.saveAs')}
          >
            {isSaving ? (
              <FiRefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FiFile className="w-4 h-4" />
            )}
            {isSaving ? t('status.saving') : t('actions.saveAs')}
          </button>
        )}

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={exportDiagram}
          title={t('fileMenu.exportProject')}
        >
          <FiDownload className="w-4 h-4" />
          {t('actions.export')}
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
        defaultName={t('fileMenu.myProject')}
        onClose={() => setShowSaveAsDialog(false)}
        onSave={handleSaveAsConfirm}
      />
    </>
  );
};

export default FileMenu;
