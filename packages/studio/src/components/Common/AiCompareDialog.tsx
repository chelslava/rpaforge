import React, { useState, useEffect } from 'react';
import { FiColumns, FiCheck, FiX, FiZap, FiLoader } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useAiGeneration, type AiGenerateOutcome } from '../../hooks/useAiGeneration';
import type { AiProviderId } from '../../types/ai';

interface AiCompareDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (outcome: AiGenerateOutcome) => void;
}

const AiCompareDialog: React.FC<AiCompareDialogProps> = ({ open, onClose, onApply }) => {
  const { t } = useTranslation('common');
  const { isGenerating, progressSteps, providerStatus, refreshProviderStatus, compare, cancel } = useAiGeneration();
  const [prompt, setPrompt] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<AiProviderId[]>([]);
  const [results, setResults] = useState<AiGenerateOutcome[]>([]);
  const [hasError, setHasError] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string[] | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [detailsCopied, setDetailsCopied] = useState(false);
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => refreshProviderStatus());
  }, [open, refreshProviderStatus]);

  const configuredProviders = providerStatus.filter((status) => status.configured);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setPrompt('');
    setSelectedProviders([]);
    setResults([]);
    setHasError(false);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setDetailsCopied(false);
  };

  const handleClose = () => {
    if (isGenerating) {
      cancel();
    }
    onClose();
  };

  const handleToggleProvider = (providerId: AiProviderId) => {
    setSelectedProviders((prev) =>
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    );
  };

  const handleGenerate = async () => {
    if (selectedProviders.length < 2 || !prompt.trim() || isGenerating) return;

    setHasError(false);
    setErrorDetails(null);
    setShowErrorDetails(false);
    setDetailsCopied(false);

    try {
      const result = await compare(selectedProviders, prompt);
      setResults(result.results);
    } catch (err) {
      setHasError(true);
      setErrorDetails([err instanceof Error ? err.message : String(err)]);
    }
  };

  const handleCopyErrorDetails = () => {
    if (!errorDetails || errorDetails.length === 0) return;
    void navigator.clipboard.writeText(errorDetails.join('\n')).then(() => {
      setDetailsCopied(true);
      setTimeout(() => setDetailsCopied(false), 2000);
    });
  };

  const handleApply = (outcome: AiGenerateOutcome) => {
    if (!outcome.success || !outcome.preview) return;
    onApply(outcome);
  };

  const providerLabel = (id: AiProviderId): string => {
    switch (id) {
      case 'anthropic':
        return t('aiCompare.providerAnthropic', { defaultValue: 'Anthropic' });
      case 'openai-compatible':
        return t('aiCompare.providerOpenAi', { defaultValue: 'OpenAI' });
      case 'gemini':
        return t('aiCompare.providerGemini', { defaultValue: 'Gemini' });
      case 'openrouter':
        return t('aiCompare.providerOpenRouter', { defaultValue: 'OpenRouter' });
      case 'mistral':
        return t('aiCompare.providerMistral', { defaultValue: 'Mistral' });
      case 'groq':
        return t('aiCompare.providerGroq', { defaultValue: 'Groq' });
      case 'ollama':
        return t('aiCompare.providerOllama', { defaultValue: 'Ollama' });
      case 'nvidia-nim':
        return t('aiCompare.providerNvidia', { defaultValue: 'NVIDIA NIM' });
      default:
        return id;
    }
  };

  const formatTokenUsage = (tokenUsage?: { prompt: number; completion: number; total: number; costEstimate?: number }) => {
    if (!tokenUsage) return null;
    const { prompt, completion, total, costEstimate } = tokenUsage;
    return (
      <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="mr-2">
          {t('aiCompare.promptToken', { defaultValue: 'Prompt:' })} {prompt}
        </span>
        <span className="mr-2">
          {t('aiCompare.completionToken', { defaultValue: 'Completion:' })} {completion}
        </span>
        <span className="mr-2">
          {t('aiCompare.totalToken', { defaultValue: 'Total:' })} {total}
        </span>
        {costEstimate !== undefined && costEstimate !== null && (
          <span className="text-slate-400 dark:text-slate-500">
            (≈${costEstimate.toFixed(4)})
          </span>
        )}
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={trapRef as React.RefObject<HTMLDivElement>}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {t('aiCompare.title', { defaultValue: 'Compare AI Providers' })}
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
          {!results.length ? (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {t('aiCompare.disclaimer', { defaultValue: 'Generate diagrams from multiple providers and compare results.' })}
              </p>
              
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('aiCompare.promptPlaceholder', { defaultValue: 'Describe the process you want to generate...' })}
                className="w-full h-32 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                disabled={isGenerating}
                autoFocus
              />

              {configuredProviders.length === 0 ? (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                  {t('aiCompare.noProviderConfigured', { defaultValue: 'No AI providers configured. Please configure providers in settings.' })}
                </p>
              ) : (
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {t('aiCompare.selectProviders', { defaultValue: 'Select at least 2 providers to compare:' })}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900">
                    {configuredProviders.map((status) => (
                      <label
                        key={status.provider}
                        className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors ${
                          selectedProviders.includes(status.provider)
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-500'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedProviders.includes(status.provider)}
                          onChange={() => handleToggleProvider(status.provider)}
                          disabled={isGenerating}
                          className="w-4 h-4 text-indigo-600 dark:text-indigo-400 rounded border-slate-300 dark:border-slate-600 focus:ring-indigo-500"
                        />
                        <span className={`text-sm ${isGenerating ? 'opacity-60' : ''}`}>
                          {providerLabel(status.provider)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {isGenerating && progressSteps.length > 0 && (
                <div className="mt-4 space-y-1.5" aria-live="polite" aria-label={t('aiCompare.progressLabel', { defaultValue: 'Generation in progress' })}>
                  {progressSteps.map((step, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      {step.step === 'complete' ? (
                        <FiCheck className="w-4 h-4 shrink-0 text-green-500" aria-hidden="true" />
                      ) : step.step === 'retry' ? (
                        <FiZap className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
                      ) : (
                        <FiLoader className="w-4 h-4 shrink-0 animate-spin text-indigo-500" aria-hidden="true" />
                      )}
                      <span>{t(`aiCompare.progress.${step.step}`, { attempt: step.attempt, defaultValue: step.step === 'sending' ? 'Sending...' : step.step })}</span>
                    </div>
                  ))}
                </div>
              )}

              {hasError && (
                <div className="mt-3">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {t('aiCompare.generateFailed', { defaultValue: 'Generation failed' })}
                  </p>
                  {errorDetails && errorDetails.length > 0 && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
                        onClick={() => setShowErrorDetails((prev) => !prev)}
                      >
                        {showErrorDetails
                          ? t('aiCompare.hideDetails', { defaultValue: 'Hide details' })
                          : t('aiCompare.showDetails', { defaultValue: 'Show details' })}
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
                            title={t('aiCompare.copyDetails', { defaultValue: 'Copy details' })}
                            aria-label={t('aiCompare.copyDetails', { defaultValue: 'Copy details' })}
                          >
                            {detailsCopied ? (
                              <FiCheck className="w-3.5 h-3.5" />
                            ) : (
                              <FiZap className="w-3.5 h-3.5" />
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
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FiColumns className="w-5 h-5 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t('aiCompare.resultHeading', { defaultValue: 'Comparison Results' })}
                </h3>
              </div>

              {results.map((outcome, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {outcome.success ? (
                        <FiCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <FiX className="w-5 h-5 text-red-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {providerLabel(selectedProviders[index] || 'unknown')}
                        </p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {outcome.preview && (
                            <>
                              <span>
                                {t('aiCompare.nodesCount', { 
                                  defaultValue: '{{count}} nodes', 
                                  count: outcome.preview.nodes.length 
                                })}
                              </span>
                              <span>
                                {t('aiCompare.edgesCount', { 
                                  defaultValue: '{{count}} edges', 
                                  count: outcome.preview.edges.length 
                                })}
                              </span>
                            </>
                          )}
                          {outcome.errors && outcome.errors.length > 0 && (
                            <span className="text-red-500">
                              {t('aiCompare.errorsCount', { 
                                defaultValue: '{{count}} errors', 
                                count: outcome.errors.length 
                              })}
                            </span>
                          )}
                        </div>
                        {formatTokenUsage(outcome.tokenUsage)}
                      </div>
                    </div>

                    <button
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                        outcome.success && outcome.preview
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      }`}
                      onClick={() => handleApply(outcome)}
                      disabled={!outcome.success || !outcome.preview}
                    >
                      {t('aiCompare.apply', { defaultValue: 'Apply' })}
                    </button>
                  </div>
                </div>
              ))}

              {hasError && (
                <div className="mt-3">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {t('aiCompare.generateFailed', { defaultValue: 'Generation failed' })}
                  </p>
                  {errorDetails && errorDetails.length > 0 && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 underline"
                        onClick={() => setShowErrorDetails((prev) => !prev)}
                      >
                        {showErrorDetails
                          ? t('aiCompare.hideDetails', { defaultValue: 'Hide details' })
                          : t('aiCompare.showDetails', { defaultValue: 'Show details' })}
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
                            title={t('aiCompare.copyDetails', { defaultValue: 'Copy details' })}
                            aria-label={t('aiCompare.copyDetails', { defaultValue: 'Copy details' })}
                          >
                            {detailsCopied ? (
                              <FiCheck className="w-3.5 h-3.5" />
                            ) : (
                              <FiZap className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
          {!results.length ? (
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
                  (configuredProviders.length === 0 ||
                    !prompt.trim() ||
                    selectedProviders.length < 2)
                }
                onClick={handleGenerate}
              >
                {isGenerating ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    {t('aiCompare.cancel', { defaultValue: 'Cancel' })}
                  </>
                ) : (
                  <>
                    <FiColumns className="w-4 h-4" />
                    {t('aiCompare.generate', { defaultValue: 'Generate' })}
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                onClick={resetState}
              >
                {t('aiCompare.generateMore', { defaultValue: 'Generate More' })}
              </button>
              <button
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                onClick={handleClose}
              >
                {t('actions.close', { defaultValue: 'Close' })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiCompareDialog;
