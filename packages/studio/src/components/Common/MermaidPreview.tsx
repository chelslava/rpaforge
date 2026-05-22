import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTimes, FaDownload, FaCopy, FaCode, FaImage } from 'react-icons/fa';
import type { Node, Edge } from '@reactflow/core';
import { useForcedColors, useResolvedTheme } from '../../hooks/useTheme';

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
  const { t } = useTranslation('common');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [mermaidLoaded, setMermaidLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const resolvedTheme = useResolvedTheme();
  const forcedColors = useForcedColors();
  
  const code = generateMermaid(nodes, edges);

  useEffect(() => {
    if (isOpen && viewMode === 'preview') {
      import('mermaid').then((m) => {
        m.default.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            darkMode: resolvedTheme === 'dark',
            background: 'var(--color-ui-surface)',
            primaryColor: 'var(--color-ui-primary)',
            primaryTextColor: 'var(--color-ui-text-inverse)',
            primaryBorderColor: 'var(--color-ui-border-strong)',
            lineColor: 'var(--color-ui-text-muted)',
            tertiaryColor: 'var(--color-ui-surface-muted)',
            textColor: 'var(--color-ui-text)',
          },
        });
        setMermaidLoaded(true);
      }).catch(() => {
        setRenderError('Failed to load Mermaid');
      });
    }
  }, [forcedColors, isOpen, resolvedTheme, viewMode]);

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
  }, [isOpen, viewMode, code, mermaidLoaded, resolvedTheme, forcedColors]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-overlay backdrop-blur-sm"
         onClick={onClose}>
      <div className="bg-ui-surface rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-7xl flex flex-col border border-ui-border"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ui-border">
          <h2 className="text-lg font-semibold text-ui-text">{title}</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-ui-surface-muted rounded-lg p-1">
              <button onClick={() => setViewMode('preview')}
                      className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 transition-colors ${
                        viewMode === 'preview' ? 'bg-ui-primary text-ui-text-inverse' : 'text-ui-text-muted hover:text-ui-text'
                      }`}>
                <FaImage size={14} />
                {t('preview')}
              </button>
              <button onClick={() => setViewMode('code')}
                      className={`px-3 py-1.5 text-sm rounded-md flex items-center gap-1.5 transition-colors ${
                        viewMode === 'code' ? 'bg-ui-primary text-ui-text-inverse' : 'text-ui-text-muted hover:text-ui-text'
                      }`}>
                <FaCode size={14} />
                {t('code')}
              </button>
            </div>
            <button onClick={handleCopy}
                    className="p-2 text-ui-text-muted hover:text-ui-text hover:bg-ui-surface-hover rounded-lg" title={t('mermaidPreview.copy')}>
              <FaCopy size={16} />
            </button>
            <button onClick={handleDownload}
                    className="p-2 text-ui-text-muted hover:text-ui-text hover:bg-ui-surface-hover rounded-lg" title={t('mermaidPreview.download')}>
              <FaDownload size={16} />
            </button>
            <button onClick={onClose}
                    className="p-2 text-ui-text-muted hover:text-ui-text hover:bg-ui-surface-hover rounded-lg">
              <FaTimes size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {viewMode === 'preview' ? (
            <div className="w-full h-full flex flex-col">
              {renderError ? (
                <div className="flex-1 flex items-center justify-center text-ui-danger p-8">
                  <div className="text-center">
                    <div className="text-lg mb-2">{t('mermaidPreview.renderError')}</div>
                    <div className="text-sm text-ui-text-muted mb-4">{renderError}</div>
                    <button onClick={() => setViewMode('code')} className="px-4 py-2 bg-ui-primary hover:bg-ui-primary-hover text-ui-text-inverse rounded-lg">
                      {t('view_as_code')}
                    </button>
                  </div>
                </div>
              ) : (
                <div ref={previewRef} className="flex-1 overflow-auto p-8 bg-ui-surface-muted flex items-center justify-center">
                  <div className="text-ui-text-muted flex items-center gap-2">
                    <div className="animate-spin w-5 h-5 border-2 border-ui-primary border-t-transparent rounded-full" />
                    {t('rendering_diagram')}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full overflow-auto p-6">
              <pre className="text-sm text-ui-text font-mono whitespace-pre-wrap break-words bg-ui-surface-muted rounded-lg p-4">
                {code}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-t border-ui-border bg-ui-surface-muted">
          <span className="text-sm text-ui-text-muted">{nodes.length} nodes, {edges.length} edges</span>
          <span className="text-sm text-ui-text-muted">{t('mermaid_flowchart')}</span>
        </div>
      </div>
    </div>
  );
}

export default MermaidPreview;
