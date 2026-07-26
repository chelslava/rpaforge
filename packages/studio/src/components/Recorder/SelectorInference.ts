import type { PageElement } from '../../types/ipc-contracts';

export interface CandidateSelector {
  type: string;
  value: string;
  reliability: number;
}

export interface RecordedAction {
  id: string;
  type: 'click' | 'input' | 'select' | 'navigate' | 'keypress';
  selector: CandidateSelector;
  allCandidates: CandidateSelector[];
  timestamp: number;
  source?: 'web' | 'desktop';
  value?: string;
}

export function inferSelectors(element: PageElement): CandidateSelector[] {
  const candidates: CandidateSelector[] = [];

  if (element.id) {
    candidates.push({ type: 'id', value: `#${element.id}`, reliability: 1.0 });
  }

  const tag = element.tag.toLowerCase();
  const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tag);
  if (isInteractive && element.text && element.text.trim().length > 0) {
    const text = element.text.trim().slice(0, 60);
    candidates.push({
      type: 'role+text',
      value: `${tag}:text("${text}")`,
      reliability: 0.85,
    });
  }

  if (element.classes.length > 0) {
    const classSelector = element.classes.map((c) => `.${c}`).join('');
    candidates.push({ type: 'css-class', value: classSelector, reliability: 0.6 });
  }

  if (element.xpath) {
    candidates.push({ type: 'xpath', value: element.xpath, reliability: 0.4 });
  }

  if (element.cssPath) {
    candidates.push({ type: 'css-path', value: element.cssPath, reliability: 0.3 });
  }

  return candidates.sort((a, b) => b.reliability - a.reliability);
}
