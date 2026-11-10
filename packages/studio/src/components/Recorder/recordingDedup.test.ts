import { describe, expect, test } from 'vitest';

import { dedupeActions, dedupRemovedCount } from './recordingDedup';
import type { RecordedAction } from './SelectorInference';

let counter = 0;
function action(partial: Partial<RecordedAction>): RecordedAction {
  counter += 1;
  return {
    id: `action-${counter}`,
    type: 'click',
    selector: { type: 'css', value: '#btn', reliability: 1 },
    allCandidates: [],
    timestamp: counter * 1000,
    ...partial,
  };
}

describe('dedupeActions', () => {
  test('merges consecutive keystrokes on the same field keeping the last value', () => {
    const actions = [
      action({ type: 'input', selector: { type: 'css', value: '#user', reliability: 1 }, value: 'u' }),
      action({ type: 'input', selector: { type: 'css', value: '#user', reliability: 1 }, value: 'us' }),
      action({ type: 'input', selector: { type: 'css', value: '#user', reliability: 1 }, value: 'user1' }),
      action({ type: 'input', selector: { type: 'css', value: '#pass', reliability: 1 }, value: 'x' }),
      action({ type: 'input', selector: { type: 'css', value: '#pass', reliability: 1 }, value: 'xy' }),
      action({ type: 'input', selector: { type: 'css', value: '#pass', reliability: 1 }, value: 'xyz' }),
    ];
    const result = dedupeActions(actions);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ selector: { value: '#user' }, value: 'user1' });
    expect(result[1]).toMatchObject({ selector: { value: '#pass' }, value: 'xyz' });
  });

  test('keeps inputs on different fields or sources separate', () => {
    const actions = [
      action({ type: 'input', selector: { type: 'css', value: '#a', reliability: 1 }, value: '1' }),
      action({ type: 'input', selector: { type: 'css', value: '#b', reliability: 1 }, value: '2' }),
      action({ type: 'input', source: 'desktop', selector: { type: 'css', value: '#a', reliability: 1 }, value: '3' }),
    ];
    expect(dedupeActions(actions)).toHaveLength(3);
  });

  test('collapses double-click pairs within the threshold', () => {
    const actions = [
      action({ type: 'click', timestamp: 1000 }),
      action({ type: 'click', timestamp: 1180 }),
      action({ type: 'click', timestamp: 5000 }),
    ];
    const result = dedupeActions(actions, { doubleClickThresholdMs: 500 });
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe(1000);
    expect(result[1].timestamp).toBe(5000);
  });

  test('clicks beyond the threshold are separate (single-click semantics preserved)', () => {
    const actions = [
      action({ type: 'click', timestamp: 1000 }),
      action({ type: 'click', timestamp: 1700 }),
      action({ type: 'click', timestamp: 2400 }),
    ];
    expect(dedupeActions(actions, { doubleClickThresholdMs: 500 })).toHaveLength(3);
  });

  test('double-click collapse does not merge different selectors', () => {
    const actions = [
      action({ type: 'click', selector: { type: 'css', value: '#ok', reliability: 1 }, timestamp: 1000 }),
      action({ type: 'click', selector: { type: 'css', value: '#cancel', reliability: 1 }, timestamp: 1100 }),
    ];
    expect(dedupeActions(actions)).toHaveLength(2);
  });

  test('login flow acceptance: re-typed password yields exactly the clean sequence', () => {
    const actions = [
      action({ type: 'navigate', selector: { type: 'url', value: 'https://app', reliability: 1 } }),
      action({ type: 'click', selector: { type: 'css', value: '#user', reliability: 1 } }),
      action({ type: 'input', selector: { type: 'css', value: '#user', reliability: 1 }, value: 'admin' }),
      action({ type: 'click', selector: { type: 'css', value: '#pass', reliability: 1 }, timestamp: 90000 }),
      action({ type: 'input', selector: { type: 'css', value: '#pass', reliability: 1 }, value: 'p' }),
      action({ type: 'input', selector: { type: 'css', value: '#pass', reliability: 1 }, value: 'p1' }),
      action({ type: 'input', selector: { type: 'css', value: '#pass', reliability: 1 }, value: 'p12' }),
      action({ type: 'click', selector: { type: 'css', value: '#submit', reliability: 1 }, timestamp: 91000 }),
    ];
    const result = dedupeActions(actions);
    expect(result.map((a) => a.type)).toEqual([
      'navigate', 'click', 'input', 'click', 'input', 'click',
    ]);
    expect(result.find((a) => a.type === 'input' && a.selector.value === '#pass')?.value).toBe('p12');
  });

  test('rules are independently opt-out', () => {
    const actions = [
      action({ type: 'input', selector: { type: 'css', value: '#a', reliability: 1 }, value: '1' }),
      action({ type: 'input', selector: { type: 'css', value: '#a', reliability: 1 }, value: '12' }),
      action({ type: 'click', timestamp: 1000 }),
      action({ type: 'click', timestamp: 1100 }),
    ];
    expect(dedupeActions(actions, { mergeConsecutiveInputs: false })).toHaveLength(3);
    expect(dedupeActions(actions, { collapseDoubleClicks: false })).toHaveLength(3);
    expect(dedupeActions(actions, { mergeConsecutiveInputs: false, collapseDoubleClicks: false })).toHaveLength(4);
  });

  test('dedupRemovedCount reports the reduction', () => {
    const actions = [
      action({ type: 'input', selector: { type: 'css', value: '#a', reliability: 1 }, value: '1' }),
      action({ type: 'input', selector: { type: 'css', value: '#a', reliability: 1 }, value: '12' }),
      action({ type: 'click', timestamp: 1000 }),
      action({ type: 'click', timestamp: 1100 }),
    ];
    expect(dedupRemovedCount(actions)).toBe(2);
    expect(dedupRemovedCount(actions, { mergeConsecutiveInputs: false, collapseDoubleClicks: false })).toBe(0);
  });
});
