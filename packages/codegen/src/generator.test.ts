import { describe, it, expect } from 'vitest';
import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';
import { findStartNode, generatePythonCode, generateRobotCode } from './generator';

interface TestBlockData {
  type: string;
  [key: string]: unknown;
}

interface TestNodeData {
  blockData?: TestBlockData;
  activity?: { params?: Array<{ name: string }> };
  activityValues?: Record<string, unknown>;
  outputVariable?: string;
  [key: string]: unknown;
}

type TestRpaNode = RpaNode<TestNodeData>;
type TestRpaEdge = RpaEdge;

function createNode(
  id: string,
  type: string,
  overrides: Partial<TestNodeData> = {}
): TestRpaNode {
  const baseBlockData = { type };
  return {
    id,
    data: {
      blockData: { ...baseBlockData, ...(overrides.blockData || {}) },
      activity: overrides.activity,
      activityValues: overrides.activityValues,
      ...Object.fromEntries(
        Object.entries(overrides).filter(([k]) => k !== 'blockData' && k !== 'activity' && k !== 'activityValues')
      ),
    },
    position: { x: 0, y: 0 },
  };
}

function createEdge(source: string, target: string, handle?: string): TestRpaEdge {
  return { id: `${source}-${target}`, source, target, handle };
}

describe('findStartNode', () => {
  it('returns start node when present', () => {
    const nodes: TestRpaNode[] = [
      createNode('n1', 'start'),
      createNode('n2', 'activity', { blockData: { library: 'BuiltIn', name: 'Log' } }),
    ];

    const start = findStartNode(nodes);
    expect(start?.id).toBe('n1');
    expect(start?.data?.blockData?.type).toBe('start');
  });

  it('returns null when no start node exists', () => {
    const nodes: TestRpaNode[] = [
      createNode('n1', 'activity', { blockData: { library: 'BuiltIn', name: 'Log' } }),
      createNode('n2', 'activity', { blockData: { library: 'BuiltIn', name: 'Open Application' } }),
    ];

    const start = findStartNode(nodes);
    expect(start).toBeNull();
  });

  it('returns first start node when multiple exist', () => {
    const nodes: TestRpaNode[] = [
      createNode('n1', 'start'),
      createNode('n2', 'start'),
      createNode('n3', 'activity', { blockData: { library: 'BuiltIn', name: 'Log' } }),
    ];

    const start = findStartNode(nodes);
    expect(start).not.toBeNull();
    expect(start?.id).toBe('n1');
  });

  it('returns null when nodes array is empty', () => {
    const nodes: TestRpaNode[] = [];
    const start = findStartNode(nodes);
    expect(start).toBeNull();
  });
});

