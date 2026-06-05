import React, { useState, useCallback, useRef, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useTranslation } from 'react-i18next';
import { FiX, FiCheck, FiMaximize2, FiMinimize2 } from 'react-icons/fi';

import StatusBar from '../CodeEditor/StatusBar';
import CodeToolbar from '../CodeEditor/CodeToolbar';
import SnippetPanel from '../CodeEditor/SnippetPanel';
import VariablesPanel from '../CodeEditor/VariablesPanel';
import ConfirmDialog from '../Common/ConfirmDialog';
import { useRPACompletions } from '../CodeEditor/hooks/useRPACompletions';
import { useForcedColors, useResolvedTheme } from '../../hooks/useTheme';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useVariableStore } from '../../stores/variableStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Snippet } from '../CodeEditor/data/snippets';
import type { ValidationError } from '../../types/ipc-contracts';

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
  title,
}) => {
  const { t } = useTranslation('common');
  const editorSettings = useSettingsStore((state) => state.editor);
  const setEditorSettings = useSettingsStore((state) => state.setEditorSettings);
  const [code, setCode] = useState(initialCode);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isSnippetPanelOpen, setIsSnippetPanelOpen] = useState(false);
  const [isVariablesPanelOpen, setIsVariablesPanelOpen] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [isDirty, setIsDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationError[]>([]);

  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const validationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activities, registerCompletions } = useRPACompletions();
  const variables = useVariableStore((state) => state.variables);
  const resolvedTheme = useResolvedTheme();
  const forcedColors = useForcedColors();
  const editorTheme = forcedColors ? (resolvedTheme === 'dark' ? 'hc-black' : 'hc-light') : (resolvedTheme === 'dark' ? 'vs-dark' : 'vs');

  const modalRef = useFocusTrap<HTMLDivElement>(isOpen);

  const closeAllPanels = useCallback(() => {
    setIsSnippetPanelOpen(false);
    setIsVariablesPanelOpen(false);
  }, []);

  const handleFormat = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;

    const currentCode = editor.getValue();

    try {
      const result = await window.rpaforge?.editor.formatCode(currentCode);
      if (result && result.formatted_code !== currentCode) {
        const position = editor.getPosition();
        editor.setValue(result.formatted_code);
        if (position) {
          editor.setPosition(position);
        }
        setCode(result.formatted_code);
      }
    } catch (error) {
      console.error('Format failed:', error);
    }
  }, []);

  const persist = useCallback(async (): Promise<string> => {
    let toSave = code;
    if (editorSettings.formatOnSave) {
      try {
        const result = await window.rpaforge?.editor.formatCode(code);
        if (result?.formatted_code) {
          toSave = result.formatted_code;
          editorRef.current?.setValue(toSave);
          setCode(toSave);
        }
      } catch (error) {
        // Formatting is best-effort on save; never block saving on a format error.
        console.error('Format on save failed:', error);
      }
    }
    onSave(toSave);
    setIsDirty(false);
    return toSave;
  }, [code, editorSettings.formatOnSave, onSave]);

  const handleSave = useCallback(() => {
    void persist().then(() => onClose());
  }, [persist, onClose]);

  // Apply (save) without closing the editor.
  const handleApply = useCallback(() => {
    void persist();
  }, [persist]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  const handleEditorDidMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      monaco.languages.register({ id: 'python' });

      monaco.editor.setTheme(editorTheme);

      editor.onDidChangeCursorPosition((e) => {
        setCursorPosition({
          line: e.position.lineNumber,
          column: e.position.column,
        });
      });

      // Put the caret in the editor on open instead of the first focusable
      // chrome control, so the user can type immediately.
      editor.focus();
    },
    [editorTheme]
  );

  useEffect(() => {
    monacoRef.current?.editor.setTheme(editorTheme);
  }, [editorTheme]);

  useEffect(() => {
    if (monacoRef.current && activities.length > 0) {
      const dispose = registerCompletions(monacoRef.current);
      return dispose;
    }
  }, [activities, registerCompletions]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => handleFormat()
    );
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      const action = editor.getAction('editor.action.gotoLine');
      void action?.run();
    });
  }, [handleFormat]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await window.rpaforge?.editor.validateCode(code);
        if (result) {
          setValidationErrors(result.errors);
          setValidationWarnings(result.warnings);

          const model = editor.getModel();
          if (model) {
            const markers: Monaco.editor.IMarkerData[] = [
              ...result.errors.map((err) => ({
                severity: monaco.MarkerSeverity.Error,
                message: err.message,
                startLineNumber: err.line,
                startColumn: err.column + 1,
                endLineNumber: err.endLine,
                endColumn: err.endColumn + 1,
              })),
              ...result.warnings.map((warn) => ({
                severity: monaco.MarkerSeverity.Warning,
                message: warn.message,
                startLineNumber: warn.line,
                startColumn: warn.column + 1,
                endLineNumber: warn.endLine,
                endColumn: warn.endColumn + 1,
              })),
            ];
            monaco.editor.setModelMarkers(model, 'rpaforge-linter', markers);
          }
        }
      } catch (error) {
        console.error('Validation failed:', error);
      }
    }, 500);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [code]);

  const handleFind = useCallback(() => {
    void editorRef.current?.getAction('actions.find')?.run();
  }, []);

  const handleReplace = useCallback(() => {
    void editorRef.current?.getAction('editor.action.startFindReplaceAction')?.run();
  }, []);

  const handleInsertSnippet = useCallback((snippet: Snippet) => {
    const editor = editorRef.current;
    if (!editor) return;

    const position = editor.getPosition();
    if (!position) return;

    const range = {
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    };

    editor.executeEdits('', [
      {
        range,
        text: snippet.insertText,
      },
    ]);

    editor.focus();
  }, []);

  const handleInsertVariable = useCallback((name: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const position = editor.getPosition();
    if (!position) return;

    const range = {
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    };

    editor.executeEdits('', [
      {
        range,
        text: name,
      },
    ]);

    editor.focus();
    setIsVariablesPanelOpen(false);
  }, []);

  const handleNextProblem = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void editor.getAction('editor.action.marker.next')?.run();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // While the discard-confirmation is open it owns the keyboard (Escape closes it).
      if (showDiscardConfirm) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [showDiscardConfirm, requestClose, handleSave]
  );

  const handleCodeChange = useCallback((value: string | undefined) => {
    setCode(value || '');
    setIsDirty(value !== initialCode);
  }, [initialCode]);

  if (!isOpen) return null;

  return (
    <div
      // `nokey` opts this subtree out of React Flow's global keyboard handling.
      // Monaco 0.52+ uses the EditContext API (a <div class="native-edit-context">,
      // not a <textarea>), which React Flow's isInputDOMNode does not recognise as an
      // input. Without this, React Flow's panActivationKeyCode (default 'Space')
      // calls preventDefault on every Space keydown, so spaces vanish while typing in
      // the editor mounted over the canvas. See isInputDOMNode -> target.closest('.nokey').
      className={`nokey fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${
        isMaximized ? '' : 'p-4'
      }`}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || t('codeEditor.editor.title')}
        className={`bg-white dark:bg-slate-800 rounded-lg shadow-xl flex flex-col ${
          isMaximized ? 'w-full h-full rounded-none' : 'w-full max-w-5xl h-[85vh]'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {title || t('codeEditor.editor.title')}
          </h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 mr-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 dark:border-slate-600"
                checked={editorSettings.formatOnSave}
                onChange={(e) => setEditorSettings({ formatOnSave: e.target.checked })}
              />
              {t('codeEditor.editor.formatOnSave')}
            </label>
            <button
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? t('codeEditor.editor.restore') : t('codeEditor.editor.maximize')}
              aria-label={isMaximized ? t('codeEditor.editor.restore') : t('codeEditor.editor.maximize')}
            >
              {isMaximized ? (
                <FiMinimize2 className="w-5 h-5" />
              ) : (
                <FiMaximize2 className="w-5 h-5" />
              )}
            </button>
            <button
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 disabled:opacity-50"
              onClick={handleApply}
              disabled={!isDirty}
              title={t('codeEditor.editor.applyHint')}
            >
              {t('codeEditor.editor.apply')}
            </button>
            <button
              className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
              onClick={handleSave}
              title={t('codeEditor.editor.saveHint')}
            >
              <FiCheck className="w-4 h-4" />
              {t('codeEditor.editor.save')}
            </button>
            <button
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1"
              onClick={requestClose}
            >
              <FiX className="w-4 h-4" />
              {t('codeEditor.editor.cancel')}
            </button>
          </div>
        </div>

        <div className="relative flex flex-col border-b border-slate-200 dark:border-slate-700">
          <CodeToolbar
            onFind={handleFind}
            onReplace={handleReplace}
            onFormat={handleFormat}
            onOpenSnippets={() => {
              closeAllPanels();
              setIsSnippetPanelOpen(true);
            }}
            onOpenVariables={() => {
              closeAllPanels();
              setIsVariablesPanelOpen(true);
            }}
            isSnippetPanelOpen={isSnippetPanelOpen}
            isVariablesPanelOpen={isVariablesPanelOpen}
            variableCount={variables.length}
          />
          <SnippetPanel
            isOpen={isSnippetPanelOpen}
            onClose={() => setIsSnippetPanelOpen(false)}
            onInsertSnippet={handleInsertSnippet}
          />
          <VariablesPanel
            isOpen={isVariablesPanelOpen}
            onInsertVariable={handleInsertVariable}
          />
        </div>

        <div className="flex-1 min-h-0">
          <Editor
            height="100%"
            defaultLanguage="python"
            value={code}
            onChange={handleCodeChange}
            theme={editorTheme}
            options={{
              minimap: { enabled: editorSettings.minimap },
              fontSize: editorSettings.fontSize,
              lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
              wordWrap: editorSettings.wordWrap ? 'on' : 'off',
              scrollBeyondLastLine: false,
              folding: true,
              renderLineHighlight: 'line',
              tabSize: editorSettings.tabSize,
              insertSpaces: true,
              automaticLayout: true,
              formatOnPaste: true,
              // Render hover/suggest/overlay widgets in a fixed layer attached to
              // <body> so they are not clipped or mispositioned inside the fixed
              // modal (and tooltips like "Close (Escape)" dismiss correctly).
              fixedOverflowWidgets: true,
              // Suppress completion pop-ups inside strings and comments so typing
              // prose (e.g. a Cyrillic log message) is not interrupted by the
              // activity/library suggestion list.
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
              acceptSuggestionOnEnter: 'on',
              tabCompletion: 'on',
            }}
            onMount={handleEditorDidMount}
          />
        </div>

        <StatusBar
          line={cursorPosition.line}
          column={cursorPosition.column}
          encoding="UTF-8"
          language="Python"
          isSaved={!isDirty}
          errors={validationErrors.length}
          warnings={validationWarnings.length}
          onNextProblem={handleNextProblem}
        />
      </div>

      <ConfirmDialog
        open={showDiscardConfirm}
        title={t('codeEditor.editor.unsavedTitle')}
        message={t('codeEditor.editor.unsavedMessage')}
        confirmLabel={t('codeEditor.editor.discard')}
        destructive
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
};

export default PythonCodeEditor;
