import type { Edge, Node } from '@reactflow/core';
import type { SwitchBlockData, TryCatchBlockData } from '../../types/blocks';
import {
  buildGraph,
  findCommonMergeNode,
  findStartNode,
} from '../diagram';
import { getActivityKeyword, formatSwitchCondition } from './utils';

function sanitizeString(str: string): string {
  // Preserve valid Unicode characters including Cyrillic
  // Only remove truly invalid control characters that break Robot Framework
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

interface CodegenDiagram {
  nodes: Node[];
  edges: Edge[];
}

function validateDiagram(diagram: CodegenDiagram): string | null {
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
      const switchData = blockData as SwitchBlockData;
      const expected = new Set([...(switchData.cases || []).map((c: { id: string }) => c.id), 'default']);
      const handles = outgoing.map((edge) => edge.handle || '');
      if (new Set(handles).size !== handles.length) {
        return 'Switch blocks must have at most one edge per case/default handle.';
      }
      if (handles.some((handle) => !expected.has(handle))) {
        return 'Switch blocks may only use configured case handles plus default in browser fallback code generation.';
      }
    }

    if (blockData.type === 'try-catch') {
      const tryCatchData = blockData as TryCatchBlockData;
      const handles = outgoing.map((edge) => edge.handle || '');
      if (new Set(handles).size !== handles.length) {
        return 'Try/Catch blocks must have at most one output, error, and finally edge.';
      }
      if (handles.some((handle) => !['output', 'error', 'finally'].includes(handle))) {
        return 'Try/Catch blocks may only use output, error, and finally handles.';
      }
      if ((tryCatchData.exceptBlocks || []).length > 1) {
        return 'Try/Catch fallback code generation currently supports at most one EXCEPT handler.';
      }
    }
  }

  return null;
}