describe('generatePythonCode', () => {
  it('generates error when no start node exists', () => {
    const diagram = {
      nodes: [createNode('n1', 'activity', { blockData: { library: 'BuiltIn', name: 'Log' } })],
      edges: [],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('Code generation requires exactly one Start node');
    expect(result).toContain('Current diagram has 0');
  });

  it('generates error when multiple start nodes exist', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start'),
        createNode('n2', 'start'),
        createNode('n3', 'activity', { blockData: { library: 'BuiltIn', name: 'Log' } }),
      ],
      edges: [createEdge('n1', 'n3'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('Code generation requires exactly one Start node');
    expect(result).toContain('Current diagram has 2');
  });

  it('generates valid Python for empty process', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Empty Process' } }),
        createNode('n2', 'end'),
      ],
      edges: [createEdge('n1', 'n2')],
    };

    const result = generatePythonCode(diagram);
    expect(result).not.toContain('from rpaforge_libraries.BuiltIn import *');
    expect(result).toContain('def Empty_Process():');
    expect(result).toContain('    # End');
  });

  it('generates code for single activity Log', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'My Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).not.toContain('from rpaforge_libraries.BuiltIn import *');
    expect(result).toContain('def My_Test():');
    expect(result).toContain('builtin.log()');
  });

  it('generates code for single activity with parameters', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Open App Test' } }),
        createNode('n2', 'activity', {
          blockData: {
            library: 'DesktopUI',
            name: 'Open Application',
            activityId: 'Open Application',
          },
          activityValues: { executable: 'notepad.exe' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('from rpaforge_libraries.DesktopUI import *');
    expect(result).toContain('desktopui.open_application("notepad.exe")');
  });

  it('assigns the activity result to outputVariable when set', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Read Excel Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'Excel', name: 'Read Sheet To List', activityId: 'read_sheet_to_list' },
          outputVariable: 'orders',
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('orders = excel.read_sheet_to_list()');
  });

  it('sanitizes outputVariable into a valid Python identifier', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Sanitize Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          outputVariable: '2 my var!',
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('_2_my_var_ = builtin.log()');
  });

  it('omits the assignment when outputVariable is not set (existing behavior)', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'No Output Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('builtin.log()');
    expect(result).not.toContain('= builtin.log()');
  });

  it('imports each library only once when multiple activities use same library', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Multi Lib Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Set Variable', activityId: 'Set Variable' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3'), createEdge('n3', 'n4')],
    };

    const result = generatePythonCode(diagram);
    expect(result).not.toContain('from rpaforge_libraries.BuiltIn import *');
    expect(result).toContain('builtin.log()');
  });

  it('imports from multiple different libraries', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Multi Lib Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'DesktopUI', name: 'Open Application', activityId: 'Open Application' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3'), createEdge('n3', 'n4')],
    };

    const result = generatePythonCode(diagram);
    expect(result).not.toContain('from rpaforge_libraries.BuiltIn import *');
    expect(result).toContain('from rpaforge_libraries.DesktopUI import *');
    expect(result).toContain('builtin.log()');
    expect(result).toContain('desktopui.open_application()');
  });

  it('handles custom library path starting with rpaforge_libraries', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Custom Lib Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'rpaforge_libraries.Excel', name: 'Open Workbook', activityId: 'Open Workbook' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('from rpaforge_libraries.Excel import *');
    expect(result).toContain('excel.open_workbook()');
  });

  it('handles library path starting with RPAForge.', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'RPAForge Lib Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'RPAForge.Excel', name: 'Open Workbook', activityId: 'Open Workbook' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('from rpaforge_libraries.Excel import *');
    expect(result).toContain('excel.open_workbook()');
  });

  it('generates code for assign node', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Assign Test' } }),
        createNode('n2', 'assign', {
          blockData: { variableName: 'myVar', expression: '"Hello World"' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('myVar = "Hello World"');
  });

  it('generates code for if/else block', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'If Else Test' } }),
        createNode('n2', 'if', { blockData: { condition: '${x} > 5' } }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'X is greater' },
        }),
        createNode('n4', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'X is not greater' },
        }),
        createNode('n5', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'true'),
        createEdge('n2', 'n4', 'false'),
        createEdge('n3', 'n5'),
        createEdge('n4', 'n5'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('if ${x} > 5:');
    expect(result).toContain('builtin.log("X is greater")');
    expect(result).toContain('else:');
    expect(result).toContain('builtin.log("X is not greater")');
  });

  it('generates if without else when no false branch', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'If Only Test' } }),
        createNode('n2', 'if', { blockData: { condition: '${x} > 5' } }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'X is greater' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'true'),
        createEdge('n3', 'n4'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('if ${x} > 5:');
    expect(result).toContain('builtin.log("X is greater")');
    expect(result).not.toContain('else:');
  });

  it('generates code for switch block', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Switch Test' } }),
        createNode('n2', 'switch', {
          blockData: {
            type: 'switch',
            expression: '${status}',
            cases: [
              { id: 'case1', value: 'pending' },
              { id: 'case2', value: 'approved' },
              { id: 'case3', value: 'rejected' },
            ],
          },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Pending' },
        }),
        createNode('n4', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Approved' },
        }),
        createNode('n5', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Rejected' },
        }),
        createNode('n6', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'case1'),
        createEdge('n2', 'n4', 'case2'),
        createEdge('n2', 'n5', 'case3'),
        createEdge('n3', 'n6'),
        createEdge('n4', 'n6'),
        createEdge('n5', 'n6'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('if ${status} == \'pending\':');
    expect(result).toContain('elif ${status} == \'approved\':');
    expect(result).toContain('elif ${status} == \'rejected\':');
    expect(result).toContain('builtin.log("Pending")');
    expect(result).toContain('builtin.log("Approved")');
    expect(result).toContain('builtin.log("Rejected")');
  });

  it('generates switch with default case', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Switch Default Test' } }),
        createNode('n2', 'switch', {
          blockData: {
            type: 'switch',
            expression: '${status}',
            cases: [{ id: 'case1', value: 'pending' }],
          },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Pending' },
        }),
        createNode('n4', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Unknown status' },
        }),
        createNode('n5', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'case1'),
        createEdge('n2', 'n4', 'default'),
        createEdge('n3', 'n5'),
        createEdge('n4', 'n5'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('if ${status} == \'pending\':');
    expect(result).toContain('builtin.log("Pending")');
    expect(result).toContain('else:');
    expect(result).toContain('builtin.log("Unknown status")');
  });

  it('generates code for try/catch block', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Try Catch Test' } }),
        createNode('n2', 'try-catch', {
          blockData: {
            type: 'try-catch',
            exceptBlocks: [{ exceptionType: 'ValueError', variable: 've' }],
          },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Set Variable', activityId: 'Set Variable' },
          activityValues: { name: 'x', value: 'int("abc")' },
        }),
        createNode('n4', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: '${ve}' },
        }),
        createNode('n5', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2', 'output'),
        createEdge('n2', 'n3', 'output'),
        createEdge('n2', 'n4', 'error'),
        createEdge('n3', 'n5', 'output'),
        createEdge('n4', 'n5', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('try:');
    expect(result).toContain('builtin.set_variable("x", "int(\\"abc\\")")');
    expect(result).toContain('except ValueError as ve:');
    expect(result).toContain('builtin.log(${ve})');
  });

  it('generates try/catch with generic Exception when no exceptBlocks specified', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Try Generic Test' } }),
        createNode('n2', 'try-catch', {
          blockData: { type: 'try-catch' },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Try block' },
        }),
        createNode('n4', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Catch block' },
        }),
        createNode('n5', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2', 'output'),
        createEdge('n2', 'n3', 'output'),
        createEdge('n2', 'n4', 'error'),
        createEdge('n3', 'n5', 'output'),
        createEdge('n4', 'n5', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('try:');
    expect(result).toContain('except Exception as e:');
  });

  it('generates try/catch with finally block', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Try Finally Test' } }),
        createNode('n2', 'try-catch', {
          blockData: { type: 'try-catch', finallyBlock: true },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Try' },
        }),
        createNode('n4', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Finally' },
        }),
        createNode('n5', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2', 'output'),
        createEdge('n2', 'n3', 'output'),
        createEdge('n2', 'n4', 'finally'),
        createEdge('n3', 'n5', 'output'),
        createEdge('n4', 'n5', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('try:');
    expect(result).toContain('finally:');
    expect(result).toContain('builtin.log("Try")');
    expect(result).toContain('builtin.log("Finally")');
  });

  it('generates code for while loop', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'While Test' } }),
        createNode('n2', 'while', { blockData: { condition: '${i} < 10' } }),
        createNode('n3', 'assign', {
          blockData: { variableName: 'i', expression: '${i} + 1' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'body'),
        createEdge('n2', 'n4', 'next'),
        createEdge('n3', 'n2', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('while ${i} < 10:');
    expect(result).toContain('i = ${i} + 1');
  });

  it('generates while with while condition handle name', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'While Condition Test' } }),
        createNode('n2', 'while', { blockData: { condition: '${x} > 0' } }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: 'Countdown: ${x}' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'body'),
        createEdge('n2', 'n4', 'next'),
        createEdge('n3', 'n2', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('while ${x} > 0:');
    expect(result).toContain('builtin.log("Countdown: ${x}")');
  });

  it('generates code for for-each loop', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'For Each Test' } }),
        createNode('n2', 'for-each', {
          blockData: { itemVariable: 'item', collection: '${items}' },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: '${item}' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'body'),
        createEdge('n2', 'n4', 'next'),
        createEdge('n3', 'n2', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('for item in ${items}:');
    expect(result).toContain('builtin.log(${item})');
  });

  it('generates for-each with for-each condition handle name', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'For Each Condition Test' } }),
        createNode('n2', 'for-each', {
          blockData: { itemVariable: 'user', collection: '${users}' },
        }),
        createNode('n3', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
          activityValues: { message: '${user}' },
        }),
        createNode('n4', 'end'),
      ],
      edges: [
        createEdge('n1', 'n2'),
        createEdge('n2', 'n3', 'body'),
        createEdge('n2', 'n4', 'next'),
        createEdge('n3', 'n2', 'output'),
      ],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('for user in ${users}:');
  });

  it('generates code for throw block', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Throw Test' } }),
        createNode('n2', 'throw', {
          blockData: { message: 'Something went wrong', exceptionType: 'ValueError' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('raise ValueError("Something went wrong")');
  });

  it('generates throw with default exception type', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Throw Default Test' } }),
        createNode('n2', 'throw', {
          blockData: { message: 'Error occurred' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('raise Exception("Error occurred")');
  });

  it('generates code for activity with params array', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Activity Params Test' } }),
        createNode('n2', 'activity', {
          blockData: {
            library: 'BuiltIn',
            name: 'Set Variable',
            activityId: 'Set Variable',
          },
          activity: { params: [{ name: 'name' }, { name: 'value' }] },
          activityValues: { name: '${x}', value: '123' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('builtin.set_variable(${x}, "123")');
  });

  it('generates code for activity with no params', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Activity No Params Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Comment', activityId: 'Comment' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('builtin.comment()');
  });

  it('sanitizes process name as function name', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'My Super Test Process!' } }),
        createNode('n2', 'end'),
      ],
      edges: [createEdge('n1', 'n2')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('def My_Super_Test_Process_():');
  });

  it('uses default process name when not specified', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: {} }),
        createNode('n2', 'end'),
      ],
      edges: [createEdge('n1', 'n2')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('def Main_Process():');
  });

  it('produces # End comment for end node', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start'),
        createNode('n2', 'end'),
      ],
      edges: [createEdge('n1', 'n2')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('# End');
  });

  it('skips node without blockData gracefully', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Skip Test' } }),
        { id: 'n2', data: {} },
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('def Skip_Test():');
    expect(result).toContain('pass');
  });

  it('generates if __name__ == "__main__": entry point', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Main Entry Test' } }),
        createNode('n2', 'end'),
      ],
      edges: [createEdge('n1', 'n2')],
    };

    const result = generatePythonCode(diagram);
    expect(result).toContain('if __name__ == "__main__":');
    expect(result).toContain('Main_Entry_Test()');
  });
});

describe('generateRobotCode', () => {
  it('is the same function as generatePythonCode', () => {
    const diagram = {
      nodes: [
        createNode('n1', 'start', { blockData: { processName: 'Robot Test' } }),
        createNode('n2', 'activity', {
          blockData: { library: 'BuiltIn', name: 'Log', activityId: 'Log' },
        }),
        createNode('n3', 'end'),
      ],
      edges: [createEdge('n1', 'n2'), createEdge('n2', 'n3')],
    };

    const pythonResult = generatePythonCode(diagram);
    const robotResult = generateRobotCode(diagram);

    expect(robotResult).toBe(pythonResult);
  });

  it('generates identical output to generatePythonCode for validation error', () => {
    const diagram = {
      nodes: [],
      edges: [],
    };

    expect(generateRobotCode(diagram)).toBe(generatePythonCode(diagram));
  });
});
