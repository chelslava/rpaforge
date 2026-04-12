import type { Edge, Node } from '@reactflow/core';
import type { ProcessNodeData } from '../stores/processStore';
import type { DiagramDocument, DiagramMetadata, ProjectConfig } from '../stores/diagramStore';
import {
  buildGraph,
  findCommonMergeNode,
  findStartNode,
} from '../domain/diagram';
import { getActivityKeyword, formatSwitchCondition } from '../domain/codegen';

function sanitizeString(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export interface ClientCodegenDiagram {
  nodes: Array<Node<ProcessNodeData>>;
  edges: Array<Edge>;
  metadata?: { id?: string; name?: string };
  activeDiagramId?: string;
  project?: ProjectConfig | null;
  diagramDocuments?: Record<string, DiagramDocument>;
}

type DiagramDocumentMap = Record<string, DiagramDocument>;

function validateDiagram(diagram: ClientCodegenDiagram): string | null {
  const startNodes = diagram.nodes.filter((node) => node.data.blockData?.type === 'start');
  if (startNodes.length !== 1) {
    return `Code generation requires exactly one Start node. Current diagram has ${startNodes.length}.`;
  }

  const graph = buildGraph(diagram.edges);

  for (const node of diagram.nodes) {
    const blockData = node.data.blockData;
    if (!blockData) {
      continue;
    }

    const outgoing = graph.get(node.id) || [];

    if (blockData.type === 'parallel' || outgoing.some((edge) => edge.handle?.startsWith('branch'))) {
      return 'Parallel graph semantics are not supported in browser fallback code generation.';
    }

    if (blockData.type === 'switch') {
      const expected = new Set([...(blockData.cases || []).map((switchCase) => switchCase.id), 'default']);
      const handles = outgoing.map((edge) => edge.handle || '');
      if (new Set(handles).size !== handles.length) {
        return 'Switch blocks must have at most one edge per case/default handle.';
      }
      if (handles.some((handle) => !expected.has(handle))) {
        return 'Switch blocks may only use configured case handles plus default in browser fallback code generation.';
      }
    }

    if (blockData.type === 'try-catch') {
      const handles = outgoing.map((edge) => edge.handle || '');
      if (new Set(handles).size !== handles.length) {
        return 'Try/Catch blocks must have at most one output, error, and finally edge.';
      }
      if (handles.some((handle) => !['output', 'error', 'finally'].includes(handle))) {
        return 'Try/Catch blocks may only use output, error, and finally handles.';
      }
      if ((blockData.exceptBlocks || []).length > 1) {
        return 'Try/Catch fallback code generation currently supports at most one EXCEPT handler.';
      }
    }
  }

  return null;
}

function normalizeVariableName(name: string): string {
  const sanitized = sanitizeString(name.trim());
  if (!sanitized) {
    return '${value}';
  }
  if (sanitized.startsWith('${') && sanitized.endsWith('}')) {
    return sanitized;
  }
  return '${' + sanitized + '}';
}

function collectReachableDiagrams(
  diagramId: string,
  documents: DiagramDocumentMap,
  errors: string[],
  visited: Set<string> = new Set(),
  stack: string[] = [],
  ordered: string[] = []
): string[] {
  if (stack.includes(diagramId)) {
    errors.push(`Circular sub-diagram reference detected: ${[...stack, diagramId].join(' -> ')}`);
    return ordered;
  }

  if (visited.has(diagramId)) {
    return ordered;
  }

  const document = documents[diagramId];
  if (!document) {
    errors.push(`Diagram "${diagramId}" not found in project documents.`);
    return ordered;
  }

  visited.add(diagramId);
  stack.push(diagramId);
  ordered.push(diagramId);

  for (const node of document.nodes) {
    const blockData = node.data.blockData;
    if (blockData?.type !== 'sub-diagram-call') {
      continue;
    }
    if (blockData.diagramId) {
      collectReachableDiagrams(
        blockData.diagramId,
        documents,
        errors,
        visited,
        stack,
        ordered
      );
    }
  }

  stack.pop();
  return ordered;
}

function createProjectContext(diagram: ClientCodegenDiagram): {
  activeDiagramId: string;
  activeMeta: DiagramMetadata;
  documents: DiagramDocumentMap;
  metadataById: Record<string, DiagramMetadata>;
} | null {
  if (!diagram.project || !diagram.diagramDocuments) {
    return null;
  }

  const metadataById = Object.fromEntries(
    diagram.project.diagrams.map((diagramMeta) => [diagramMeta.id, diagramMeta])
  );

  const activeDiagramId =
    diagram.activeDiagramId || diagram.metadata?.id || diagram.project.main;
  if (!activeDiagramId) {
    return null;
  }

  const activeMeta = metadataById[activeDiagramId];
  if (!activeMeta) {
    return null;
  }

  const documents: DiagramDocumentMap = {
    ...diagram.diagramDocuments,
    [activeDiagramId]:
      diagram.diagramDocuments[activeDiagramId] || {
        metadata: {
          id: activeDiagramId,
          name: diagram.metadata?.name || activeMeta.name,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        nodes: diagram.nodes,
        edges: diagram.edges,
      },
  };

  return {
    activeDiagramId,
    activeMeta,
    documents,
    metadataById,
  };
}

function createSingleDocument(diagram: ClientCodegenDiagram): DiagramDocument {
  return {
    metadata: {
      id: diagram.metadata?.id || 'active-diagram',
      name: diagram.metadata?.name || 'Main Process',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    nodes: diagram.nodes,
    edges: diagram.edges,
  };
}

function buildSubDiagramCallLine(
  blockData: Extract<NonNullable<ProcessNodeData['blockData']>, { type: 'sub-diagram-call' }>,
  metadataById: Record<string, DiagramMetadata>,
  prefix: string
): string {
  const diagramMeta = metadataById[blockData.diagramId];
  const diagramName = sanitizeString(diagramMeta?.name || blockData.diagramName || 'SubProcess');
  const orderedInputs = diagramMeta?.inputs || Object.keys(blockData.parameters || {});
  const orderedOutputs = diagramMeta?.outputs || Object.keys(blockData.returns || {});

  const args = orderedInputs
    .map((inputName) => blockData.parameters?.[inputName])
    .filter((value): value is string => Boolean(value))
    .map((value) => sanitizeString(value));

  const assignments = orderedOutputs
    .map((outputName) => blockData.returns?.[outputName])
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeVariableName(value));

  const parts = [prefix];
  if (assignments.length > 0) {
    parts.push(`${assignments.join('    ')}=    `);
  }
  parts.push(diagramName);
  if (args.length > 0) {
    parts.push(`    ${args.join('    ')}`);
  }
  return parts.join('');
}

function generateRobotFile(
  activeDiagramId: string,
  activeMeta: DiagramMetadata,
  documents: DiagramDocumentMap,
  metadataById: Record<string, DiagramMetadata>
): string {
  const errors: string[] = [];
  const reachableDiagrams = collectReachableDiagrams(activeDiagramId, documents, errors);
  if (errors.length > 0) {
    return `# ${errors[0]}`;
  }

  for (const diagramId of reachableDiagrams) {
    const document = documents[diagramId];
    const validationError = validateDiagram({
      nodes: document?.nodes || [],
      edges: document?.edges || [],
    });
    if (validationError) {
      return `# ${validationError}`;
    }
  }

  const libraries = new Set<string>(['BuiltIn']);
  const variables = new Map<string, string>();

  const generateNode = (
    diagramId: string,
    nodeId: string | undefined,
    indent = 1,
    stopNode?: string,
    visited: Set<string> = new Set()
  ): string[] => {
    if (!nodeId || nodeId === stopNode || visited.has(nodeId)) {
      return [];
    }

    const document = documents[diagramId];
    if (!document) {
      return [];
    }

    visited.add(nodeId);
    const node = document.nodes.find((candidate) => candidate.id === nodeId);
    const blockData = node?.data.blockData;
    if (!node || !blockData) {
      return [];
    }

    const graph = buildGraph(document.edges);
    const prefix = '    '.repeat(indent);
    const outgoing = graph.get(nodeId) || [];

    if (blockData.type === 'if') {
      const trueTarget = outgoing.find((edge) => edge.handle === 'true')?.target;
      const falseTarget = outgoing.find((edge) => edge.handle === 'false')?.target;
      const mergeNode = findCommonMergeNode([trueTarget, falseTarget], graph);
      const branchPrefix = '    '.repeat(indent + 1);
      const lines = [`${prefix}IF    ${sanitizeString(blockData.condition)}`];
      const trueLines = generateNode(diagramId, trueTarget, indent + 1, mergeNode, visited);
      lines.push(...(trueLines.length > 0 ? trueLines : [`${branchPrefix}No Operation`]));
      if (falseTarget) {
        lines.push(`${prefix}ELSE`);
        const falseLines = generateNode(diagramId, falseTarget, indent + 1, mergeNode, visited);
        lines.push(...(falseLines.length > 0 ? falseLines : [`${branchPrefix}No Operation`]));
      }
      lines.push(`${prefix}END`);
      if (mergeNode && mergeNode !== stopNode) {
        lines.push(...generateNode(diagramId, mergeNode, indent, stopNode, visited));
      }
      return lines;
    }

    if (blockData.type === 'switch') {
      const handleMap = new Map(outgoing.map((edge) => [edge.handle || '', edge.target]));
      const mergeNode = findCommonMergeNode(
        [...blockData.cases.map((switchCase) => handleMap.get(switchCase.id)), handleMap.get('default')],
        graph
      );
      const lines: string[] = [];
      const branchPrefix = '    '.repeat(indent + 1);
      blockData.cases.forEach((switchCase, index) => {
        const header = index === 0 ? 'IF' : 'ELSE IF';
        lines.push(`${prefix}${header}    ${formatSwitchCondition(blockData.expression, switchCase.value)}`);
        const caseLines = generateNode(diagramId, handleMap.get(switchCase.id), indent + 1, mergeNode, visited);
        lines.push(...(caseLines.length > 0 ? caseLines : [`${branchPrefix}No Operation`]));
      });
      const defaultTarget = handleMap.get('default');
      if (defaultTarget) {
        lines.push(`${prefix}ELSE`);
        const defaultLines = generateNode(diagramId, defaultTarget, indent + 1, mergeNode, visited);
        lines.push(...(defaultLines.length > 0 ? defaultLines : [`${branchPrefix}No Operation`]));
      }
      lines.push(`${prefix}END`);
      if (mergeNode && mergeNode !== stopNode) {
        lines.push(...generateNode(diagramId, mergeNode, indent, stopNode, visited));
      }
      return lines;
    }

    if (blockData.type === 'try-catch') {
      const handleMap = new Map(outgoing.map((edge) => [edge.handle || '', edge.target]));
      const tryTarget = handleMap.get('output');
      const errorTarget = handleMap.get('error');
      const finallyTarget = handleMap.get('finally');
      const mergeNode = findCommonMergeNode([tryTarget, errorTarget, finallyTarget], graph);
      const branchPrefix = '    '.repeat(indent + 1);
      const lines = [`${prefix}TRY`];
      const tryLines = generateNode(diagramId, tryTarget, indent + 1, mergeNode, visited);
      lines.push(...(tryLines.length > 0 ? tryLines : [`${branchPrefix}No Operation`]));
      if (errorTarget || (blockData.exceptBlocks || []).length > 0) {
        const exceptBlock = blockData.exceptBlocks?.[0];
        const exceptionType = exceptBlock?.exceptionType || '*';
        const variable = exceptBlock?.variable
          ? normalizeVariableName(exceptBlock.variable)
          : '';
        lines.push(
          variable
            ? `${prefix}EXCEPT    ${exceptionType}    AS    ${variable}`
            : `${prefix}EXCEPT    ${exceptionType}`
        );
        const errorLines = generateNode(diagramId, errorTarget, indent + 1, mergeNode, visited);
        lines.push(...(errorLines.length > 0 ? errorLines : [`${branchPrefix}No Operation`]));
      }
      if (finallyTarget || blockData.finallyBlock !== undefined) {
        lines.push(`${prefix}FINALLY`);
        const finallyLines = generateNode(diagramId, finallyTarget, indent + 1, mergeNode, visited);
        lines.push(...(finallyLines.length > 0 ? finallyLines : [`${branchPrefix}No Operation`]));
      }
      lines.push(`${prefix}END`);
      if (mergeNode && mergeNode !== stopNode) {
        lines.push(...generateNode(diagramId, mergeNode, indent, stopNode, visited));
      }
      return lines;
    }

    const lines: string[] = [];
    switch (blockData.type) {
      case 'start':
        break;
      case 'end':
        lines.push(`${prefix}# End`);
        break;
      case 'while': {
        const bodyTarget = outgoing.find((edge) => edge.handle === 'body' || edge.handle === 'output')?.target;
        const nextTarget = outgoing.find((edge) => edge.handle === 'next')?.target;
        const branchPrefix = '    '.repeat(indent + 1);
        lines.push(`${prefix}WHILE    ${sanitizeString(blockData.condition)}    limit=${blockData.maxIterations || 100}`);
        const bodyLines = generateNode(diagramId, bodyTarget, indent + 1, nextTarget, visited);
        lines.push(...(bodyLines.length > 0 ? bodyLines : [`${branchPrefix}No Operation`]));
        lines.push(`${prefix}END`);
        if (nextTarget && nextTarget !== stopNode) {
          lines.push(...generateNode(diagramId, nextTarget, indent, stopNode, visited));
        }
        return lines;
      }
      case 'for-each': {
        const bodyTarget = outgoing.find((edge) => edge.handle === 'body' || edge.handle === 'output')?.target;
        const nextTarget = outgoing.find((edge) => edge.handle === 'next')?.target;
        const branchPrefix = '    '.repeat(indent + 1);
        lines.push(`${prefix}FOR    ${sanitizeString(blockData.itemVariable)}    IN    ${sanitizeString(blockData.collection)}`);
        const bodyLines = generateNode(diagramId, bodyTarget, indent + 1, nextTarget, visited);
        lines.push(...(bodyLines.length > 0 ? bodyLines : [`${branchPrefix}No Operation`]));
        lines.push(`${prefix}END`);
        if (nextTarget && nextTarget !== stopNode) {
          lines.push(...generateNode(diagramId, nextTarget, indent, stopNode, visited));
        }
        return lines;
      }
      case 'throw':
        lines.push(`${prefix}Fail    ${sanitizeString(blockData.message || 'Error occurred')}`);
        break;
      case 'assign': {
        const variableName = normalizeVariableName(blockData.variableName || 'result');
        variables.set(variableName, sanitizeString(blockData.expression || ''));
        lines.push(`${prefix}${variableName}=    Set Variable    ${sanitizeString(blockData.expression || '')}`);
        break;
      }
      case 'activity': {
        const keyword = getActivityKeyword(blockData as unknown as Record<string, unknown>);
        const library = String(blockData.library || 'BuiltIn');
        if (library && library !== 'BuiltIn') {
          libraries.add(library.startsWith('RPAForge.') ? library : `RPAForge.${library}`);
        }
        const args = Object.values(node.data.activityValues || blockData.params || {})
          .map((arg) => sanitizeString(String(arg)));
        lines.push(args.length > 0 ? `${prefix}${keyword}    ${args.join('    ')}` : `${prefix}${keyword}`);
        break;
      }
      case 'sub-diagram-call':
        lines.push(buildSubDiagramCallLine(blockData, metadataById, prefix));
        break;
      default:
        lines.push(`${prefix}# ${blockData.type} block`);
    }

    for (const edge of outgoing) {
      lines.push(...generateNode(diagramId, edge.target, indent, stopNode, visited));
    }

    return lines;
  };

  const settingsLines = () => ['*** Settings ***', ...[...libraries].sort().map((library) => `Library    ${library}`)];
  const variableLines = () => {
    if (variables.size === 0) {
      return [];
    }
    return [
      '*** Variables ***',
      ...[...variables.entries()].map(([name, value]) => `${name}    ${value}`),
    ];
  };

  const keywordLinesForDiagram = (diagramId: string): string[] => {
    const document = documents[diagramId];
    const diagramMeta = metadataById[diagramId];
    if (!document || !diagramMeta) {
      return [];
    }

    const startNode = findStartNode(document.nodes);
    if (!startNode) {
      return [];
    }

    const lines = [sanitizeString(diagramMeta.name)];
    if (diagramMeta.inputs?.length) {
      lines.push(
        `    [Arguments]    ${diagramMeta.inputs.map((name) => normalizeVariableName(name)).join('    ')}`
      );
    }
    for (const outputName of diagramMeta.outputs || []) {
      lines.push(`    ${normalizeVariableName(outputName)}=    Set Variable    \${NONE}`);
    }
    const bodyStartTargets = buildGraph(document.edges).get(startNode.id) || [];
    const visited = new Set<string>();
    for (const edge of bodyStartTargets) {
      lines.push(...generateNode(diagramId, edge.target, 1, undefined, visited));
    }
    if ((diagramMeta.outputs || []).length > 0) {
      lines.push(
        `    RETURN    ${(diagramMeta.outputs || []).map((name) => normalizeVariableName(name)).join('    ')}`
      );
    }
    return lines;
  };

  const taskLines = (): string[] => {
    if (activeMeta.type === 'main') {
      const startNode = findStartNode(documents[activeDiagramId].nodes);
      if (!startNode) {
        return ['*** Tasks ***', 'Empty Process', '    No Operation'];
      }
      const lines = ['*** Tasks ***', sanitizeString(activeMeta.name)];
      const visited = new Set<string>();
      for (const edge of buildGraph(documents[activeDiagramId].edges).get(startNode.id) || []) {
        lines.push(...generateNode(activeDiagramId, edge.target, 1, undefined, visited));
      }
      return lines;
    }

    for (const inputName of activeMeta.inputs || []) {
      variables.set(normalizeVariableName(inputName), '');
    }
    return [
      '*** Tasks ***',
      `Preview ${sanitizeString(activeMeta.name)}`,
      buildSubDiagramCallLine(
        {
          id: `preview-${activeDiagramId}`,
          type: 'sub-diagram-call',
          name: activeMeta.name,
          label: activeMeta.name,
          category: 'sub-diagram',
          diagramId: activeDiagramId,
          diagramName: activeMeta.name,
          parameters: Object.fromEntries(
            (activeMeta.inputs || []).map((inputName) => [inputName, normalizeVariableName(inputName)])
          ),
          returns: {},
        },
        metadataById,
        '    '
      ),
    ];
  };

  const nestedKeywordIds =
    activeMeta.type === 'main'
      ? reachableDiagrams.filter((diagramId) => diagramId !== activeDiagramId)
      : reachableDiagrams;

  const resolvedTaskLines = taskLines();
  const resolvedKeywordLines =
    nestedKeywordIds.length > 0
      ? [
          '*** Keywords ***',
          ...nestedKeywordIds.flatMap((diagramId) => [
            ...keywordLinesForDiagram(diagramId),
            '',
          ]),
        ]
      : [];

  while (resolvedKeywordLines.at(-1) === '') {
    resolvedKeywordLines.pop();
  }

  const lines = [
    ...settingsLines(),
    '',
    ...variableLines(),
    ...(variables.size > 0 ? [''] : []),
    ...resolvedTaskLines,
  ];

  if (resolvedKeywordLines.length > 0) {
    lines.push('', ...resolvedKeywordLines);
  }

  lines.push('');
  return lines.join('\n');
}

function generateSingleDiagramCode(diagram: ClientCodegenDiagram): string {
  return generateRobotFile(
    diagram.metadata?.id || 'active-diagram',
    {
      id: diagram.metadata?.id || 'active-diagram',
      name: diagram.metadata?.name || 'Main Process',
      type: 'main',
      path: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      [diagram.metadata?.id || 'active-diagram']: createSingleDocument(diagram),
    },
    {}
  );
}

export function generateClientRobotCode(diagram: ClientCodegenDiagram): string {
  const projectContext = createProjectContext(diagram);
  if (projectContext) {
    return generateRobotFile(
      projectContext.activeDiagramId,
      projectContext.activeMeta,
      projectContext.documents,
      projectContext.metadataById
    );
  }

  return generateSingleDiagramCode(diagram);
}