export function generateRobotCode(diagram: CodegenDiagram): string {
  const validationError = validateDiagram(diagram);
  if (validationError) {
    return `# ${validationError}`;
  }

  const { nodes, edges } = diagram;
  const startNode = findStartNode(nodes);
  if (!startNode) {
    return '# Code generation requires exactly one Start node. Current diagram has 0.';
  }

  const graph = buildGraph(edges);
  const libraries = new Set<string>(['BuiltIn']);
  const lines: string[] = ['*** Settings ***', 'Library    BuiltIn', '', '*** Tasks ***'];
      const rawName = (startNode.data.blockData as { processName?: string } | undefined)?.processName;
      const processName = typeof rawName === 'string'
        ? rawName.replace(/[\uD800-\uDFFF]/g, '')
        : 'Main Process';
      lines.push(processName);

  const visited = new Set<string>();

  const generateNode = (nodeId: string | undefined, indent = 1, stopNode?: string): string[] => {
    if (!nodeId || nodeId === stopNode || visited.has(nodeId)) {
      return [];
    }

    visited.add(nodeId);
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const blockData = node?.data.blockData;
    if (!node || !blockData) {
      return [];
    }

    const prefix = '    '.repeat(indent);
    const outgoing = graph.get(nodeId) || [];

    if (blockData.type === 'if') {
      const trueTarget = outgoing.find((edge) => edge.handle === 'true')?.target;
      const falseTarget = outgoing.find((edge) => edge.handle === 'false')?.target;
      const mergeNode = findCommonMergeNode([trueTarget, falseTarget], graph);
      const branchPrefix = '    '.repeat(indent + 1);
      const branchLines: string[] = [`${prefix}IF    ${sanitizeString(blockData.condition)}`];
      const trueLines = generateNode(trueTarget, indent + 1, mergeNode);
      branchLines.push(...(trueLines.length > 0 ? trueLines : [`${branchPrefix}No Operation`]));
      if (falseTarget) {
        branchLines.push(`${prefix}ELSE`);
        const falseLines = generateNode(falseTarget, indent + 1, mergeNode);
        branchLines.push(...(falseLines.length > 0 ? falseLines : [`${branchPrefix}No Operation`]));
      }
      branchLines.push(`${prefix}END`);
      if (mergeNode && mergeNode !== stopNode) {
        branchLines.push(...generateNode(mergeNode, indent, stopNode));
      }
      return branchLines;
    }

    if (blockData.type === 'switch') {
      const switchData = blockData as SwitchBlockData;
      const handleMap = new Map(outgoing.map((edge) => [edge.handle || '', edge.target]));
      const mergeNode = findCommonMergeNode(
        [...switchData.cases.map((c: { id: string }) => handleMap.get(c.id)), handleMap.get('default')],
        graph
      );
      const switchLines: string[] = [];
      const branchPrefix = '    '.repeat(indent + 1);
      switchData.cases.forEach((switchCase: { id: string; value: string }, index: number) => {
        const header = index === 0 ? 'IF' : 'ELSE IF';
        switchLines.push(`${prefix}${header}    ${formatSwitchCondition(switchData.expression, switchCase.value)}`);
        const caseLines = generateNode(handleMap.get(switchCase.id), indent + 1, mergeNode);
        switchLines.push(...(caseLines.length > 0 ? caseLines : [`${branchPrefix}No Operation`]));
      });
      const defaultTarget = handleMap.get('default');
      if (defaultTarget) {
        switchLines.push(`${prefix}ELSE`);
        const defaultLines = generateNode(defaultTarget, indent + 1, mergeNode);
        switchLines.push(...(defaultLines.length > 0 ? defaultLines : [`${branchPrefix}No Operation`]));
      }
      if (switchData.cases.length > 0) {
        switchLines.push(`${prefix}END`);
      }
      if (mergeNode && mergeNode !== stopNode) {
        switchLines.push(...generateNode(mergeNode, indent, stopNode));
      }
      return switchLines;
    }

    if (blockData.type === 'try-catch') {
      const handleMap = new Map(outgoing.map((edge) => [edge.handle || '', edge.target]));
      const tryTarget = handleMap.get('output');
      const errorTarget = handleMap.get('error');
      const finallyTarget = handleMap.get('finally');
      const mergeNode = findCommonMergeNode([tryTarget, errorTarget, finallyTarget], graph);
      const branchPrefix = '    '.repeat(indent + 1);
      const tryCatchLines: string[] = [`${prefix}TRY`];
      const tryLines = generateNode(tryTarget, indent + 1, mergeNode);
      tryCatchLines.push(...(tryLines.length > 0 ? tryLines : [`${branchPrefix}No Operation`]));
      if (errorTarget || (blockData.exceptBlocks || []).length > 0) {
        const exceptBlock = blockData.exceptBlocks?.[0];
        const exceptionType = exceptBlock?.exceptionType || '*';
        const variable = exceptBlock?.variable
          ? exceptBlock.variable.startsWith('${')
            ? exceptBlock.variable
            : '${' + exceptBlock.variable + '}'
          : '';
        tryCatchLines.push(
          variable
            ? `${prefix}EXCEPT    ${exceptionType}    AS    ${variable}`
            : `${prefix}EXCEPT    ${exceptionType}`
        );
        const errorLines = generateNode(errorTarget, indent + 1, mergeNode);
        tryCatchLines.push(...(errorLines.length > 0 ? errorLines : [`${branchPrefix}No Operation`]));
      }
      if (finallyTarget || blockData.finallyBlock !== undefined) {
        tryCatchLines.push(`${prefix}FINALLY`);
        const finallyLines = generateNode(finallyTarget, indent + 1, mergeNode);
        tryCatchLines.push(...(finallyLines.length > 0 ? finallyLines : [`${branchPrefix}No Operation`]));
      }
      tryCatchLines.push(`${prefix}END`);
      if (mergeNode && mergeNode !== stopNode) {
        tryCatchLines.push(...generateNode(mergeNode, indent, stopNode));
      }
      return tryCatchLines;
    }

    const linesForNode: string[] = [];
    switch (blockData.type) {
      case 'start':
        break;
      case 'end':
        linesForNode.push(`${prefix}# End`);
        break;
      case 'while': {
        const whileData = blockData as { condition: string; maxIterations?: number };
        const bodyTarget = outgoing.find((edge) => edge.handle === 'body' || edge.handle === 'output')?.target;
        const nextAfterLoop = outgoing.find((edge) => edge.handle === 'next')?.target;

        const bodyPrefix = '    '.repeat(indent + 1);
        linesForNode.push(`${prefix}WHILE    ${sanitizeString(whileData.condition)}    limit=${whileData.maxIterations || 100}`);
        
        if (bodyTarget) {
          const bodyLines = generateNode(bodyTarget, indent + 1, nextAfterLoop);
          linesForNode.push(...(bodyLines.length > 0 ? bodyLines : [`${bodyPrefix}No Operation`]));
        } else {
          linesForNode.push(`${bodyPrefix}No Operation`);
        }
        
        linesForNode.push(`${prefix}END`);
        
        if (nextAfterLoop && nextAfterLoop !== stopNode) {
          linesForNode.push(...generateNode(nextAfterLoop, indent, stopNode));
        }
        return linesForNode;
      }
      case 'for-each': {
        const forEachData = blockData as { itemVariable: string; collection: string };
        const bodyTarget = outgoing.find((edge) => edge.handle === 'body' || edge.handle === 'output')?.target;
        const nextAfterLoop = outgoing.find((edge) => edge.handle === 'next')?.target;

        const bodyPrefix = '    '.repeat(indent + 1);
        linesForNode.push(`${prefix}FOR    ${sanitizeString(forEachData.itemVariable)}    IN    ${sanitizeString(forEachData.collection)}`);
        
        if (bodyTarget) {
          const bodyLines = generateNode(bodyTarget, indent + 1, nextAfterLoop);
          linesForNode.push(...(bodyLines.length > 0 ? bodyLines : [`${bodyPrefix}No Operation`]));
        } else {
          linesForNode.push(`${bodyPrefix}No Operation`);
        }
        
        linesForNode.push(`${prefix}END`);
        
        if (nextAfterLoop && nextAfterLoop !== stopNode) {
          linesForNode.push(...generateNode(nextAfterLoop, indent, stopNode));
        }
        return linesForNode;
      }
      case 'throw':
        linesForNode.push(`${prefix}Fail    ${sanitizeString(blockData.message || 'Error occurred')}`);
        break;
      case 'assign': {
        const variableName = blockData.variableName?.startsWith('${')
          ? sanitizeString(blockData.variableName)
          : '${' + sanitizeString(blockData.variableName || 'result') + '}';
        linesForNode.push(`${prefix}Set Variable    ${variableName}    ${sanitizeString(blockData.expression || '')}`);
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
        linesForNode.push(args.length > 0 ? `${prefix}${keyword}    ${args.join('    ')}` : `${prefix}${keyword}`);
        break;
      }
      default:
        linesForNode.push(`${prefix}# ${blockData.type} block`);
    }

    for (const edge of outgoing) {
      linesForNode.push(...generateNode(edge.target, indent, stopNode));
    }

    return linesForNode;
  };

  for (const edge of graph.get(startNode.id) || []) {
    lines.push(...generateNode(edge.target, 1));
  }

  lines.push('');

  const rendered = lines.join('\n');
  const libraryLines = [...libraries]
    .sort()
    .map((library) => `Library    ${library}`)
    .join('\n');

  return rendered.replace('Library    BuiltIn', libraryLines);
}
