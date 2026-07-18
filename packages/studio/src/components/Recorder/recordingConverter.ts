import type { Edge } from '@xyflow/react';
import { createDefaultBlockData, type ActivityBlockData } from '../../types/blocks';
import type { ProcessNode } from '../../stores/blockStore';
import type { RecordedAction } from './SelectorInference';

export interface RecordedDiagram {
  nodes: ProcessNode[];
  edges: Edge[];
}

const ACTIVITY_BY_ACTION: Record<RecordedAction['type'], { id: string; name: string }> = {
  click: { id: 'WebUI.Click Element', name: 'Click Element' },
  input: { id: 'WebUI.Input Text', name: 'Input Text' },
  select: { id: 'WebUI.Select Option', name: 'Select Option' },
  navigate: { id: 'WebUI.Navigate', name: 'Navigate' },
  keypress: { id: 'WebUI.Press Keys', name: 'Press Keys' },
};

function activityData(action: RecordedAction, id: string): ActivityBlockData {
  const base = createDefaultBlockData('activity', id) as ActivityBlockData;
  const activity = ACTIVITY_BY_ACTION[action.type];
  const params: Record<string, unknown> = {};
  if (action.selector.value) params.selector = action.selector.value;
  if (action.type === 'input') params.text = action.value ?? '';
  if (action.type === 'select') params.value = action.value ?? '';
  if (action.type === 'keypress') params.keys = action.value ?? '';

  return {
    ...base,
    id,
    name: activity.name,
    label: `${activity.name}: ${action.selector.value}`,
    description: 'Generated from a recorded interaction.',
    activityId: activity.id,
    activityType: 'sync',
    library: 'WebUI',
    params,
    paramTypes: Object.fromEntries(Object.keys(params).map((key) => [key, 'string'])),
  };
}

export function convertRecordingToDiagram(actions: RecordedAction[]): RecordedDiagram {
  const start: ProcessNode = {
    id: 'recording-start',
    type: 'start',
    position: { x: 80, y: 180 },
    data: { blockData: createDefaultBlockData('start', 'recording-start') },
  };
  const actionNodes = actions.map((action, index): ProcessNode => {
    const id = `recording-action-${index + 1}`;
    return {
      id,
      type: 'activity',
      position: { x: 280 + index * 260, y: 180 },
      data: { blockData: activityData(action, id) },
    };
  });
  const end: ProcessNode = {
    id: 'recording-end',
    type: 'end',
    position: { x: 280 + actions.length * 260, y: 180 },
    data: { blockData: createDefaultBlockData('end', 'recording-end') },
  };
  const sequence = [start, ...actionNodes, end];
  return {
    nodes: sequence,
    edges: sequence.slice(0, -1).map((node, index) => ({
      id: `recording-edge-${index + 1}`,
      source: node.id,
      target: sequence[index + 1].id,
      type: 'smoothstep',
    })),
  };
}
