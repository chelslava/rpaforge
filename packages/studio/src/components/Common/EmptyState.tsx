import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
  };
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[280px] mb-4">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`
            inline-flex items-center justify-center rounded font-medium transition-colors
            ${
              action.variant === 'primary'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : action.variant === 'secondary'
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100'
                  : action.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'hover:bg-slate-100 text-slate-700 dark:hover:bg-slate-800 dark:text-slate-300'
            }
            ${
              action.size === 'sm'
                ? 'px-2 py-1 text-xs'
                : action.size === 'lg'
                  ? 'px-4 py-2 text-base'
                  : 'px-3 py-1.5 text-sm'
            }
          `}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
