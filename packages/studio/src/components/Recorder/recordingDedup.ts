/**
 * Deterministic recording cleanup (issue #869).
 *
 * Pure functions over the recorded action list — no AI, no consent flow:
 * consecutive keystrokes on the same field collapse into one Input Text,
 * double-click pairs collapse into a single click. Every rule is opt-out
 * via {@link DedupOptions}; the rules never merge actions captured from
 * different sources (web vs desktop) or different selectors.
 */

import type { RecordedAction } from './SelectorInference';

export interface DedupOptions {
  /** Merge consecutive `input` events on the same field (keep last value). */
  mergeConsecutiveInputs?: boolean;
  /** Collapse click pairs on the same element within the threshold. */
  collapseDoubleClicks?: boolean;
  /** Max gap in ms between two clicks treated as a double-click. */
  doubleClickThresholdMs?: number;
}

const DEFAULTS: Required<DedupOptions> = {
  mergeConsecutiveInputs: true,
  collapseDoubleClicks: true,
  doubleClickThresholdMs: 500,
};

const sameTarget = (a: RecordedAction, b: RecordedAction): boolean =>
  a.selector.value === b.selector.value &&
  (a.source ?? 'web') === (b.source ?? 'web');

/**
 * Clean up a recorded action list. Returns a new list; input actions
 * never mutate the originals.
 */
export function dedupeActions(
  actions: RecordedAction[],
  options: DedupOptions = {},
): RecordedAction[] {
  const opts = { ...DEFAULTS, ...options };
  const result: RecordedAction[] = [];

  for (const action of actions) {
    const previous = result[result.length - 1];

    if (
      opts.mergeConsecutiveInputs &&
      action.type === 'input' &&
      previous &&
      previous.type === 'input' &&
      sameTarget(previous, action)
    ) {
      // Keystroke/change accumulation on one field: the LAST value is the
      // field's final content (this is what makes re-typed passwords yield
      // exactly one Input Text step).
      result[result.length - 1] = { ...previous, value: action.value ?? '' };
      continue;
    }

    if (
      opts.collapseDoubleClicks &&
      action.type === 'click' &&
      previous &&
      previous.type === 'click' &&
      sameTarget(previous, action) &&
      action.timestamp - previous.timestamp <= opts.doubleClickThresholdMs
    ) {
      // Double-click lands as two click events; keep the first.
      continue;
    }

    result.push(action);
  }

  return result;
}

/** Count of actions removed by dedup (for the toggle badge in the UI). */
export function dedupRemovedCount(
  actions: RecordedAction[],
  options: DedupOptions = {},
): number {
  return actions.length - dedupeActions(actions, options).length;
}
