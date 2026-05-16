import { useEffect } from 'react';
import { inferSelectors } from './SelectorInference';
import type { RecordedAction } from './SelectorInference';
import type { PageElement } from '../../types/ipc-contracts';

interface ActionCaptureProps {
  isRecording: boolean;
  onAction: (action: RecordedAction) => void;
}

function domElementToPageElement(el: Element): PageElement {
  const rect = el.getBoundingClientRect();
  const tag = el.tagName.toLowerCase();
  const id = el.id || null;
  const classes = Array.from(el.classList);
  const text = el.textContent?.trim().slice(0, 100) ?? null;

  const buildCssPath = (node: Element): string => {
    if (node.id) return `#${node.id}`;
    const parts: string[] = [];
    let current: Element | null = node;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      const siblings = Array.from(current.parentElement?.children ?? []).filter(
        (s) => s.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${idx})`;
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(' > ');
  };

  const buildXPath = (node: Element): string => {
    if (node.id) return `//*[@id="${node.id}"]`;
    const parts: string[] = [];
    let current: Element | null = node;
    while (current && current !== document.documentElement) {
      const tagName = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement?.children ?? []).filter(
        (s) => s.tagName === current!.tagName,
      );
      const idx = siblings.indexOf(current) + 1;
      parts.unshift(siblings.length > 1 ? `${tagName}[${idx}]` : tagName);
      current = current.parentElement;
    }
    return '/' + parts.join('/');
  };

  const cssPath = buildCssPath(el);
  const xpath = buildXPath(el);

  return {
    tag,
    id,
    classes,
    text,
    xpath,
    cssPath,
    reliableSelector: { type: 'css-path', value: cssPath, reliability: 0.3 },
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}

const ActionCapture: React.FC<ActionCaptureProps> = ({ isRecording, onAction }) => {
  useEffect(() => {
    if (!isRecording) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || target === document.body) return;

      const pageEl = domElementToPageElement(target);
      const candidates = inferSelectors(pageEl);
      const best = candidates[0] ?? { type: 'css-path', value: pageEl.cssPath, reliability: 0.3 };

      const action: RecordedAction = {
        id: crypto.randomUUID(),
        type: 'click',
        selector: best,
        allCandidates: candidates,
        timestamp: Date.now(),
      };
      onAction(action);
    };

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement | null;
      if (!target) return;

      const pageEl = domElementToPageElement(target);
      const candidates = inferSelectors(pageEl);
      const best = candidates[0] ?? { type: 'css-path', value: pageEl.cssPath, reliability: 0.3 };

      const action: RecordedAction = {
        id: crypto.randomUUID(),
        type: 'input',
        selector: best,
        allCandidates: candidates,
        timestamp: Date.now(),
        value: target.value,
      };
      onAction(action);
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('input', handleInput, true);
    };
  }, [isRecording, onAction]);

  return null;
};

export default ActionCapture;
