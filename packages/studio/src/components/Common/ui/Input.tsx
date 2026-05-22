import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input: React.FC<InputProps> = ({ label, error, id, className = '', ...rest }) => {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...rest}
        className={`rounded border px-3 py-2 text-sm bg-ui-surface text-ui-text border-ui-border focus:outline-none focus:ring-2 focus:ring-ui-primary disabled:opacity-50 ${error ? 'border-ui-danger focus:ring-ui-danger' : ''} ${className}`}
      />
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
};

export default Input;
