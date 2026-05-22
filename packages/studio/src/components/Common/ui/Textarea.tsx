import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea: React.FC<TextareaProps> = ({ label, error, id, className = '', ...rest }) => {
  const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        {...rest}
        className={`rounded border px-3 py-2 text-sm bg-ui-surface text-ui-text border-ui-border focus:outline-none focus:ring-2 focus:ring-ui-primary disabled:opacity-50 resize-y ${error ? 'border-ui-danger focus:ring-ui-danger' : ''} ${className}`}
      />
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
};

export default Textarea;
