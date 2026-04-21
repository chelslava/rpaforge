import { useState, useCallback, useRef, useEffect } from 'react';
import { FaTimes, FaDownload, FaCopy, FaCode, FaImage } from 'react-icons/fa';
import type { Node, Edge } from '@reactflow/core';

interface MermaidPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  title?: string;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_').replace(/^(\d)/, '_$1');
}

function sanitizeLabel(label: string): string {
  return label.replace(/"/g, "'").replace(/\n/g, ' ').replace(/[()]/g, '');
}

function getNodeLabel(node: Node): string {
  const blockData = node.data?.blockData as { type?: string; condition?: string; itemVariable?: string; activityId?: string; variableName?: string } | undefined;
  if (!blockData) {
    return String(node.data?.label || 'Node');
  }

  switch (blockData.type) {
    case 'start': return String(node.data?.label || 'Start');
    case 'end': return String(node.data?.label || 'End');
    case 'if': return `IF ${blockData.condition || ''}`;
    case 'while': return `WHILE ${blockData.condition || ''}`;
    case 'for-each': return `FOR EACH ${blockData.itemVariable || 'item'}`;
    case 'try-catch': return 'TRY / CATCH';
    case 'switch': return 'SWITCH';
    case 'throw': return 'THROW';
    case 'assign': return `SET ${blockData.variableName || ''}`;
    case 'activity': return blockData.activityId || 'Activity';
    default: return String(blockData.type || 'Node').toUpperCase();
  }
}

function getNodeColor(blockData: { type?: string }): string {
  const t = blockData?.type;
  if (t === 'start') return '#22c55e';
  if (t === 'end') return '#ef4444';
  if (t === 'if' || t === 'switch') return '#f59e0b';
  if (t === 'while' || t === 'for-each') return '#8b5cf6';
  if (t === 'try-catch') return '#06b6d4';
  return '#64748b';
}

function getNodeShape(blockData: { type?: string }): string {
  const t = blockData?.type;
  if (t === 'start' || t === 'end') return 'stadium';
  if (t === 'if' || t === 'switch') return 'diamond';
  if (t === 'while' || t === 'for-each') return 'hexagon';
  return 'rounded';
}

function generateMermaid(nodes: Node[], edges: Edge[]): string {
  if (nodes.length === 0) return 'flowchart TD\n    empty(No nodes)';
  
  const lines: string[] = ['flowchart TD'];
  
  for (const node of nodes) {
    const id = sanitizeId(node.id);
    const label = sanitizeLabel(getNodeLabel(node));
    const blockData = node.data?.blockData as { type?: string } | undefined;
    const shape = getNodeShape(blockData ?? {});
    const color = getNodeColor(blockData ?? {});

    if (shape === 'stadium') lines.push(`    ${id}([${label}])`);
    else if (shape === 'diamond') lines.push(`    ${id}{${label}}`);
    else if (shape === 'hexagon') lines.push(`    ${id}{{${label}}}`);
    else lines.push(`    ${id}[${label}]`);

    lines.push(`    style ${id} fill:${color},stroke:${color},color:#fff`);
  }
  
  lines.push('');
  
  for (const edge of edges) {
    const src = sanitizeId(edge.source);
    const tgt = sanitizeId(edge.target);
    const handle = (edge as typeof edge & { handleId?: string }).handleId || edge.sourceHandle || '';
    
    if (handle === 'true' || handle === 'false') lines.push(`    ${src} -->|"${handle}"| ${tgt}`);
    else if (handle === 'body' || handle === 'next') lines.push(`    ${src} -->|"${handle}"| ${tgt}`);
    else if (handle === 'error') lines.push(`    ${src} -.->|"error"| ${tgt}`);
    else lines.push(`    ${src} --> ${tgt}`);
  }
  
  return lines.join('\n');
}

export function MermaidPreview({ isOpen, onClose, nodes, edges, title = 'Diagram Preview' }: MermaidPreviewProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [mermaidLoaded, setMermaidLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  
  const code = generateMermaid(nodes, edges);

  useEffect(() => {
    if (isOpen && viewMode === 'preview' && !mermaidLoaded) {
      import('mermaid').then((m) => {
        m.default.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#1f2937',
            primaryColor: '#3b82f6',
            primaryTextColor: '#f9fafb',
            primaryBorderColor: '#6b7280',
            lineColor: '#9ca3af',
          },
        });
        setMermaidLoaded(true);
      }).catch(() => {
        setRenderError('Failed to load Mermaid');
      });
    }
  }, [isOpen, viewMode, mermaidLoaded]);

  useEffect(() => {
    if (isOpen && viewMode === 'preview' && mermaidLoaded && previewRef.current && code) {
      const el = previewRef.current;
      el.innerHTML = '';
      setRenderError(null);
      
      import('mermaid').then((m) => {
        m.default.render('mermaid-svg', code).then(({ svg }: { svg: string }) => {
          el.innerHTML = svg;
        }).catch((err: Error) => {
          setRenderError(err.message);
        });
      }).catch(() => {
        setRenderError('Mermaid not loaded');
      });
    }
  }, [isOpen, viewMode, code, mermaidLoaded]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
  }, [code]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.mmd`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [code, title]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
         onClick={onClose}>
      <div className="bg-gray-900 rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-7xl flex flex-col border border-gray-700"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded-lg p-1">
              <button onClick={() => setViewMode('preview')}
                      className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 transition-colors ${
                        viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}>
                <FaImage size={14} />
                Preview
              </button>
              <button onClick={() => setViewMode('code')}
                      className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 transition-colors ${
                        viewMode === 'code' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}>
                <FaCode size={14} />
                Code
              </button>
            </div>
            <button onClick={handleCopy}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg" title="Copy">
              <FaCopy size={16} />
            </button>
            <button onClick={handleDownload}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg" title="Download">
              <FaDownload size={16} />
            </button>
            <button onClick={onClose}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg">
              <FaTimes size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {viewMode === 'preview' ? (
            <div className="w-full h-full flex flex-col">
              {renderError ? (
                <div className="flex-1 flex items-center justify-center text-red-400 p-8">
                  <div className="text-center">
                    <div className="text-lg mb-2">Render Error</div>
                    <div className="text-sm text-gray-500 mb-4">{renderError}</div>
                    <button onClick={() => setViewMode('code')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg">
                      View as Code
                    </button>
                  </div>
                </div>
              ) : (
                <div ref={previewRef} className="flex-1 overflow-auto p-8 bg-gray-800/30 flex items-center justify-center">
                  <div className="text-gray-500 flex items-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                    Rendering diagram...
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full overflow-auto p-6">
              <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap break-words bg-gray-950 rounded-lg p-4">
                {code}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-700 bg-gray-800/30">
          <span className="text-sm text-gray-500">{nodes.length} nodes, {edges.length} edges</span>
          <span className="text-sm text-gray-500">Mermaid flowchart</span>
        </div>
      </div>
    </div>
  );
}

export default MermaidPreview;
