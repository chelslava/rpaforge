import React, { useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { useProcessStore } from '../../stores/processStore';
import { generateClientRobotCode } from '../../utils/clientCodegen';

interface CodePreviewPanelProps {
  livePreview?: boolean;
}

const CodePreviewPanel: React.FC<CodePreviewPanelProps> = ({ livePreview = true }) => {
  const nodes = useProcessStore((state) => state.nodes);
  const edges = useProcessStore((state) => state.edges);
  const metadata = useProcessStore((state) => state.metadata);

  const code = useMemo(() => {
    if (!livePreview) return '';
    try {
      return generateClientRobotCode({ nodes, edges });
    } catch (err) {
      console.error('Failed to generate code:', err);
      return `# Error generating code: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }
  }, [nodes, edges, livePreview]);

  const handleEditorMount = (_editor: unknown, monaco: unknown) => {
    const monacoEditor = monaco as typeof import('monaco-editor');
    
    monacoEditor.languages.register({ id: 'robotframework' });
    
    monacoEditor.languages.setMonarchTokensProvider('robotframework', {
      defaultToken: '',
      tokenPostfix: '.robot',
      
      keywords: [
        'Library', 'Resource', 'Variables', 'Documentation', 'Metadata',
        'Suite Setup', 'Suite Teardown', 'Test Setup', 'Test Teardown',
        'Test Template', 'Test Timeout', 'Force Tags', 'Default Tags',
        'Tasks', 'Task', 'Test Cases', 'Test', 'Keywords', 'Keyword',
        'Settings', 'Setting', 'Variables', 'Variable',
        'IF', 'ELSE', 'ELSE IF', 'END', 'FOR', 'IN', 'IN RANGE', 'IN ENUMERATE', 'IN ZIP',
        'WHILE', 'TRY', 'EXCEPT', 'FINALLY', 'RETURN', 'BREAK', 'CONTINUE',
      ],
      
      operators: [],
      
      symbols: /[=><!~?:&|+\-*^%]+/,
      
      tokenizer: {
        root: [
          [/\*\*\*.*\*\*\*/, 'keyword'],
          [/^\s*[A-Z][a-zA-Z\s]+(?=\s{2,})/, 'keyword'],
          [/\$\{[^}]+\}/, 'variable'],
          [/@\{[^}]+\}/, 'variable'],
          [/&\{[^}]+\}/, 'variable'],
          [/#.*/, 'comment'],
          [/\d+/, 'number'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/'([^'\\]|\\.)*$/, 'string.invalid'],
          [/"/, 'string', '@string_double'],
          [/'/, 'string', '@string_single'],
        ],
        
        string_double: [
          [/[^\\"]+/, 'string'],
          [/\\./, 'string.escape'],
          [/"/, 'string', '@pop'],
        ],
        
        string_single: [
          [/[^\\']+/, 'string'],
          [/\\./, 'string.escape'],
          [/'/, 'string', '@pop'],
        ],
      },
    });
    
    monacoEditor.editor.setTheme('vs-dark');
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-200">
          Code Preview {metadata ? `- ${metadata.name}` : ''}
        </h3>
        <span className="text-xs text-slate-400">
          {nodes.length} nodes, {edges.length} edges
        </span>
      </div>
      
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="robotframework"
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            folding: true,
            renderLineHighlight: 'line',
            tabSize: 4,
            insertSpaces: true,
            automaticLayout: true,
          }}
          onMount={handleEditorMount}
        />
      </div>
    </div>
  );
};

export default CodePreviewPanel;
