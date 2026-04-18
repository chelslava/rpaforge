import type { Edge, Node } from '@reactflow/core';
import type { SwitchBlockData } from '../../types/blocks';
import {
  buildGraph,
  findCommonMergeNode,
  findStartNode,
} from '../diagram';
import { getActivityKeyword } from './utils';

function sanitizeString(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function hasExecutableLines(lines: string[]): boolean {
  const nonCommentLines = lines.filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  });
  return nonCommentLines.length > 0;
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
      return 'Parallel graph semantics are not supported in code generation.';
    }

    if (blockData.type === 'switch') {
      const switchData = blockData as SwitchBlockData;
      const expected = new Set([...(switchData.cases || []).map((c: { id: string }) => c.id), 'default']);
      const handles = outgoing.map((edge) => edge.handle || '');
      if (new Set(handles).size !== handles.length) {
        return 'Switch blocks must have at most one edge per case/default handle.';
      }
      if (handles.some((handle) => !expected.has(handle))) {
        return 'Switch blocks may only use configured case handles plus default.';
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
    }
  }

  return null;
}

export function generatePythonCode(diagram: CodegenDiagram): string {
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
  const libraries = new Set<string>();
  const lines: string[] = ['"""Auto-generated RPAForge process."""', ''];

  const rawName = (startNode.data.blockData as { processName?: string } | undefined)?.processName;
  const processName = typeof rawName === 'string'
    ? rawName.replace(/[\uD800-\uDFFF]/g, '')
    : 'Main Process';
  
  const safeProcessName = sanitizeIdentifier(processName);

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
      const condition = sanitizeString(blockData.condition || 'True');
      const branchLines: string[] = [`${prefix}if ${condition}:`];

      const trueLines = generateNode(trueTarget, indent + 1, mergeNode);
      branchLines.push(...(hasExecutableLines(trueLines) ? trueLines : [`${branchPrefix}pass`]));

      if (falseTarget) {
        const falseLines = generateNode(falseTarget, indent + 1, mergeNode);
        if (hasExecutableLines(falseLines)) {
          branchLines.push(`${prefix}else:`);

          branchLines.push(...falseLines);
        }
      }
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
        const header = index === 0 ? 'if' : 'elif';
        const condition = formatSwitchCondition(switchData.expression, switchCase.value);
        switchLines.push(`${prefix}${header} ${condition}:`);

        const caseLines = generateNode(handleMap.get(switchCase.id), indent + 1, mergeNode);
        switchLines.push(...(hasExecutableLines(caseLines) ? caseLines : [`${branchPrefix}pass`]));
      });
      
      const defaultTarget = handleMap.get('default');
      if (defaultTarget) {
        const defaultLines = generateNode(defaultTarget, indent + 1, mergeNode);
        if (hasExecutableLines(defaultLines)) {
          switchLines.push(`${prefix}else:`);

          switchLines.push(...defaultLines);
        }
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
      const tryCatchLines: string[] = [`${prefix}try:`];

      const tryLines = generateNode(tryTarget, indent + 1, mergeNode);
      tryCatchLines.push(...(hasExecutableLines(tryLines) ? tryLines : [`${branchPrefix}pass`]));

      const validExceptions: Record<string, string> = {
        Exception: 'Exception',
        ValueError: 'ValueError',
        TypeError: 'TypeError',
        RuntimeError: 'RuntimeError',
        KeyError: 'KeyError',
        IndexError: 'IndexError',
        AttributeError: 'AttributeError',
        ImportError: 'ImportError',
        OSError: 'OSError',
        TimeoutError: 'TimeoutError',
        StopIteration: 'StopIteration',
        FileNotFoundError: 'FileNotFoundError',
        PermissionError: 'PermissionError',
        ConnectionError: 'ConnectionError',
      };

      const exceptBlocks = (blockData.exceptBlocks || []) as Array<{
        exceptionType?: string;
        variable?: string;
      }>;

      if (exceptBlocks.length > 0) {
        for (const exceptBlock of exceptBlocks) {
          const excType = exceptBlock.exceptionType || 'Exception';
          const varName = exceptBlock.variable || 'e';
          const excClass = validExceptions[excType] || 'Exception';
          tryCatchLines.push(`${prefix}except ${excClass} as ${varName}:`);
          tryCatchLines.push(`${branchPrefix}pass`);
        }
      } else if (errorTarget) {
        tryCatchLines.push(`${prefix}except Exception as e:`);

        const errorLines = generateNode(errorTarget, indent + 1, mergeNode);
        tryCatchLines.push(...(hasExecutableLines(errorLines) ? errorLines : [`${branchPrefix}pass`]));
      }

      if (finallyTarget || blockData.finallyBlock !== undefined) {
        tryCatchLines.push(`${prefix}finally:`);

        const finallyLines = generateNode(finallyTarget, indent + 1, mergeNode);
        tryCatchLines.push(...(hasExecutableLines(finallyLines) ? finallyLines : [`${branchPrefix}pass`]));
      }

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
        const condition = sanitizeString(whileData.condition || 'True');
        linesForNode.push(`${prefix}while ${condition}:`);

        
        if (bodyTarget) {
          const bodyLines = generateNode(bodyTarget, indent + 1, nextAfterLoop);
          linesForNode.push(...(hasExecutableLines(bodyLines) ? bodyLines : [`${bodyPrefix}pass`]));
        } else {
          linesForNode.push(`${bodyPrefix}pass`);
        }

        
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
        const itemVar = sanitizeString(forEachData.itemVariable || 'item');
        const collection = sanitizeString(forEachData.collection || 'items');
        linesForNode.push(`${prefix}for ${itemVar} in ${collection}:`);

        
        if (bodyTarget) {
          const bodyLines = generateNode(bodyTarget, indent + 1, nextAfterLoop);
          linesForNode.push(...(hasExecutableLines(bodyLines) ? bodyLines : [`${bodyPrefix}pass`]));
        } else {
          linesForNode.push(`${bodyPrefix}pass`);
        }

        
        if (nextAfterLoop && nextAfterLoop !== stopNode) {
          linesForNode.push(...generateNode(nextAfterLoop, indent, stopNode));
        }
        return linesForNode;
      }
      case 'throw': {
        const throwData = blockData as { message?: string; exceptionType?: string };
        const message = sanitizeString(throwData.message || 'Error occurred');
        const validExceptions: Record<string, string> = {
          Exception: 'Exception',
          ValueError: 'ValueError',
          TypeError: 'TypeError',
          RuntimeError: 'RuntimeError',
          KeyError: 'KeyError',
          IndexError: 'IndexError',
          AttributeError: 'AttributeError',
          ImportError: 'ImportError',
          OSError: 'OSError',
          TimeoutError: 'TimeoutError',
          StopIteration: 'StopIteration',
          FileNotFoundError: 'FileNotFoundError',
          PermissionError: 'PermissionError',
          ConnectionError: 'ConnectionError',
        };
        const excClass = validExceptions[throwData.exceptionType || 'Exception'] || 'Exception';
        linesForNode.push(`${prefix}raise ${excClass}("${message}")`);

        break;
      }
      case 'assign': {
        const variableName = sanitizeString(blockData.variableName || 'result');
        const expression = sanitizeString(blockData.expression || '');
        linesForNode.push(`${prefix}${variableName} = ${expression}`);

        break;
      }
      case 'activity': {
        const library = String(blockData.library || 'BuiltIn');
        const activityName = getActivityKeyword(blockData as unknown as Record<string, unknown>);
        const method = activityName.toLowerCase().replace(/\s+/g, '_');
        
        if (library && library !== 'BuiltIn') {
          const modulePath = library.startsWith('rpaforge_libraries.')
            ? library
            : library.startsWith('RPAForge.')
              ? `rpaforge_libraries.${library.slice(9)}`
              : `rpaforge_libraries.${library}`;
          libraries.add(modulePath);
        }
        
        const activityParams = (node.data.activity as { params?: Array<{ name: string }> } | undefined)?.params;
        const activityValues = node.data.activityValues || blockData.params || {};
        
        let argsStr = '';
        if (activityParams && activityParams.length > 0) {
          const args = activityParams.map((param) => reprValue(activityValues[param.name]));
          argsStr = args.join(', ');
        } else {
          const args = Object.values(activityValues).map((arg) => reprValue(arg));
          argsStr = args.length > 0 ? args.join(', ') : '';
        }
        
        linesForNode.push(argsStr 
          ? `${prefix}${library.toLowerCase()}.${method}(${argsStr})`
          : `${prefix}${library.toLowerCase()}.${method}()`);

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

  const libs = Array.from(libraries).sort();
  if (libs.length > 0) {
    for (const lib of libs) {
      lines.push(`from ${lib} import *`);
    }
    lines.push('');
  }

  lines.push(`def ${safeProcessName}():`);


  for (const edge of graph.get(startNode.id) || []) {
    const bodyLines = generateNode(edge.target, 1);
    if (bodyLines.length === 0) {
      lines.push('    pass');
    } else {
      lines.push(...bodyLines);
    }
  }

  lines.push('');
  lines.push('');
  lines.push('if __name__ == "__main__":');
  lines.push(`    ${safeProcessName}()`);
  lines.push('');

  return lines.join('\n');
}

function formatSwitchCondition(expression: string, value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return expression;
  }

  if (
    normalizedValue.startsWith('${') ||
    normalizedValue.startsWith('@{') ||
    normalizedValue.startsWith('&{') ||
    normalizedValue.startsWith('%{')
  ) {
    return `${expression} == ${normalizedValue}`;
  }

  if (normalizedValue.replace('.', '').match(/^\d+$/)) {
    return `${expression} == ${normalizedValue}`;
  }

  const escapedValue = normalizedValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `${expression} == '${escapedValue}'`;
}

function reprValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'None';
  }
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'True') {
      return 'True';
    }
    if (trimmed === 'false' || trimmed === 'False') {
      return 'False';
    }
    if (trimmed.startsWith('${') || trimmed.startsWith('@{') || trimmed.startsWith('&{')) {
      return trimmed;
    }
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sanitizeIdentifier(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (sanitized && sanitized[0].match(/\d/)) {
    return `_${sanitized}`;
  }
  return sanitized || 'process';
}

export const generateRobotCode = generatePythonCode;
