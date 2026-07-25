import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  FiFile,
  FiFileText,
  FiSave,
  FiFolder,
  FiFolderPlus,
  FiDownload,
  FiPlus,
  FiX,
  FiArrowDown,
  FiRepeat,
  FiAlertCircle,
  FiRefreshCw,
  FiArrowRight,
  FiGrid,
  FiUpload,
  FiZap,
  FiLoader,
  FiCopy,
  FiCheck,
  FiColumns,
  FiPlay,
  FiPause,
  FiSquare,
  FiActivity,
  FiCode,
  FiArrowDownCircle,
  FiArrowDownRight,
  FiArrowUpCircle,
  FiSun,
  FiMoon,
  FiBox,
  FiInfo,
  FiSettings,
} from 'react-icons/fi';
import { FaProjectDiagram } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { Edge } from '@xyflow/react';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useAiGeneration, type AiGeneratePreview } from '../../hooks/useAiGeneration';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';
import { useExecutionStore } from '../../stores/executionStore';
import { useDebuggerStore } from '../../stores/debuggerStore';
import { useBlockStore } from '../../stores/blockStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useEngine } from '../../hooks/useEngine';
import { PROJECT_TEMPLATES, PROCESS_TEMPLATES } from '../../templates';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { MarketplaceDialog } from './MarketplaceDialog';
import AiPromptLibrary from './AiPromptLibrary';
import AiCompareDialog from './AiCompareDialog';
import SettingsDialog from './SettingsDialog';
import HelpDialog from './HelpDialog';
import SecurityAuditDialog from './SecurityAuditDialog';
import { readFileAsText } from '../../utils/fileUtils';
import type { ProcessNode } from '../../stores/blockStore';
import type { AiProviderId } from '../../types/ai';

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
  onOpenMarketplace: () => void;
}

const NewProjectDialog: React.FC<NewProjectDialogProps> = ({
  isOpen,
  onClose,
  onCreate,
  onCreateInFolder,
  onOpenMarketplace,
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
                        <div className="text-slate-500 dark:text-slate-400">{t('fileMenu.templateEmptyDesc')}</div>
                        <div className="mt-1 text-slate-400 dark:text-slate-500">{t('fileMenu.templateEmptyIncludes')}</div>
                </div>
              )}
              {selectedTemplate === 'simple-sequence' && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {t('fileMenu.templateSimple')}
                  </div>
                        <div className="text-slate-500 dark:text-slate-400">{t('fileMenu.templateSimpleDesc')}</div>
                        <div className="mt-1 text-slate-400 dark:text-slate-500">{t('fileMenu.templateSimpleIncludes')}</div>
                </div>
              )}
              {selectedTemplate === 'reframework' && (
                <div>
                  <div className="font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {t('fileMenu.templateRe')}
                  </div>
                        <div className="text-slate-500 dark:text-slate-400">{t('fileMenu.templateReDesc')}</div>
                        <div className="mt-1 text-slate-400 dark:text-slate-500">{t('fileMenu.templateReIncludes')}</div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => {
                onClose();
                onOpenMarketplace();
              }}
              className="w-full px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <FiGrid className="w-4 h-4" />
              {t('marketplace.browse', 'Browse Template Marketplace')}
            </button>
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

interface MermaidImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (code: string) => void;
}

const MermaidImportDialog: React.FC<MermaidImportDialogProps> = ({ isOpen, onClose, onImport }) => {
  const { t } = useTranslation('common');
  const [code, setCode] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const content = await readFileAsText(file);
      setCode(content);
    }
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('fileMenu.importMermaidTitle')}
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
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('fileMenu.pasteMermaidPlaceholder')}
            className="w-full h-64 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
            autoFocus
          />

          <button
            className="mt-3 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <FiUpload className="w-4 h-4" />
            {t('fileMenu.uploadMermaidFile')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mmd,.mermaid,.txt,.md"
            onChange={handleFileChange}
            className="hidden"
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
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!code.trim()}
            onClick={() => {
              onImport(code);
              setCode('');
            }}
          >
            {t('fileMenu.import')}
          </button>
        </div>
      </div>
    </div>
  );
};

