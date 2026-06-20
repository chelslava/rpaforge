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
  FiGrid,
  FiUpload,
  FiZap,
  FiLoader,
  FiCopy,
  FiCheck,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { Edge } from '@xyflow/react';
import { useFileOperations } from '../../hooks/useFileOperations';
import { useAiGeneration, type AiGeneratePreview } from '../../hooks/useAiGeneration';
import { useProjectFsStore } from '../../stores/projectFsStore';
import { useProcessMetadataStore } from '../../stores/processMetadataStore';
import { PROJECT_TEMPLATES, PROCESS_TEMPLATES } from '../../templates';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { MarketplaceDialog } from './MarketplaceDialog';
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
  onClose: () => void;
  onApply: (nodes: ProcessNode[], edges: Edge[], variableNames: string[]) => void;
}

const AiGenerateDialog: React.FC<AiGenerateDialogProps> = ({ isOpen, hasActiveProcess, onClose, onApply }) => {
  const { t } = useTranslation('common');
  const { isGenerating, providerStatus, refreshProviderStatus, generate, cancel } = useAiGeneration();
  const [prompt, setPrompt] = useState('');
  const [providerId, setProviderId] = useState<AiProviderId | ''>('');
  const [preview, setPreview] = useState<AiGeneratePreview | null>(null);
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

  const configuredProviders = providerStatus.filter((status) => status.configured);
  const selectedProviderId = providerId || configuredProviders[0]?.provider || '';

  if (!isOpen) return null;

  const providerLabel = (id: AiProviderId): string =>
    id === 'anthropic' ? t('aiGenerate.providerAnthropic') : t('aiGenerate.providerOpenAi');

  const resetState = () => {
    setPrompt('');
    setPreview(null);
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
    } else {
      setHasError(true);
      setErrorDetails(result.errors ?? null);
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

const FileMenu: React.FC = () => {
  const { t } = useTranslation('common');
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewProcessDialog, setShowNewProcessDialog] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showMarketplaceDialog, setShowMarketplaceDialog] = useState(false);
  const [showImportMermaidDialog, setShowImportMermaidDialog] = useState(false);
  const [showAiGenerateDialog, setShowAiGenerateDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowImportMermaidDialog(true)}
          title={t('fileMenu.importMermaid')}
        >
          <FiUpload className="w-4 h-4" />
          {t('fileMenu.importMermaid')}
        </button>

        <button
          className="px-3 py-1.5 text-sm hover:bg-slate-700 rounded flex items-center gap-1"
          onClick={() => setShowAiGenerateDialog(true)}
          title={t('fileMenu.aiGenerate')}
        >
          <FiZap className="w-4 h-4" />
          {t('fileMenu.aiGenerate')}
        </button>

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
          onClick={() => setShowMarketplaceDialog(true)}
          title={t('marketplace.title', 'Template Marketplace')}
        >
          <FiGrid className="w-4 h-4" />
          {t('marketplace.title', 'Marketplace')}
        </button>

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
        onClose={() => setShowAiGenerateDialog(false)}
        onApply={handleApplyAiDiagram}
      />

      <MarketplaceDialog
        isOpen={showMarketplaceDialog}
        onClose={() => setShowMarketplaceDialog(false)}
        onSelectTemplate={() => {
          setShowMarketplaceDialog(false);
          setShowNewProjectDialog(true);
        }}
        onPreviewTemplate={() => {
          toast.info(t('fileMenu.previewNotAvailable'));
        }}
      />
    </>
  );
};

export default FileMenu;
