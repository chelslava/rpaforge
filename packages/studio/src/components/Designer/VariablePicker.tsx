import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FiPlus, FiSearch, FiCode } from 'react-icons/fi';

export interface VariableInfo {
  name: string;
  type: string;
  scope: string;
  value?: string;
}

interface VariablePickerProps {
  value: string;
  onChange: (value: string) => void;
  variables: VariableInfo[];
  onCreateNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

const VariablePicker: React.FC<VariablePickerProps> = ({
  value,
  onChange,
  variables,
  onCreateNew,
  placeholder = 'Select variable...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredVariables = useMemo(() => {
    if (!search) return variables;
    const searchLower = search.toLowerCase();
    return variables.filter(
      (v) =>
        v.name.toLowerCase().includes(searchLower) ||
        v.type.toLowerCase().includes(searchLower)
    );
  }, [variables, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredVariables]);

  const handleSelect = (variable: VariableInfo) => {
    onChange(`\${${variable.name}}`);
    setIsOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

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
      case 'Enter':
        e.preventDefault();
        if (filteredVariables[highlightedIndex]) {
          handleSelect(filteredVariables[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (newValue.includes('${')) {
      setSearch(newValue.match(/\$\{([^}]*)/)?.[1] || '');
      setIsOpen(true);
    } else {
      setSearch('');
    }
  };

  const getScopeColor = (scope: string) => {
    switch (scope) {
      case 'global':
        return 'text-purple-500';
      case 'suite':
        return 'text-blue-500';
      case 'local':
      default:
        return 'text-green-500';
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

  return (
    <div className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 pr-8 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <FiCode className="w-4 h-4" />
        </button>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-64 overflow-y-auto"
        >
          {search && (
            <div className="p-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 text-sm text-slate-500">
              <FiSearch className="w-4 h-4" />
              Search: {search}
            </div>
          )}

          {filteredVariables.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              No variables found
              {onCreateNew && (
                <button
                  onClick={() => {
                    onCreateNew();
                    setIsOpen(false);
                  }}
                  className="mt-2 w-full px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center justify-center gap-1"
                >
                  <FiPlus className="w-4 h-4" />
                  Create new variable
                </button>
              )}
            </div>
          ) : (
            <>
              {filteredVariables.map((variable, index) => (
                <button
                  key={variable.name}
                  onClick={() => handleSelect(variable)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between ${
                    index === highlightedIndex
                      ? 'bg-indigo-50 dark:bg-indigo-900'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{getTypeIcon(variable.type)}</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">
                      {`\${${variable.name}}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={getScopeColor(variable.scope)}>{variable.scope}</span>
                    <span className="text-slate-400">{variable.type}</span>
                  </div>
                </button>
              ))}

              {onCreateNew && (
                <button
                  onClick={() => {
                    onCreateNew();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 border-t border-slate-200 dark:border-slate-700"
                >
                  <FiPlus className="w-4 h-4" />
                  Create new variable...
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VariablePicker;
