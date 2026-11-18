import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiChevronDown,
  FiChevronUp,
  FiInfo,
  FiRefreshCw,
} from 'react-icons/fi';

import { useDiagramStore } from '../../stores/diagramStore';
import {
  useProblemsStore,
  type ProblemItem,
  type ProblemSeverity,
} from '../../stores/problemsStore';
import { useSelectionStore } from '../../stores/selectionStore';

const SEVERITY_ICON: Record<ProblemSeverity, React.ReactNode> = {
  error: <FiAlertCircle className="w-3.5 h-3.5 text-red-500" aria-hidden="true" />,
  warning: <FiAlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />,
  info: <FiInfo className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />,
};

const ProblemsPanel: React.FC = () => {
  const { t } = useTranslation('common');
  const hasProject = useDiagramStore((state) => state.project !== null);
  const activeDiagramId = useDiagramStore((state) => state.activeDiagramId);
  const problems = useProblemsStore((state) => state.problems);
  const refresh = useProblemsStore((state) => state.refresh);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh, activeDiagramId]);

  const counts = useMemo(() => {
    const tally: Record<ProblemSeverity, number> = { error: 0, warning: 0, info: 0 };
    for (const problem of problems) tally[problem.severity] += 1;
    return tally;
  }, [problems]);

  const handleNavigate = useCallback((problem: ProblemItem) => {
    const { openDiagram } = useDiagramStore.getState();
    const { setSelectedNode } = useSelectionStore.getState();
    if (problem.nodeId) setSelectedNode(problem.nodeId);
    if (problem.diagramId) openDiagram(problem.diagramId);
  }, []);

  if (!hasProject || !activeDiagramId) return null;

  return (
    <section
      aria-label={t('problems.panel')}
      className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
      data-tour="problems"
    >
      <div className="flex items-center gap-2 h-8 px-3 text-xs">
        <span className="font-medium text-slate-600 dark:text-slate-300">
          {t('problems.title')}
        </span>
        {counts.error > 0 && (
          <span
            className="flex items-center gap-1 text-red-500"
            aria-label={t('problems.errors')}
          >
            {SEVERITY_ICON.error}
            {counts.error}
          </span>
        )}
        {counts.warning > 0 && (
          <span
            className="flex items-center gap-1 text-amber-500"
            aria-label={t('problems.warnings')}
          >
            {SEVERITY_ICON.warning}
            {counts.warning}
          </span>
        )}
        {counts.info > 0 && (
          <span
            className="flex items-center gap-1 text-sky-500"
            aria-label={t('problems.infos')}
          >
            {SEVERITY_ICON.info}
            {counts.info}
          </span>
        )}
        {problems.length === 0 && (
          <span className="flex items-center gap-1 text-emerald-500">
            <FiCheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
            {t('problems.empty')}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => refresh()}
          aria-label={t('problems.refresh')}
          title={t('problems.refresh')}
          className="p-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-primary"
        >
          <FiRefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? t('problems.collapse') : t('problems.expand')}
          title={expanded ? t('problems.collapse') : t('problems.expand')}
          className="p-1 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ui-primary"
        >
          {expanded ? (
            <FiChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <FiChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      {expanded && (
        <ul
          role="list"
          className="max-h-48 overflow-y-auto bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-700 border-t border-slate-200 dark:border-slate-700"
        >
          {problems.map((problem) => (
            <li key={problem.id}>
              <button
                type="button"
                onClick={() => handleNavigate(problem)}
                className="w-full text-left px-3 py-1.5 flex items-start gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-primary"
              >
                {SEVERITY_ICON[problem.severity]}
                <span className="flex-1 min-w-0">
                  <span className="block text-slate-700 dark:text-slate-200">
                    {problem.message}
                  </span>
                  <span className="block text-slate-400 dark:text-slate-500">
                    {problem.source === 'project'
                      ? t('problems.sourceProject')
                      : t('problems.sourceDiagram')}
                    {problem.code ? ` · ${problem.code}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ProblemsPanel;
