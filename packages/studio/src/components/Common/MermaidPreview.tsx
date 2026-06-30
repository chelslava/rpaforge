import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTimes, FaDownload, FaCopy, FaCode, FaImage } from 'react-icons/fa';
import type { Node, Edge } from '@xyflow/react';
import DOMPurify from 'dompurify';
import { useForcedColors, useResolvedTheme } from '../../hooks/useTheme';
import { diagramToMermaid } from '../../utils/mermaidGenerator';
import { reactFlowNodeArrayToRpaNodes, reactFlowEdgeArrayToRpaEdges } from '../../canvas/RpaNodeAdapter';

interface MermaidPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  title?: string;
}

export function MermaidPreview({ isOpen, onClose, nodes, edges, title = 'Diagram Preview' }: MermaidPreviewProps) {
  const { t } = useTranslation('common');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [renderError, setRenderError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const resolvedTheme = useResolvedTheme();
  const forcedColors = useForcedColors();

  const code = diagramToMermaid(
    reactFlowNodeArrayToRpaNodes(nodes) as Parameters<typeof diagramToMermaid>[0],
    reactFlowEdgeArrayToRpaEdges(edges)
  );

  useEffect(() => {
    if (!isOpen || viewMode !== 'preview' || !code) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderError(null);

    const renderId = `mermaid-preview-${Date.now()}`;

    import('mermaid').then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      });
      return m.default.render(renderId, code);
    }).then(({ svg }: { svg: string }) => {
      if (!cancelled && previewRef.current) {
        previewRef.current.innerHTML = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
        });
      }
    }).catch((err: Error) => {
      if (!cancelled) setRenderError(err?.message || 'Render failed');
    });

    return () => { cancelled = true; };
  }, [isOpen, viewMode, code, resolvedTheme, forcedColors]);

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
