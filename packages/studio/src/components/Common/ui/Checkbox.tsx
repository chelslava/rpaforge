import React from 'react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({ label, id, className = '', ...rest }) => {
  const checkId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <label htmlFor={checkId} className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        id={checkId}
        {...rest}
        className={`h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 ${className}`}
      />
      {label && (
        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      )}
    </label>
  );
};

export default Checkbox;
