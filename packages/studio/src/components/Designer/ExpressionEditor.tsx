import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FiPlus, FiMoreHorizontal, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import type { VariableInfo } from './VariablePicker';
import PythonCodeEditor from './PythonCodeEditor';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

interface ExpressionEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables: VariableInfo[];
  onCreateNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  showEditorButton?: boolean;
  validate?: boolean;
  required?: boolean;
  onValidationChange?: (result: ValidationResult) => void;
}

function validateExpression(
  expression: string,
  variables: VariableInfo[],
  required: boolean
): ValidationResult {
  const errors: string[] = [];

  if (!expression.trim()) {
    if (required) {
      errors.push('Expression is required');
    }
    return { isValid: errors.length === 0, errors };
  }

  const bracketStack: string[] = [];
  const bracketPairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const openBrackets = new Set(Object.keys(bracketPairs));
  const closeBrackets = new Set(Object.values(bracketPairs));

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    if (openBrackets.has(char)) {
      bracketStack.push(char);
    } else if (closeBrackets.has(char)) {
      const lastOpen = bracketStack.pop();
      if (!lastOpen || bracketPairs[lastOpen] !== char) {
        const expected = lastOpen ? bracketPairs[lastOpen] : 'opening bracket';
        errors.push(`Unmatched '${char}' at position ${i + 1} (expected '${expected}')`);
      }
    }
  }

  bracketStack.forEach((bracket, index) => {
    errors.push(`Unclosed '${bracket}' at position ${expression.lastIndexOf(bracket) + 1}`);
  });

  const variablePattern = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  const knownVariables = new Set(variables.map((v) => v.name));
  const pythonKeywords = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield', 'print', 'len', 'str', 'int', 'float', 'bool',
    'list', 'dict', 'set', 'tuple', 'range', 'enumerate', 'zip', 'map',
    'filter', 'sorted', 'reversed', 'min', 'max', 'sum', 'any', 'all',
    'abs', 'round', 'isinstance', 'type', 'open', 'True', 'False', 'None',
  ]);

  let match: RegExpExecArray | null;
  while ((match = variablePattern.exec(expression)) !== null) {
    const varName = match[0];
    if (!knownVariables.has(varName) && !pythonKeywords.has(varName)) {
      const isFunctionCall = expression[match.index + varName.length] === '(';
      if (!isFunctionCall) {
        errors.push(`Unknown variable '${varName}' at position ${match.index + 1}`);
      }
    }
  }

  const quotePattern = /(['"])(?:(?!\1)[^\\]|\\.)*$/;
  if (quotePattern.test(expression)) {
    errors.push('Unclosed string literal');
  }

  return { isValid: errors.length === 0, errors };
}

const ExpressionEditor: React.FC<ExpressionEditorProps> = ({
  value,
  onChange,
  variables,
  onCreateNew,
  placeholder = 'Enter expression...',
  disabled = false,
  rows = 3,
  showEditorButton = true,
  validate = true,
  required = false,
  onValidationChange,
}) => {
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [cursorIndex, setCursorIndex] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  const validationResult = useMemo(() => {
    if (!validate) {
      return { isValid: true, errors: [] };
    }
    return validateExpression(value, variables, required);
  }, [value, variables, required, validate]);

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(validationResult);
    }
  }, [validationResult, onValidationChange]);

  const findVariableTrigger = (text: string, cursorPos: number): { start: number; search: string } | null => {
    const beforeCursor = text.substring(0, cursorPos);
    const match = beforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
    if (!match) return null;
    
    const start = cursorPos - match[0].length;
    const search = match[0];
    
    return { start, search };
  };

  const trigger = useMemo(() => {
    return findVariableTrigger(value, cursorIndex);
  }, [value, cursorIndex]);

  const filteredVariables = useMemo(() => {
    if (!trigger) return [];
    
    const searchLower = trigger.search.toLowerCase();
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(searchLower) ||
        v.type.toLowerCase().includes(searchLower)
    );
  }, [trigger, variables]);

  useEffect(() => {
    if (trigger && filteredVariables.length > 0) {
      const textarea = textareaRef.current;
      if (textarea) {
        const rect = textarea.getBoundingClientRect();
        const lineHeight = 20;
        const charWidth = 8;
        const lines = value.substring(0, cursorIndex).split('\n');
        const currentLine = lines.length - 1;
        const currentCol = lines[lines.length - 1].length;
        
        setAutocompletePosition({
          top: Math.min(currentLine * lineHeight + 24, rect.height - 200),
          left: Math.min(currentCol * charWidth, rect.width - 220),
        });
      }
      setShowAutocomplete(true);
      setHighlightedIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  }, [trigger, filteredVariables, value, cursorIndex]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const insertVariable = (variable: VariableInfo) => {
    if (!trigger) return;

    const before = value.substring(0, trigger.start);
    const after = value.substring(cursorIndex);
    const insertion = variable.name;
    const newValue = before + insertion + after;
    
    onChange(newValue);
    setShowAutocomplete(false);
    
    setTimeout(() => {
      const newCursorPos = trigger.start + insertion.length;
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showAutocomplete) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredVariables.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Tab':
      case 'Enter':
        if (filteredVariables[highlightedIndex]) {
          e.preventDefault();
          insertVariable(filteredVariables[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowAutocomplete(false);
        break;
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleSelectionChange = () => {
    if (textareaRef.current) {
      setCursorIndex(textareaRef.current.selectionStart);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'string':
        return '📝';
      case 'number':
        return '🔢';
      case 'boolean':
        return '✓';
      case 'list':
        return '📋';
      case 'dict':
        return '📖';
      case 'secret':
        return '🔒';
      default:
        return '📦';
    }
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'process':
        return 'text-purple-500';
      case 'task':
      default:
        return 'text-green-500';
    }
  };

  const handleSaveFromEditor = (code: string) => {
    onChange(code);
    setShowCodeEditor(false);
  };

  const getBorderColor = useCallback(() => {
    if (!validate) {
      return 'border-slate-300 dark:border-slate-600';
    }
    if (validationResult.isValid) {
      return value.trim() ? 'border-green-400 dark:border-green-500' : 'border-slate-300 dark:border-slate-600';
    }
    return 'border-red-400 dark:border-red-500';
  }, [validate, validationResult.isValid, value]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onSelect={handleSelectionChange}
            onKeyUp={handleSelectionChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className={`w-full px-3 py-2 border rounded bg-white dark:bg-slate-700 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 resize-y ${getBorderColor()}`}
          />
          {validate && value.trim() && (
            <div className="absolute right-2 top-2">
              {validationResult.isValid ? (
                <FiCheckCircle className="w-4 h-4 text-green-500" title="Valid expression" />
              ) : (
                <FiAlertCircle className="w-4 h-4 text-red-500" title="Invalid expression" />
              )}
            </div>
          )}
        </div>
        {showEditorButton && (
          <button
            type="button"
            className="px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 disabled:opacity-50 self-start"
            onClick={() => setShowCodeEditor(true)}
            disabled={disabled}
            title="Open in editor"
          >
            <FiMoreHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {validate && !validationResult.isValid && validationResult.errors.length > 0 && (
        <div className="mt-1 text-xs text-red-500 dark:text-red-400">
          {validationResult.errors[0]}
          {validationResult.errors.length > 1 && (
            <span className="text-slate-400 dark:text-slate-500 ml-1">
              (+{validationResult.errors.length - 1} more)
            </span>
          )}
        </div>
      )}

      {showAutocomplete && (
        <div
          ref={autocompleteRef}
          className="absolute z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 w-56 overflow-y-auto"
          style={{
            top: autocompletePosition.top,
            left: autocompletePosition.left,
          }}
        >
          {filteredVariables.length === 0 ? (
            <div className="p-3 text-center text-sm text-slate-500">
              No matching variables
              {onCreateNew && (
                <button
                  onClick={() => {
                    onCreateNew();
                    setShowAutocomplete(false);
                  }}
                  className="mt-2 w-full px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center justify-center gap-1 text-xs"
                >
                  <FiPlus className="w-3 h-3" />
                  Create new
                </button>
              )}
            </div>
          ) : (
            <>
              {filteredVariables.map((variable, index) => (
                <button
                  key={variable.name}
                  onClick={() => insertVariable(variable)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full px-2 py-1.5 text-left text-xs flex items-center justify-between ${
                    index === highlightedIndex
                      ? 'bg-indigo-50 dark:bg-indigo-900'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{getTypeIcon(variable.type)}</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">
                      {variable.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={getScopeColor(variable.scope)}>{variable.scope}</span>
                    <span className="text-slate-400">{variable.type}</span>
                  </div>
                </button>
              ))}

              {onCreateNew && (
                <button
                  onClick={() => {
                    onCreateNew();
                    setShowAutocomplete(false);
                  }}
                  className="w-full px-2 py-1.5 text-left text-xs text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 border-t border-slate-200 dark:border-slate-700"
                >
                  <FiPlus className="w-3 h-3" />
                  Create new variable...
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!validate || validationResult.isValid ? (
        <div className="mt-1 text-xs text-slate-500">
          Type a variable name to autocomplete
        </div>
      ) : null}

      <PythonCodeEditor
        isOpen={showCodeEditor}
        code={value}
        onClose={() => setShowCodeEditor(false)}
        onSave={handleSaveFromEditor}
        title="Edit Expression"
      />
    </div>
  );
};

export default ExpressionEditor;
