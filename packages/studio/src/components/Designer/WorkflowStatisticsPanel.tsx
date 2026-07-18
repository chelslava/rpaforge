import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBox, FiGitBranch, FiClock, FiGrid, FiFolder, FiType } from 'react-icons/fi';
import { useBlockStore } from '../../stores/blockStore';
import { useDiagramStore } from '../../stores/diagramStore';
import { useVariableStore } from '../../stores/variableStore';

/**
 * Tailwind class sets for library pills.
 * Matches the color convention from ActivityPalette LIBRARY_STYLES.
 */
const LIBRARY_PILL_CLASSES: Record<string, string> = {
  BuiltIn:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600',
  DesktopUI:
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
  WebUI:
    'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-sky-300 dark:border-sky-700',
  Excel:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  File:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  String:
    'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300 border-pink-300 dark:border-pink-700',
  DateTime:
    'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-300 dark:border-teal-700',
  Variables:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-300 dark:border-purple-700',
  Flow:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-300 dark:border-orange-700',
  Database:
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
  OCR:
    'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-300 dark:border-rose-700',
  Credentials:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
  DataFrames:
    'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-300 dark:border-violet-700',
};

function getPillClass(library: string): string {
  return (
    LIBRARY_PILL_CLASSES[library] ||
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600'
  );
}

/* ── Small stat card used in the top row ── */

interface StatCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, value, label }) => (
  <div className="flex flex-col items-center gap-0.5 rounded-lg bg-slate-50 p-1.5 dark:bg-slate-800/50">
    <span className="text-slate-400 dark:text-slate-500">{icon}</span>
    <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">
      {value}
    </span>
    <span className="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {label}
    </span>
  </div>
);

/* ── Main component ── */

interface LibraryEntry {
  name: string;
  count: number;
}

interface LargestSubDiagram {
  name: string;
  nodeCount: number;
}

interface WorkflowStats {
  totalNodes: number;
  activityCount: number;
  blockCount: number;
  edgeCount: number;
  libraries: LibraryEntry[];
  syncActivities: number;
  asyncActivities: number;
  estSeconds: number;
  totalVars: number;
  processVars: number;
  taskVars: number;
  largestSub: LargestSubDiagram | null;
}

const WorkflowStatisticsPanel: React.FC = () => {
  const { t } = useTranslation();

  /* ── Store selectors ── */
  const nodes = useBlockStore((state) => state.nodes);
  const edges = useBlockStore((state) => state.edges);
  const project = useDiagramStore((state) => state.project);
  const diagramDocuments = useDiagramStore((state) => state.diagramDocuments);
  const variables = useVariableStore((state) => state.variables);

  /* ── Derived statistics (no new state) ── */
  const stats: WorkflowStats = useMemo(() => {
    /* Separate activity nodes from structural block nodes */
    const activityNodes = nodes.filter((n) => n.data?.activity != null);
    const blockNodes = nodes.filter((n) => n.data?.activity == null);

    /* Library usage from activity nodes */
    const libMap = new Map<string, number>();
    activityNodes.forEach((n) => {
      const lib = n.data!.activity!.library;
      libMap.set(lib, (libMap.get(lib) ?? 0) + 1);
    });
    const libraries: LibraryEntry[] = [...libMap.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    /* Activity types for timing heuristic */
    const syncActivities = activityNodes.filter(
      (n) => n.data?.activity?.type === 'sync',
    ).length;
    const asyncActivities = activityNodes.filter(
      (n) => n.data?.activity?.type === 'async',
    ).length;
    const otherActivities =
      activityNodes.length - syncActivities - asyncActivities;

    /* Simple timing heuristic: sync ~0.5 s, async ~2 s, other ~1 s */
    const estSeconds =
      syncActivities * 0.5 + asyncActivities * 2 + otherActivities * 1;

    /* Variable counts per scope */
    const processVars = variables.filter((v) => v.scope === 'process').length;
    const taskVars = variables.filter((v) => v.scope === 'task').length;

    /* Find the largest loaded sub-diagram */
    let largestSub: LargestSubDiagram | null = null;
    const allDiagrams = project?.diagrams ?? [];
    for (const diagram of allDiagrams) {
      if (diagram.type === 'sub-diagram') {
        const doc = diagramDocuments[diagram.id];
        if (doc?.nodes) {
          const count = doc.nodes.length;
          if (!largestSub || count > largestSub.nodeCount) {
            largestSub = { name: diagram.name, nodeCount: count };
          }
        }
      }
    }

    return {
      totalNodes: nodes.length,
      activityCount: activityNodes.length,
      blockCount: blockNodes.length,
      edgeCount: edges.length,
      libraries,
      syncActivities,
      asyncActivities,
      estSeconds,
      totalVars: variables.length,
      processVars,
      taskVars,
      largestSub,
    };
  }, [nodes, edges, project, diagramDocuments, variables]);

  const timeDisplay =
    stats.estSeconds < 1
      ? '<1s'
      : `~${Math.round(stats.estSeconds)}s`;

  return (
    <div className="border-b border-slate-200 p-3 dark:border-slate-700">
      <div className="space-y-3">
        {/* ── Header ── */}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t('workflowStatistics.title')}
        </h3>

        {/* ── Empty state ── */}
        {stats.totalNodes === 0 ? (
          <p className="text-xs italic text-slate-400 dark:text-slate-500">
            {t('workflowStatistics.empty')}
          </p>
        ) : (
          <>
            {/* ── Stat cards row ── */}
            <div className="grid grid-cols-3 gap-1.5">
              <StatCard
                icon={<FiBox className="h-3.5 w-3.5" />}
                value={stats.totalNodes}
                label={t('workflowStatistics.nodes')}
              />
              <StatCard
                icon={<FiGitBranch className="h-3.5 w-3.5" />}
                value={stats.edgeCount}
                label={t('workflowStatistics.edges')}
              />
              <StatCard
                icon={<FiClock className="h-3.5 w-3.5" />}
                value={timeDisplay}
                label={t('workflowStatistics.estimatedTime')}
              />
            </div>

            {/* ── Activity / Block breakdown ── */}
            <div className="flex gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                {stats.activityCount} {t('workflowStatistics.activities')}
              </span>
              {stats.blockCount > 0 && (
                <span>
                  {stats.blockCount} {t('workflowStatistics.blocks')}
                </span>
              )}
            </div>

            {/* ── Library usage pills ── */}
            {stats.libraries.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-1">
                  <FiGrid className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {t('workflowStatistics.libraries')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {stats.libraries.map((lib) => (
                    <span
                      key={lib.name}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${getPillClass(lib.name)}`}
                    >
                      {lib.name}
                      <span className="tabular-nums">{lib.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Variables count ── */}
            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <FiType className="h-3 w-3 shrink-0" />
              <span>
                {t('workflowStatistics.variables', {
                  count: stats.totalVars,
                })}
              </span>
              {stats.totalVars > 0 && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {stats.processVars}p + {stats.taskVars}t
                </span>
              )}
            </div>

            {/* ── Largest sub-diagram ── */}
            {stats.largestSub && (
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                <FiFolder className="h-3 w-3 shrink-0" />
                <span>
                  {t('workflowStatistics.largestSubDiagram', {
                    name: stats.largestSub.name,
                    count: stats.largestSub.nodeCount,
                  })}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WorkflowStatisticsPanel;
