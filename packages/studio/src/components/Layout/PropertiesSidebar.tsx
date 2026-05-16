import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PropertyPanel } from '../Designer/PropertyPanel';
import VariablesPanel from '../Designer/VariablesPanel';
import CallStackPanel from '../Debugger/CallStackPanel';
import ExecutionHistoryPanel from '../Debugger/ExecutionHistoryPanel';

interface PropertiesSidebarProps {
  width: number;
  isDebugging: boolean;
}

const PropertiesSidebar: React.FC<PropertiesSidebarProps> = React.memo(({ width, isDebugging }) => {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<'properties' | 'variables'>('properties');

  return (
    <aside style={{ width }} className="overflow-hidden flex-shrink-0 flex flex-col">
      {isDebugging ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col">
            <PropertyPanel />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden border-t border-slate-200 dark:border-slate-700">
            <div className="flex-1 overflow-hidden">
              <ExecutionHistoryPanel />
            </div>
            <div className="flex-1 overflow-hidden border-t border-slate-200 dark:border-slate-700">
              <CallStackPanel />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${tab === 'properties' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              onClick={() => setTab('properties')}
            >
              {t('sidebar.properties')}
            </button>
            <button
              className={`flex-1 px-3 py-2 text-sm font-medium ${tab === 'variables' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              onClick={() => setTab('variables')}
            >
              {t('sidebar.variables')}
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {tab === 'properties' ? (
              <PropertyPanel />
            ) : (
              <VariablesPanel defaultExpanded={true} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
});

PropertiesSidebar.displayName = 'PropertiesSidebar';

export default PropertiesSidebar;
