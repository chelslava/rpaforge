import type { Edge } from '@xyflow/react';
import { createDefaultBlockData, type ActivityBlockData, type TryCatchBlockData } from '../../types/blocks';
import type { ProcessNode } from '../../stores/blockStore';
import type { RecordedAction } from './SelectorInference';

export interface RecordedDiagram {
  nodes: ProcessNode[];
  edges: Edge[];
}

export type RecordingTranslator = (key: string) => string;

const WEB_ACTIVITY_BY_ACTION: Record<RecordedAction['type'], { id: string; name: string }> = {
  click: { id: 'WebUI.Click Element', name: 'Click Element' },
  input: { id: 'WebUI.Input Text', name: 'Input Text' },
  select: { id: 'WebUI.Select Option', name: 'Select Option' },
  navigate: { id: 'WebUI.Navigate', name: 'Navigate' },
  keypress: { id: 'WebUI.Press Keys', name: 'Press Keys' },
};

const DESKTOP_ACTIVITY_BY_ACTION: Partial<Record<RecordedAction['type'], { id: string; name: string }>> = {
  click: { id: 'DesktopUI.Click Element', name: 'Click Element' },
  input: { id: 'DesktopUI.Input Text', name: 'Input Text' },
  keypress: { id: 'DesktopUI.Press Keys', name: 'Press Keys' },
};

function activityData(
  action: RecordedAction,
  id: string,
  translate: RecordingTranslator,
): ActivityBlockData {
  const base = createDefaultBlockData('activity', id) as ActivityBlockData;
  const desktopActivity =
    action.source === 'desktop' ? DESKTOP_ACTIVITY_BY_ACTION[action.type] : undefined;
  const library = desktopActivity ? 'DesktopUI' : 'WebUI';
  const activity = desktopActivity ?? WEB_ACTIVITY_BY_ACTION[action.type];
  const params: Record<string, unknown> = {};
  if (action.selector.value) params.selector = action.selector.value;
  if (action.type === 'input') params.text = action.value ?? '';
  if (action.type === 'select') params.value = action.value ?? '';
  if (action.type === 'keypress') params.keys = action.value ?? '';

  // Smart-selector fallback chain (issue #848): primary first, then the
  // recorded candidates in capture order, de-duplicated by value.
  const selectorChain = [
    {
      type: action.selector.type,
      value: action.selector.value,
      reliability: action.selector.reliability,
    },
    ...(action.allCandidates ?? []).filter(
      (candidate) =>
        candidate && candidate.value && candidate.value !== action.selector.value,
    ),
  ];

  return {
    ...base,
    id,
    name: translate(`recorder.activities.${action.type}`),
    label: `${translate(`recorder.activities.${action.type}`)}: ${action.selector.value}`,
    description: translate('recorder.generatedDescription'),
    activityId: activity.id,
    activityType: 'sync',
    library,
    params,
    paramTypes: Object.fromEntries(Object.keys(params).map((key) => [key, 'string'])),
    selectorChain,
  };
}

interface Segment {
  /** Linear (unwrapped) actions converted to plain chain nodes. */
  plain: RecordedAction[];
  /** Contiguous run of actions wrapped in try-catch (issue #869). */
  wrapped: RecordedAction[];
}

/** Split the included actions into plain runs and contiguous try-catch runs. */
export function segmentActions(actions: RecordedAction[]): Segment[] {
  const included = actions.filter((action) => action.included !== false);
  const segments: Segment[] = [];
  for (const action of included) {
    const wrapped = action.wrapIn === 'try-catch';
    const last = segments[segments.length - 1];
    if (last && last.wrapped.length > 0 === wrapped && (wrapped || last.plain.length > 0)) {
      if (wrapped) {
        last.wrapped.push(action);
      } else {
        last.plain.push(action);
      }
    } else {
      segments.push(wrapped ? { plain: [], wrapped: [action] } : { plain: [action], wrapped: [] });
    }
  }
  return segments;
}

export function convertRecordingToDiagram(
  actions: RecordedAction[],
  translate: RecordingTranslator = (key) =>
    key.startsWith('recorder.activities.')
      ? WEB_ACTIVITY_BY_ACTION[key.slice('recorder.activities.'.length) as RecordedAction['type']].name
      : 'Generated from a recorded interaction.',
): RecordedDiagram {
  const start: ProcessNode = {
    id: 'recording-start',
    type: 'start',
    position: { x: 80, y: 180 },
    data: { blockData: createDefaultBlockData('start', 'recording-start') },
  };
  const end: ProcessNode = {
    id: 'recording-end',
    type: 'end',
    position: { x: 0, y: 180 },
    data: { blockData: createDefaultBlockData('end', 'recording-end') },
  };

  const nodes: ProcessNode[] = [start];
  const edges: Edge[] = [];
  let positionX = 280;
  let previousId = start.id;

  const attach = (node: ProcessNode, sourceHandle?: string) => {
    nodes.push(node);
    edges.push({
      id: `recording-edge-${edges.length + 1}`,
      source: previousId,
      target: node.id,
      type: 'smoothstep',
      ...(sourceHandle ? { sourceHandle } : {}),
    });
    previousId = node.id;
  };

  const segments = segmentActions(actions);
  segments.forEach((segment, segmentIndex) => {
    const nextSegment = segments[segmentIndex + 1];
    const mergeId =
      nextSegment && nextSegment.plain.length > 0
        ? `recording-action-${segmentIndex + 2}-1`
        : 'recording-end';

    if (segment.wrapped.length > 0) {
      // Try-catch group (issue #869): the python converter reads the group
      // from graph handles — `output` runs the protected chain, `error`
      // goes straight to the merge continuation (empty catch body).
      const tryId = `recording-try-${segmentIndex + 1}`;
      const tryNode: ProcessNode = {
        id: tryId,
        type: 'try-catch',
        position: { x: positionX, y: 180 },
        data: {
          blockData: {
            ...(createDefaultBlockData('try-catch', tryId) as TryCatchBlockData),
            exceptBlocks: [],
          },
        },
      };
      attach(tryNode);

      const wrappedNodes = segment.wrapped.map((action, index): ProcessNode => {
        const id = `${tryId}-step-${index + 1}`;
        return {
          id,
          type: 'activity',
          position: { x: positionX + (index + 1) * 260, y: 180 },
          data: { blockData: activityData(action, id, translate) },
        };
      });
      wrappedNodes.forEach((node) => attach(node, 'output'));
      positionX += segment.wrapped.length * 260 + 260;

      // error handle + chain continuation both land on the merge point.
      edges.push({
        id: `recording-edge-${edges.length + 1}`,
        source: tryId,
        target: mergeId,
        type: 'smoothstep',
        sourceHandle: 'error',
      });
      // If the merge is the end node it is attached below; when the merge
      // is a plain action it is attached by the next segment iteration.
      if (mergeId === 'recording-end') {
        end.position = { x: positionX, y: 180 };
        positionX += 260;
      }
      return;
    }

    segment.plain.forEach((action, index) => {
      const id = `recording-action-${segmentIndex + 1}-${index + 1}`;
      const node: ProcessNode = {
        id,
        type: 'activity',
        position: { x: positionX, y: 180 },
        data: { blockData: activityData(action, id, translate) },
      };
      attach(node);
      positionX += 260;
    });
  });

  end.position = { x: positionX, y: 180 };
  nodes.push(end);
  edges.push({
    id: `recording-edge-${edges.length + 1}`,
    source: previousId,
    target: end.id,
    type: 'smoothstep',
  });

  return { nodes, edges };
}
