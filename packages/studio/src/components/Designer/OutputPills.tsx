import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import type { UpstreamOutput } from '../../utils/upstreamOutputs';

interface OutputPillsProps {
  outputs: UpstreamOutput[];
  disabled?: boolean;
  onInsert: (name: string) => void;
}

/**
 * Data pills (issue #868): discovery affordance for outputs declared by
 * upstream activities, nearest first. Clicking a pill inserts the standard
 * `${name}` reference token — no new runtime syntax.
 */
const OutputPills: React.FC<OutputPillsProps> = ({ outputs, disabled = false, onInsert }) => {
  const { t } = useTranslation('common');
  const [expanded, setExpanded] = React.useState(true);
  if (outputs.length === 0) {
    return null;
  }
  const visible = expanded ? outputs : outputs.slice(0, 3);

  return (
    <div className="mb-1" data-testid="output-pills">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {t('designer.outputPills.title')}
        </span>
        {outputs.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-slate-700"
            aria-expanded={expanded}
          >
            {expanded ? <FiChevronUp className="h-3 w-3" /> : <FiChevronDown className="h-3 w-3" />}
            {expanded ? t('designer.outputPills.collapse') : `+${outputs.length - 3}`}
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {visible.map((output) => (
          <button
            key={`${output.nodeId}:${output.name}`}
            type="button"
            disabled={disabled}
            onClick={() => onInsert(output.name)}
            title={t('designer.outputPills.fromNode', { node: output.nodeLabel })}
            className="group flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-mono text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 dark:hover:bg-indigo-900/70"
          >
            <span>{`${output.name}`}</span>
            <span className="max-w-24 truncate font-sans text-[10px] text-indigo-400 group-hover:text-indigo-500 dark:text-indigo-500">
              {output.nodeLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default OutputPills;
