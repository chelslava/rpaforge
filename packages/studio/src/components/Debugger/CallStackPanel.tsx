import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiFile } from 'react-icons/fi';
import { useDebuggerStore } from '../../stores/debuggerStore';
import type { CallFrame } from '../../types/engine';

type CallFrameWithLocals = CallFrame & { locals?: Record<string, unknown> };

const CallStackPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const { callStack, currentLine } = useDebuggerStore();

  if (callStack.length === 0) {
    return (
      <div className="p-4">
        <h2 className="font-semibold mb-4">{t('callStack.title')}</h2>
        <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">
          {t('callStack.noCallStack')}
          <div className="text-xs mt-1">{t('callStack.startDebugging')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-slate-200 dark:border-slate-700">
        <h2 className="font-semibold">{t('callStack.title')}</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {callStack.map((frame: CallFrame, index: number) => {
            const f = frame as CallFrameWithLocals;
            const isCurrentFrame = currentLine === frame.line;
            const localsCount = f.locals ? Object.keys(f.locals).length : null;

            return (
              <div
                key={`${frame.library}-${frame.activity}-${frame.line}-${index}`}
                className={`call-stack-frame p-2 rounded text-sm cursor-pointer transition-colors ${
                  isCurrentFrame
                    ? 'bg-indigo-100 dark:bg-indigo-900 border-l-2 border-indigo-500'
                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCurrentFrame ? (
                    <FiChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  ) : (
                    <div className="w-4" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">
                        #{index + 1}
                      </span>
                      <span className="font-medium truncate">{frame.activity}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <FiFile className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 rounded px-0.5">
                        {frame.library}:{frame.line}
                      </span>
                      {localsCount !== null && (
                        <span className="ml-auto flex-shrink-0 text-slate-400 dark:text-slate-500">
                          {localsCount} {t('callStack.vars')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CallStackPanel;
