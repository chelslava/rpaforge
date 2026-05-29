import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiCrosshair, FiX, FiCheck } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import type { PickedElement } from './types';

interface SelectorSpyDialogProps {
  isOpen: boolean;
  mode: 'web' | 'desktop';
  onClose: () => void;
  onSelect: (selector: string, element: PickedElement) => void;
}

const SelectorSpyDialog: React.FC<SelectorSpyDialogProps> = ({
  isOpen,
  mode,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation('common');
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentElement, setCurrentElement] = useState<PickedElement | null>(null);
  const [hint, setHint] = useState(t('selectorSpy.captureHint'));
  
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef(mode);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    modeRef.current = mode;
  });

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    stopPolling();
    setIsCapturing(false);
    setCurrentElement(null);
    onClose();
  }, [stopPolling, onClose]);

  const startPolling = useCallback(() => {
    stopPolling();
    setCurrentElement(null);
    
    pollRef.current = setInterval(async () => {
      if (!window.rpaforge) return;
      
      try {
        const pos = await window.rpaforge.spy.getMousePosition();
        if (pos) {
          const result = await window.rpaforge.spy.getElementAtPosition(pos.x, pos.y, modeRef.current);
          if (result) {
            setCurrentElement(result as PickedElement);
          }
        }
      } catch {
        // ignore errors
      }
    }, 100);
  }, [stopPolling]);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, stopPolling, handleClose]);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    dialog.addEventListener('keydown', trapFocus);
    return () => dialog.removeEventListener('keydown', trapFocus);
  }, [isOpen]);

  useEffect(() => {
    if (!window.rpaforge || !isOpen) return;

    console.log('SelectorSpyDialog: Setting up event listeners');

    const unsubscribe = window.rpaforge.bridge.onEvent((event: unknown) => {
      const e = event as { type: string; active?: boolean; mode?: string; element?: PickedElement };
      console.log('SelectorSpyDialog: Received event', e.type, e);
      
      if (e.type === 'spy:modeChanged') {
        if (e.active) {
          console.log('Spy mode activated');
          setIsCapturing(true);
          setHint(t('selectorSpy.hoverElements'));
          startPolling();
        } else {
          console.log('Spy mode deactivated');
          setIsCapturing(false);
          stopPolling();
          if (currentElement) {
            setHint(t('selectorSpy.elementSelected'));
          } else {
            setHint(t('selectorSpy.spyStopped'));
          }
        }
      }
      
      if (e.type === 'spy:elementCaptured' && e.element) {
        console.log('Element captured:', e.element);
        if (e.mode === modeRef.current) {
          setCurrentElement(e.element);
          setIsCapturing(false);
          stopPolling();
          setHint(t('selectorSpy.elementCaptured'));
        }
      }
    });

    return () => {
      console.log('SelectorSpyDialog: Cleaning up event listeners');
      unsubscribe?.();
      stopPolling();
    };
  }, [isOpen, startPolling, stopPolling, currentElement, t]);

  const handleStart = () => {
    window.rpaforge?.spy.startCapture(mode);
    setIsCapturing(true);
    setCurrentElement(null);
    setHint(t('selectorSpy.hoverElements'));
    startPolling();
  };

  const handleStop = () => {
    stopPolling();
    window.rpaforge?.spy.stopCapture();
    setIsCapturing(false);
    if (currentElement) {
      setHint(t('selectorSpy.elementSelected'));
    } else {
      setHint(t('selectorSpy.spyStopped'));
    }
  };

  const handleUse = (selector: string) => {
    if (currentElement && selector) {
      onSelect(selector, currentElement);
    }
    handleStop();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="selector-spy-title"
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-[600px] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FiCrosshair className="w-5 h-5 text-indigo-600" />
            <h2 id="selector-spy-title" className="text-lg font-semibold text-slate-800 dark:text-white">
              {t('selectorSpy.title')} — {mode === 'web' ? t('selectorSpy.web') : t('selectorSpy.desktop')}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1 rounded hover:bg-slate-100 text-slate-500">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={isCapturing ? handleStop : handleStart}
            className={`px-4 py-2 rounded font-medium ${
              isCapturing
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {isCapturing ? t('selectorSpy.stopCapture') : t('selectorSpy.startCapture')}
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-300">{hint}</span>
        </div>

          {currentElement && (
            <div className="space-y-4">
              <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-lg border border-slate-200 dark:border-slate-600">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{t('selectorSpy.elementInfo')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 mb-1">{t('selectorSpy.tag')}</div>
                    <div className="font-mono text-base text-green-600 dark:text-green-400 font-bold">{currentElement.tag}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">{t('selectorSpy.automationId')}</div>
                    <div className="font-mono text-base text-blue-600 dark:text-blue-400">{currentElement.id || '-'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-slate-500 mb-1">{t('selectorSpy.text')}</div>
                    <div className="font-mono text-sm text-purple-600 dark:text-purple-400 truncate">{currentElement.text || '-'}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-slate-500 mb-1">{t('selectorSpy.class')}</div>
                    <div className="font-mono text-sm text-orange-600 dark:text-orange-400">{currentElement.classes?.join(' ') || '-'}</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('selectorSpy.selectSelector')}</h3>
                
                {currentElement.reliableSelector && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
                    <span className="px-2 py-1 text-xs font-bold rounded bg-green-500 text-white">{t('selectorBadge.best')}</span>
                    <code className="flex-1 text-sm font-mono text-green-800 dark:text-green-300 break-all">
                      {currentElement.reliableSelector.value}
                    </code>
                    <button 
                      onClick={() => handleUse(currentElement.reliableSelector?.value || '')} 
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium"
                    >
                      <FiCheck className="w-4 h-4" /> {t('selectorSpy.useSelector')}
                    </button>
                  </div>
                )}
                
                {currentElement.cssPath && currentElement.cssPath !== currentElement.reliableSelector?.value && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg">
                    <span className="px-2 py-1 text-xs font-bold rounded bg-blue-500 text-white">{t('selectorBadge.css')}</span>
                    <code className="flex-1 text-sm font-mono text-blue-800 dark:text-blue-300 break-all">
                      {currentElement.cssPath}
                    </code>
                    <button 
                      onClick={() => handleUse(currentElement.cssPath)} 
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                    >
                      <FiCheck className="w-4 h-4" /> {t('selectorSpy.useSelector')}
                    </button>
                  </div>
                )}
                
                {currentElement.xpath && (
                  <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 rounded-lg">
                    <span className="px-2 py-1 text-xs font-bold rounded bg-purple-500 text-white">{t('selectorBadge.xpath')}</span>
                    <code className="flex-1 text-sm font-mono text-purple-800 dark:text-purple-300 break-all">
                      {currentElement.xpath}
                    </code>
                    <button 
                      onClick={() => handleUse(currentElement.xpath)} 
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded font-medium"
                    >
                      <FiCheck className="w-4 h-4" /> {t('selectorSpy.useSelector')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end px-4 py-3 border-t">
          <button onClick={handleClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded">
            {t('selectorSpy.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SelectorSpyDialog;