interface AiGenerateDialogProps {
  isOpen: boolean;
  hasActiveProcess: boolean;
  initialPrompt?: string;
  onClose: () => void;
  onApply: (nodes: ProcessNode[], edges: Edge[], variableNames: string[]) => void;
}

const AiGenerateDialog: React.FC<AiGenerateDialogProps> = ({ isOpen, hasActiveProcess, initialPrompt, onClose, onApply }) => {
  const { t } = useTranslation('common');
  const { isGenerating, progressSteps, providerStatus, refreshProviderStatus, generate, cancel } = useAiGeneration();
  const [prompt, setPrompt] = useState('');
  const [providerId, setProviderId] = useState<AiProviderId | ''>('');
  const [preview, setPreview] = useState<AiGeneratePreview | null>(null);
  const [generationResult, setGenerationResult] = useState<import('../../hooks/useAiGeneration').AiGenerateOutcome | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const trapRef = useFocusTrap(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    // Defer to a microtask so the effect body doesn't call setState synchronously
    // (refreshProviderStatus does) — same pattern as useDesigner.ts's refreshActivities.
    void Promise.resolve().then(() => refreshProviderStatus());
  }, [isOpen, refreshProviderStatus]);

  // Apply initialPrompt when dialog opens with a pending prompt from Prompt Library
  useEffect(() => {
    if (!isOpen || !initialPrompt) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) setPrompt(initialPrompt);
    });

    return () => {
      active = false;
    };
  }, [isOpen, initialPrompt]);

  const configuredProviders = providerStatus.filter((status) => status.configured);
  const selectedProviderId = providerId || configuredProviders[0]?.provider || '';

  if (!isOpen) return null;

  const providerLabel = (id: AiProviderId): string =>
    id === 'anthropic' ? t('aiGenerate.providerAnthropic') : t('aiGenerate.providerOpenAi');

  const resetState = () => {
    setPrompt('');
    setPreview(null);
    setGenerationResult(null);
    setHasError(false);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setDetailsCopied(false);
  };

  const handleClose = () => {
    if (isGenerating) {
      cancel();
    }
    resetState();
    onClose();
  };

  const handleGenerate = async () => {
  if (!selectedProviderId || isGenerating) return;
  setHasError(false);
  setErrorDetails(null);
  setShowErrorDetails(false);
  setDetailsCopied(false);
  const result = await generate(prompt, selectedProviderId);
  if (result.success && result.preview) {
      setPreview(result.preview);
      setGenerationResult(result);
  } else {
      setHasError(true);
      setErrorDetails(result.errors ?? null);
      setGenerationResult(result);
  }
};

  const handleCopyErrorDetails = () => {
    if (!errorDetails || errorDetails.length === 0) return;
    void navigator.clipboard.writeText(errorDetails.join('\n')).then(() => {
      setDetailsCopied(true);
      setTimeout(() => setDetailsCopied(false), 2000);
    });
  };

  const handleApply = () => {
    if (!preview) return;
    onApply(preview.nodes, preview.edges, preview.variableNames);
    resetState();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('fileMenu.aiGenerateTitle')}
          </h2>
          <button
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
            onClick={handleClose}
            aria-label={t('fileMenu.closeDialog')}
          >
            <FiX className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {!preview ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('aiGenerate.disclaimer')}</p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('aiGenerate.promptPlaceholder')}
                className="w-full h-40 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                disabled={isGenerating}
                autoFocus
              />

              {!hasActiveProcess ? (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                  {t('aiGenerate.noActiveProcess')}
                </p>
              ) : configuredProviders.length === 0 ? (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                  {t('aiGenerate.noProviderConfigured')}
                </p>
              ) : (
                <select
                  value={selectedProviderId}
                  onChange={(e) => setProviderId(e.target.value as AiProviderId)}
                  disabled={isGenerating}
                  className="mt-3 w-full appearance-none px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                >
                  {configuredProviders.map((status) => (
                    <option key={status.provider} value={status.provider}>
                      {providerLabel(status.provider)}
                    </option>
                  ))}
                </select>
              )}

              {isGenerating && progressSteps.length > 0 && (
                <div className="mt-3 space-y-1.5" aria-live="polite" aria-label={t('aiGenerate.progressLabel')}>
                  {progressSteps.map((step, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      {step.step === 'complete' ? (
                        <FiCheck className="w-4 h-4 shrink-0 text-green-500" aria-hidden="true" />
                      ) : step.step === 'retry' ? (
                        <FiRepeat className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
                      ) : (
                        <FiLoader className="w-4 h-4 shrink-0 animate-spin text-indigo-500" aria-hidden="true" />
                      )}
                      <span>{t(`aiGenerate.progress.${step.step}`, { attempt: step.attempt })}</span>
                    </div>
                  ))}
                </div>
              )}

              {hasError && (
                <div className="mt-3">
                  <p className="text-sm text-red-600 dark:text-red-400">{t('aiGenerate.generateFailed')}</p>
                  {errorDetails && errorDetails.length > 0 && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
                        onClick={() => setShowErrorDetails((prev) => !prev)}
                      >
                        {showErrorDetails ? t('aiGenerate.hideDetails') : t('aiGenerate.showDetails')}
                      </button>
                      {showErrorDetails && (
                        <div className="mt-2 relative">
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-2 pr-8 text-xs bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 font-mono">
                            {errorDetails.join('\n')}
                          </pre>
                          <button
                            type="button"
                            className="absolute top-1.5 right-1.5 p-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                            onClick={handleCopyErrorDetails}
                            title={t('aiGenerate.copyDetails')}
                            aria-label={t('aiGenerate.copyDetails')}
                          >
                            {detailsCopied ? (
                              <FiCheck className="w-3.5 h-3.5" />
                            ) : (
                              <FiCopy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-700 dark:text-slate-300">
              <p>{t('aiGenerate.previewSummary', { nodes: preview.nodes.length, edges: preview.edges.length })}</p>
              {preview.variableNames.length > 0 && (
                <p className="mt-2 text-slate-500 dark:text-slate-400">
                  {t('aiGenerate.previewVariables', { count: preview.variableNames.length })}
                </p>
              )}
              {preview.warnings.length > 0 && (
                <p className="mt-2 text-amber-600 dark:text-amber-400">
                  {t('aiGenerate.previewWarnings', { count: preview.warnings.length })}
                </p>
              )}
              <p className="mt-2 text-slate-500 dark:text-slate-400">{t('aiGenerate.previewHint')}</p>
              {generationResult?.tokenUsage && (
              <div className="mt-2 flex gap-3 text-xs text-slate-400 dark:text-slate-500">
                  <span>Prompt: {generationResult.tokenUsage.prompt}</span>
                  <span>Completion: {generationResult.tokenUsage.completion}</span>
                  <span>Total: {generationResult.tokenUsage.total}</span>
                  {generationResult.tokenUsage.costEstimate !== undefined && (
                    <span>≈ ${generationResult.tokenUsage.costEstimate.toFixed(4)}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          {preview ? (
            <>
              <button
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={resetState}
              >
                {t('aiGenerate.discard')}
              </button>
              <button
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                onClick={handleApply}
              >
                {t('aiGenerate.apply')}
              </button>
            </>
          ) : (
            <>
              <button
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={handleClose}
              >
                {t('actions.cancel')}
              </button>
              <button
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={
                  !isGenerating &&
                  (!hasActiveProcess || !prompt.trim() || !selectedProviderId || configuredProviders.length === 0)
                }
                onClick={isGenerating ? cancel : handleGenerate}
              >
                {isGenerating ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    {t('aiGenerate.cancel')}
                  </>
                ) : (
                  t('aiGenerate.generate')
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface FileMenuProps {
  onPlay?: () => void;
  onDebug?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onExportCode?: () => void;
  onShowMermaid?: () => void;
  onShowLibraryBrowser?: () => void;
  onStepOver?: () => void;
  onStepInto?: () => void;
  onStepOut?: () => void;
}

const noop = () => {};

const FileMenu: React.FC<FileMenuProps> = ({
  onPlay = noop,
  onDebug = noop,
  onPause = noop,
  onResume = noop,
  onStop = noop,
  onExportCode = noop,
  onShowMermaid = noop,
  onShowLibraryBrowser = noop,
  onStepOver = noop,
  onStepInto = noop,
  onStepOut = noop,
}) => {
  const { t } = useTranslation('common');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewProcessDialog, setShowNewProcessDialog] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showMarketplaceDialog, setShowMarketplaceDialog] = useState(false);
  const [showImportMermaidDialog, setShowImportMermaidDialog] = useState(false);
  const [showAiGenerateDialog, setShowAiGenerateDialog] = useState(false);
  const [showAiCompareDialog, setShowAiCompareDialog] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [pendingPromptText, setPendingPromptText] = useState('');
  const [activeGroup, setActiveGroup] = useState<string | null>('file');
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSecurityAudit, setShowSecurityAudit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isRunning, isPaused } = useEngine();
  const isStepLoading = useDebuggerStore((s) => s.isStepLoading);
  const executionSpeed = useExecutionStore((s) => s.executionSpeed);
  const setExecutionSpeed = useExecutionStore((s) => s.setExecutionSpeed);
  const hasMetadata = !!useProcessMetadataStore((s) => s.metadata);
  const hasNodes = useBlockStore((s) => s.nodes.length > 0);
  const toggleTheme = useSettingsStore((state) => state.toggleTheme);
  const resolvedTheme = useResolvedTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setActiveGroup(prev => (prev === group ? null : group));
  }, []);

  const {
    isSaving,
    isLoading,
    lastError,
    save,
    saveAs,
    open,
    importMermaid,
    applyAiDiagram,
    openProjectFolder,
    newProject,
    newProjectInFolder,
    newProcess,
    exportDiagram,
  } = useFileOperations();

  const projectPath = useProjectFsStore((state) => state.projectPath);
  const hasActiveProcess = useProcessMetadataStore((state) => state.metadata !== null);

  useEffect(() => {
    if (lastError) {
      toast.error(lastError);
    }
  }, [lastError]);

  const handleOpenClick = () => {
    fileInputRef.current?.click();
  };

  const handleSelectPrompt = (promptText: string) => {
    setPendingPromptText(promptText);
    setShowPromptLibrary(false);
    setShowAiGenerateDialog(true);
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

  const handleImportMermaid = async (code: string) => {
    const result = await importMermaid(code);
    setShowImportMermaidDialog(false);

    if (!result.success) {
      toast.error(t('fileMenu.mermaidImportFailed'));
      return;
    }

    if (result.warnings.length > 0) {
      toast.warning(t('fileMenu.mermaidImportedWithWarnings', { count: result.warnings.length }));
    } else {
      toast.success(t('fileMenu.mermaidImported'));
    }
  };

  const handleApplyAiDiagram = (nodes: ProcessNode[], edges: Edge[], variableNames: string[]) => {
    const success = applyAiDiagram(nodes, edges, variableNames);
    if (success) {
      toast.success(t('fileMenu.aiGenerateApplied'));
    } else {
      toast.error(t('fileMenu.aiGenerateApplyFailed'));
    }
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

  const groupMeta = [
    { id: 'file', label: t('fileMenu.groupFile'), icon: <FiFile className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'process', label: t('fileMenu.groupProcess'), icon: <FiSave className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'ai', label: t('fileMenu.groupAiTools'), icon: <FiZap className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'execute', label: t('fileMenu.groupExecute'), icon: <FiPlay className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'tools', label: t('fileMenu.groupTools'), icon: <FiSettings className="w-3.5 h-3.5 shrink-0" /> },
  ] as const;

  return (
    <>
      <div className="flex flex-col gap-0">
        {/* Row 1: Group toggle tabs */}
        <div className="flex items-stretch gap-0 overflow-x-auto border-b border-slate-600/20 dark:border-slate-500/20">
          {groupMeta.map((g) => {
            const active = activeGroup === g.id;
            return (
              <button
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'text-blue-400 border-blue-400 bg-slate-700/30'
                    : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-700/20'
                }`}
              >
                {g.icon}
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Row 2: Buttons of active group */}
        {activeGroup && (
          <div className="overflow-x-auto py-0.5">
            <div className="flex items-stretch gap-0 flex-nowrap px-1">
              {activeGroup === 'file' && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowNewProjectDialog(true)}
                    title={t('fileMenu.newProject')}
                  >
                    <FiPlus className="w-4 h-4 shrink-0" />
                    <span>{t('fileMenu.newProject')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowNewProcessDialog(true)}
                    title={t('fileMenu.newProcess')}
                  >
                    <FiFile className="w-4 h-4 shrink-0" />
                    <span>{t('fileMenu.newProcess')}</span>
                  </button>
                  <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                  <button
                    className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleOpenClick}
                    disabled={isLoading}
                    title={t('fileMenu.openFile')}
                  >
                    {isLoading ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <FiFolder className="w-4 h-4 shrink-0" />
                    )}
                    <span>{isLoading ? t('status.opening') : t('fileMenu.openFile')}</span>
                  </button>
                  <button
                    className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleOpenFolder}
                    disabled={isLoading}
                    title={t('fileMenu.openFolder')}
                  >
                    {isLoading ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <FiFolderPlus className="w-4 h-4 shrink-0" />
                    )}
                    <span>{isLoading ? t('status.opening') : t('fileMenu.openFolder')}</span>
                  </button>
                </div>
              )}

              {activeGroup === 'process' && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={handleSave}
                    disabled={isSaving}
                    title={t('fileMenu.saveProject')}
                  >
                    {isSaving ? (
                      <FiRefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <FiSave className="w-4 h-4 shrink-0" />
                    )}
                    <span>{isSaving ? t('status.saving') : t('fileMenu.save')}</span>
                  </button>
                  {!projectPath && (
                    <button
                      className={`px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={handleSaveAs}
                      disabled={isSaving}
                      title={t('fileMenu.saveAs')}
                    >
                      {isSaving ? (
                        <FiRefreshCw className="w-4 h-4 animate-spin shrink-0" />
                      ) : (
                        <FiSave className="w-4 h-4 shrink-0" />
                      )}
                      <span>{isSaving ? t('status.saving') : t('actions.saveAs')}</span>
                    </button>
                  )}
                  <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={exportDiagram}
                    title={t('fileMenu.exportProject')}
                  >
                    <FiDownload className="w-4 h-4 shrink-0" />
                    <span>{t('actions.export')}</span>
                  </button>
                  <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowImportMermaidDialog(true)}
                    title={t('fileMenu.importMermaid')}
                  >
                    <FiUpload className="w-4 h-4 shrink-0" />
                    <span>{t('fileMenu.importMermaid')}</span>
                  </button>
                </div>
              )}

              {activeGroup === 'ai' && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowAiGenerateDialog(true)}
                    title={t('fileMenu.aiGenerate')}
                  >
                    <FiZap className="w-4 h-4 shrink-0" />
                    <span>{t('fileMenu.aiGenerate')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowAiCompareDialog(true)}
                    title={t('fileMenu.aiCompare', { defaultValue: 'Compare Providers' })}
                  >
                    <FiColumns className="w-4 h-4 shrink-0" />
                    <span>{t('fileMenu.aiCompare', { defaultValue: 'Compare' })}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowPromptLibrary(true)}
                    title={t('fileMenu.promptLibrary')}
                  >
                    <FiFileText className="w-4 h-4 shrink-0" />
                    <span>{t('fileMenu.promptLibrary')}</span>
                  </button>
                </div>
              )}

              {activeGroup === 'execute' && (
                <div className="flex items-center gap-1 px-2 py-1">
                  {!isRunning && (
                    <>
                      <button
                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={onPlay}
                        disabled={!hasMetadata}
                        title={!hasMetadata ? t('toolbar.openOrCreateProject') : t('toolbar.runProcessF5')}
                      >
                        <FiPlay className="w-4 h-4 shrink-0" />
                        <span>{t('toolbar.run')}</span>
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={onDebug}
                        disabled={!hasMetadata}
                        title={!hasMetadata ? t('toolbar.openOrCreateProject') : t('toolbar.debug')}
                      >
                        <FiActivity className="w-4 h-4 shrink-0" />
                        <span>{t('toolbar.debug')}</span>
                      </button>
                    </>
                  )}
                  {isRunning && (
                    <>
                      {isPaused ? (
                        <button
                          className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded-md flex items-center gap-1.5 font-medium"
                          onClick={onResume}
                        >
                          <FiPlay className="w-4 h-4 shrink-0" />
                          <span>{t('toolbar.resume')}</span>
                        </button>
                      ) : (
                        <button
                          className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 rounded-md flex items-center gap-1.5 font-medium"
                          onClick={onPause}
                        >
                          <FiPause className="w-4 h-4 shrink-0" />
                          <span>{t('toolbar.pause')}</span>
                        </button>
                      )}
                      {isPaused && (
                        <>
                          <div className="w-px h-5 bg-slate-600/30 mx-1" />
                          <button
                            className="px-2.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50"
                            onClick={onStepOver}
                            disabled={isStepLoading}
                            title={t('toolbar.stepOver')}
                          >
                            <FiArrowDownCircle className="w-4 h-4 shrink-0" />
                            <span>{t('toolbar.over')}</span>
                          </button>
                          <button
                            className="px-2.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50"
                            onClick={onStepInto}
                            disabled={isStepLoading}
                            title={t('toolbar.stepInto')}
                          >
                            <FiArrowDownRight className="w-4 h-4 shrink-0" />
                            <span>{t('toolbar.into')}</span>
                          </button>
                          <button
                            className="px-2.5 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50"
                            onClick={onStepOut}
                            disabled={isStepLoading}
                            title={t('toolbar.stepOut')}
                          >
                            <FiArrowUpCircle className="w-4 h-4 shrink-0" />
                            <span>{t('toolbar.out')}</span>
                          </button>
                        </>
                      )}
                      <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                      <button
                        className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 rounded-md flex items-center gap-1.5 font-medium"
                        onClick={onStop}
                      >
                        <FiSquare className="w-4 h-4 shrink-0" />
                        <span>{t('toolbar.stop')}</span>
                      </button>
                    </>
                  )}
                  <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                  <div className="flex items-center gap-1 px-2 py-1 bg-slate-700/40 rounded-md">
                    <FiActivity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={executionSpeed}
                      onChange={(e) => setExecutionSpeed(parseFloat(e.target.value) as 0.5 | 1 | 2 | 5)}
                      className="bg-transparent text-white text-xs rounded px-1 py-0.5 border-none outline-none cursor-pointer"
                      disabled={isRunning}
                      aria-label={t('toolbar.executionSpeed')}
                    >
                      {([0.5, 1, 2, 5] as const).map((speed) => (
                        <option key={speed} value={speed} className="bg-slate-800">
                          {speed}x
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {activeGroup === 'tools' && (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowMarketplaceDialog(true)}
                    title={t('marketplace.title', 'Template Marketplace')}
                  >
                    <FiGrid className="w-4 h-4 shrink-0" />
                    <span>{t('marketplace.title', 'Marketplace')}</span>
                  </button>
                  <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50"
                    onClick={onExportCode}
                    disabled={!hasNodes}
                    title={!hasNodes ? t('toolbar.addBlocksFirst') : t('toolbar.export')}
                  >
                    <FiCode className="w-4 h-4 shrink-0" />
                    <span>{t('toolbar.export')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium disabled:opacity-50"
                    onClick={onShowMermaid}
                    disabled={!hasNodes}
                    title={!hasNodes ? t('toolbar.addBlocksFirst') : t('toolbar.viewMermaid')}
                  >
                    <FaProjectDiagram className="w-4 h-4 shrink-0" />
                    <span>{t('toolbar.diagram')}</span>
                  </button>
                  <div className="w-px h-5 bg-slate-600/30 mx-1.5" />
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={onShowLibraryBrowser}
                    title={t('toolbar.libraries')}
                  >
                    <FiBox className="w-4 h-4 shrink-0" />
                    <span>{t('toolbar.libraries')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowSettings(true)}
                    title={t('toolbar.settings')}
                  >
                    <FiSettings className="w-4 h-4 shrink-0" />
                    <span>{t('toolbar.settings')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => toggleTheme(resolvedTheme)}
                    title={resolvedTheme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')}
                  >
                    {resolvedTheme === 'dark' ? <FiSun className="w-4 h-4 shrink-0" /> : <FiMoon className="w-4 h-4 shrink-0" />}
                    <span>{resolvedTheme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowAbout(true)}
                    title={t('toolbar.about')}
                  >
                    <FiInfo className="w-4 h-4 shrink-0" />
                    <span>{t('toolbar.about')}</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium"
                    onClick={() => setShowSecurityAudit(true)}
                    title="View Security Log"
                  >
                    <FiFileText className="w-4 h-4 shrink-0" />
                    <span>Security Log</span>
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded-md flex items-center gap-1.5 font-medium font-bold"
                    onClick={() => setShowShortcuts(true)}
                    title={t('toolbar.keyboardShortcuts')}
                  >
                    <span>?</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".rpaforge,.process"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <NewProjectDialog
        isOpen={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
        onCreate={handleNewProject}
        onCreateInFolder={handleNewProjectInFolder}
        onOpenMarketplace={() => setShowMarketplaceDialog(true)}
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

      <MermaidImportDialog
        isOpen={showImportMermaidDialog}
        onClose={() => setShowImportMermaidDialog(false)}
        onImport={handleImportMermaid}
      />

      <AiGenerateDialog
        isOpen={showAiGenerateDialog}
        hasActiveProcess={hasActiveProcess}
        initialPrompt={pendingPromptText}
        onClose={() => {
          setShowAiGenerateDialog(false);
          setPendingPromptText('');
        }}
        onApply={handleApplyAiDiagram}
      />

      <AiPromptLibrary
        open={showPromptLibrary}
        onClose={() => setShowPromptLibrary(false)}
        onSelectPrompt={handleSelectPrompt}
      />

      <AiCompareDialog
        open={showAiCompareDialog}
        onClose={() => setShowAiCompareDialog(false)}
        onApply={(outcome) => {
          if (outcome.preview) {
            handleApplyAiDiagram(outcome.preview.nodes, outcome.preview.edges, outcome.preview.variableNames);
          }
        }}
      />

      <MarketplaceDialog
        isOpen={showMarketplaceDialog}
        onClose={() => setShowMarketplaceDialog(false)}
        onSelectTemplate={(templateId) => {
          setShowMarketplaceDialog(false);
          newProject('New Project', templateId);
          toast.success(t('fileMenu.createdProject', { name: 'New Project' }));
        }}
        onPreviewTemplate={() => {
          toast.info(t('fileMenu.previewNotAvailable'));
        }}
      />

      {showAbout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-ui-surface rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-ui-text">{t('about.title')}</h2>
              <button className="p-1 rounded hover:bg-ui-surface-hover" onClick={() => setShowAbout(false)}>
                <FiX className="w-5 h-5 text-ui-text-muted" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-ui-text-muted">
              <p className="font-medium text-ui-text text-base">{t('about.subtitle')}</p>
              <p>{t('about.description')}</p>
              <div className="bg-ui-surface-muted rounded p-3">
                <div className="font-medium text-ui-text mb-2">{t('about.quickStart')}</div>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>{t('about.step1')}</li>
                  <li>{t('about.step2')}</li>
                  <li>{t('about.step3')}</li>
                  <li>{t('about.step4')}</li>
                  <li>{t('about.step5')}</li>
                </ol>
              </div>
              <p className="text-xs text-ui-text-subtle">{t('about.version', { version: __APP_VERSION__ })}</p>
            </div>
          </div>
        </div>
      )}

      <SettingsDialog open={showSettings} onClose={() => setShowSettings(false)} />
      <HelpDialog open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <SecurityAuditDialog open={showSecurityAudit} onClose={() => setShowSecurityAudit(false)} />
    </>
  );
};

export default FileMenu;
