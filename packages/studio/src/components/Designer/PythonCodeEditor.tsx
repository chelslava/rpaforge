import React, { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { FiX, FiCheck, FiMaximize2, FiMinimize2 } from 'react-icons/fi';

interface PythonCodeEditorProps {
  isOpen: boolean;
  code: string;
  onClose: () => void;
  onSave: (code: string) => void;
  title?: string;
}

const PythonCodeEditor: React.FC<PythonCodeEditorProps> = ({
  isOpen,
  code: initialCode,
  onClose,
  onSave,
  title = 'Edit Python Code',
}) => {
  const [code, setCode] = useState(initialCode);
  const [isMaximized, setIsMaximized] = useState(false);

  const handleSave = useCallback(() => {
    onSave(code);
    onClose();
  }, [code, onSave, onClose]);

  const handleEditorMount = useCallback(
    (_editor: unknown, monaco: unknown) => {
      const monacoEditor = monaco as typeof import('monaco-editor');

      monacoEditor.languages.register({ id: 'python' });

      monacoEditor.languages.setMonarchTokensProvider('python', {
        defaultToken: '',
        tokenPostfix: '.python',

        keywords: [
          'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
          'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
          'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
          'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
          'while', 'with', 'yield', 'print',
        ],

        builtins: [
          'abs', 'all', 'any', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
          'chr', 'classmethod', 'compile', 'complex', 'delattr', 'dict', 'dir',
          'divmod', 'enumerate', 'eval', 'exec', 'filter', 'float', 'format',
          'frozenset', 'getattr', 'globals', 'hasattr', 'hash', 'help', 'hex',
          'id', 'input', 'int', 'isinstance', 'issubclass', 'iter', 'len',
          'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object',
          'oct', 'open', 'ord', 'pow', 'property', 'range', 'repr', 'reversed',
          'round', 'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str',
          'sum', 'super', 'tuple', 'type', 'vars', 'zip', '__import__',
        ],

        operators: [
          '+', '-', '*', '**', '/', '//', '%', '@', '<<', '>>', '&', '|', '^',
          '~', '<', '>', '<=', '>=', '==', '!=', '=', '+=', '-=', '*=', '/=',
          '//=', '%=', '**=', '@=', '&=', '|=', '^=', '>>=', '<<=',
        ],

        symbols: /[=><!~?:&|+\-*^%]+/,

        escapes: /\\(?:[abfnrtv"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

        tokenizer: {
          root: [
            [/[a-zA-Z_]\w*/, {
              cases: {
                '@keywords': 'keyword',
                '@builtins': 'type.identifier',
                '@default': 'identifier',
              },
            }],
            { include: '@whitespace' },
            [/[{}()[\]]/, '@brackets'],
            [/[<>](?!@symbols)/, '@brackets'],
            [/@symbols/, {
              cases: {
                '@operators': 'operator',
                '@default': '',
              },
            }],
            [/\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
            [/0[xX][0-9a-fA-F]+/, 'number.hex'],
            [/0[oO][0-7]+/, 'number.octal'],
            [/0[bB][01]+/, 'number.binary'],
            [/\d+/, 'number'],
            [/[;,.]/, 'delimiter'],
            [/"([^"\\]|\\.)*$/, 'string.invalid'],
            [/'([^'\\]|\\.)*$/, 'string.invalid'],
            [/"/, 'string', '@string_double'],
            [/'/, 'string', '@string_single'],
            [/f"/, 'string', '@fstring_double'],
            [/f'/, 'string', '@fstring_single'],
          ],

          whitespace: [
            [/[ \t\r\n]+/, ''],
            [/#.*$/, 'comment'],
            [/'''/, 'comment', '@docstring_single'],
            [/"""/, 'comment', '@docstring_double'],
          ],

          docstring_single: [
            [/[^']+/, 'comment'],
            [/'''/, 'comment', '@pop'],
            [/'/, 'comment'],
          ],

          docstring_double: [
            [/[^"]+/, 'comment'],
            [/"""/, 'comment', '@pop'],
            [/"/, 'comment'],
          ],

          string_double: [
            [/[^\\"]+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop'],
          ],

          string_single: [
            [/[^\\']+/, 'string'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, 'string', '@pop'],
          ],

          fstring_double: [
            [/[^\\{}"]+/, 'string'],
            [/{/, 'delimiter.bracket', '@fstring_expr'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/"/, 'string', '@pop'],
          ],

          fstring_single: [
            [/[^\\{}']+/, 'string'],
            [/{/, 'delimiter.bracket', '@fstring_expr'],
            [/@escapes/, 'string.escape'],
            [/\\./, 'string.escape.invalid'],
            [/'/, 'string', '@pop'],
          ],

          fstring_expr: [
            [/\}/, 'delimiter.bracket', '@pop'],
            { include: '@root' },
          ],
        },
      });

      monacoEditor.editor.setTheme('vs-dark');
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [onClose, handleSave]
  );

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${
        isMaximized ? '' : 'p-4'
      }`}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-lg shadow-xl flex flex-col ${
          isMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh]'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <div className="flex items-center gap-2">
            <button
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <FiMinimize2 className="w-5 h-5" />
              ) : (
                <FiMaximize2 className="w-5 h-5" />
              )}
            </button>
            <button
              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
              onClick={handleSave}
            >
              <FiCheck className="w-4 h-4" />
              Save
            </button>
            <button
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1"
              onClick={onClose}
            >
              <FiX className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            defaultLanguage="python"
            value={code}
            onChange={(value) => setCode(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              folding: true,
              renderLineHighlight: 'line',
              tabSize: 4,
              insertSpaces: true,
              automaticLayout: true,
              formatOnPaste: true,
              formatOnType: true,
            }}
            onMount={handleEditorMount}
          />
        </div>

        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex justify-between">
          <span>Python code will be executed during the activity run</span>
          <span>Ctrl+S to save, Esc to cancel</span>
        </div>
      </div>
    </div>
  );
};

export default PythonCodeEditor;
