import React, { useState, useCallback } from 'react';
import { FiMoreHorizontal } from 'react-icons/fi';
import PythonCodeEditor from './PythonCodeEditor';

interface EditableTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'password';
  className?: string;
  editorTitle?: string;
  showEditorButton?: boolean;
}

const EditableTextField: React.FC<EditableTextFieldProps> = ({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  type = 'text',
  className = '',
  editorTitle = 'Edit Value',
  showEditorButton = true,
}) => {
  const [showEditor, setShowEditor] = useState(false);

  const handleSave = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 disabled:opacity-50"
      />
      {showEditorButton && (
        <button
          type="button"
          className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50"
          onClick={() => setShowEditor(true)}
          disabled={disabled}
          title="Open editor"
        >
          <FiMoreHorizontal className="w-4 h-4" />
        </button>
      )}

      <PythonCodeEditor
        isOpen={showEditor}
        code={value}
        onClose={() => setShowEditor(false)}
        onSave={handleSave}
        title={editorTitle}
      />
    </div>
  );
};

export default EditableTextField;
