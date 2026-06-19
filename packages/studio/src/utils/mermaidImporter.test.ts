import { describe, expect, test } from 'vitest';
import type { RpaNode, RpaEdge } from '@rpaforge/domain-model';
import { diagramToMermaid } from '@rpaforge/codegen';

import { parseMermaidToDiagram } from './mermaidImporter';

function findNode(result: ReturnType<typeof parseMermaidToDiagram>, id: string) {
  return result.nodes.find((n) => n.id === id);
}

describe('parseMermaidToDiagram', () => {
  test('rejects input with no flowchart/graph header', () => {
    const result = parseMermaidToDiagram('just some text\nA --> B');
    expect(result.nodes).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('rejects unsupported diagram types with a clear warning', () => {
    const result = parseMermaidToDiagram('sequenceDiagram\n    Alice->>Bob: Hello');
    expect(result.nodes).toEqual([]);
    expect(result.warnings[0]).toMatch(/flowchart\/graph/i);
  });

  test('does not throw on empty or garbage input', () => {
    expect(() => parseMermaidToDiagram('')).not.toThrow();
    expect(() => parseMermaidToDiagram('flowchart TD\n!!!garbage!!!')).not.toThrow();
    const result = parseMermaidToDiagram('flowchart TD\n!!!garbage!!!');
    expect(result.nodes).toEqual([]);
  });

  test('round-trips a simple linear diagram produced by diagramToMermaid', () => {
    const nodes: RpaNode<any>[] = [
      { id: 'n1', data: { label: 'Start', blockData: { type: 'start' } }, position: { x: 0, y: 0 } },
      {
        id: 'n2',
        data: { label: 'Do thing', blockData: { type: 'activity', activityId: 'do-thing' } },
        position: { x: 0, y: 100 },
      },
      { id: 'n3', data: { label: 'End', blockData: { type: 'end' } }, position: { x: 0, y: 200 } },
    ];
    const edges: RpaEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ];

    const mermaid = diagramToMermaid(nodes, edges);
    const result = parseMermaidToDiagram(mermaid);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(findNode(result, 'n1')?.type).toBe('start');
    expect(findNode(result, 'n3')?.type).toBe('end');
  });

  test('classifies a diamond with true/false-labeled edges as an if block with correct ports', () => {
    const code = `flowchart TD
    A([Start]) --> B{Is valid?}
    B -->|"true"| C[Accept]
    B -->|"false"| D[Reject]
    C --> E([End])
    D --> E`;

    const result = parseMermaidToDiagram(code);
    const branch = findNode(result, 'B');
    expect(branch?.type).toBe('if');

    const trueEdge = result.edges.find((e) => e.source === 'B' && e.sourceHandle === 'true');
    const falseEdge = result.edges.find((e) => e.source === 'B' && e.sourceHandle === 'false');
    expect(trueEdge?.target).toBe('C');
    expect(falseEdge?.target).toBe('D');
  });

  test('handles inline hand-written node declarations within edge lines', () => {
    const code = `flowchart TD
    A[Step 1] --> B{Done?}
    B -->|Yes| C[Step 2]
    B -->|No| A`;

    const result = parseMermaidToDiagram(code);
    expect(result.nodes).toHaveLength(3);
    expect(findNode(result, 'B')?.type).toBe('if');
    const yesEdge = result.edges.find((e) => e.source === 'B' && e.target === 'C');
    expect(yesEdge?.sourceHandle).toBe('true');
  });

  test('imports a generic/unrecognized rectangle as an Activity placeholder carrying the original label', () => {
    const code = `flowchart TD
    A([Start]) --> B[Click submit button]
    B --> C([End])`;

    const result = parseMermaidToDiagram(code);
    const generic = findNode(result, 'B');
    expect(generic?.type).toBe('activity');
    expect((generic?.data.blockData as { label?: string })?.label).toBe('Click submit button');
    expect(generic?.data.activity).toBeUndefined();
  });

  test('keeps only the first stadium node as Start and warns about the rest', () => {
    const code = `flowchart TD
    A([Begin]) --> C[Step]
    B([Also Begin]) --> C
    C --> D([Finish])`;

    const result = parseMermaidToDiagram(code);
    const starts = result.nodes.filter((n) => n.type === 'start');
    expect(starts).toHaveLength(1);
    expect(result.warnings.some((w) => /multiple start/i.test(w))).toBe(true);
  });

  test('warns when no Start node can be identified but still imports what it can', () => {
    const code = `flowchart TD
    A[Step 1] --> B[Step 2]`;

    const result = parseMermaidToDiagram(code);
    expect(result.nodes).toHaveLength(2);
    expect(result.warnings.some((w) => /no start node/i.test(w))).toBe(true);
  });

  test('routes a try-catch subroutine node into output/error ports', () => {
    const code = `flowchart TD
    A([Start]) --> B[[Risky step]]
    B --> C([End])
    B -->|"error"| D([Fail])`;

    const result = parseMermaidToDiagram(code);
    expect(findNode(result, 'B')?.type).toBe('try-catch');
    const successEdge = result.edges.find((e) => e.source === 'B' && e.target === 'C');
    const errorEdge = result.edges.find((e) => e.source === 'B' && e.target === 'D');
    expect(successEdge?.sourceHandle).toBe('output');
    expect(errorEdge?.sourceHandle).toBe('error');
  });

  test('builds switch cases from labeled edges out of a multi-branch diamond', () => {
    const code = `flowchart TD
    A([Start]) --> B{Pick}
    B -->|"one"| C[Path 1]
    B -->|"two"| D[Path 2]
    B -->|"three"| E[Path 3]`;

    const result = parseMermaidToDiagram(code);
    const switchNode = findNode(result, 'B');
    expect(switchNode?.type).toBe('switch');
    const cases = (switchNode?.data.blockData as { cases?: Array<{ id: string }> })?.cases ?? [];
    expect(cases).toHaveLength(3);
  });
});
