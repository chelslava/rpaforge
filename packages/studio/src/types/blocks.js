import { getActivityDefaultValues, getActivityDisplayLibrary } from './engine';
export const BLOCK_PORT_CONFIGS = {
    start: {
        inputs: [],
        outputs: [{ id: 'output', type: 'output', position: 'bottom' }],
    },
    end: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [],
    },
    if: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [
            { id: 'true', type: 'true', label: 'True', position: 'bottom' },
            { id: 'false', type: 'false', label: 'False', position: 'bottom' },
        ],
    },
    switch: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [{ id: 'default', type: 'output', label: 'Default', position: 'bottom' }],
    },
    while: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [
            { id: 'body', type: 'output', label: 'Body', position: 'bottom' },
            { id: 'next', type: 'output', label: 'Next', position: 'bottom' },
        ],
    },
    'for-each': {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [
            { id: 'body', type: 'output', label: 'Body', position: 'bottom' },
            { id: 'next', type: 'output', label: 'Next', position: 'bottom' },
        ],
    },
    parallel: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [
            { id: 'branch-1', type: 'branch', label: 'Branch 1', position: 'bottom' },
            { id: 'branch-2', type: 'branch', label: 'Branch 2', position: 'bottom' },
        ],
    },
    'retry-scope': {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [{ id: 'output', type: 'output', position: 'bottom' }],
    },
    'try-catch': {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [
            { id: 'output', type: 'output', label: 'Success', position: 'bottom' },
            { id: 'error', type: 'error', label: 'Error', position: 'bottom' },
        ],
    },
    throw: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [],
    },
    assign: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [{ id: 'output', type: 'output', position: 'bottom' }],
    },
    activity: {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [{ id: 'output', type: 'output', position: 'bottom' }],
    },
    'sub-diagram-call': {
        inputs: [{ id: 'input', type: 'input', position: 'top' }],
        outputs: [{ id: 'output', type: 'output', position: 'bottom' }],
    },
};
export const BLOCK_COLORS = {
    'flow-control': {
        primary: 'var(--color-block-flow-control)',
        hover: 'var(--color-block-flow-control-hover)',
        border: 'var(--color-block-flow-control-border)',
    },
    'error-handling': {
        primary: 'var(--color-block-error-handling)',
        hover: 'var(--color-block-error-handling-hover)',
        border: 'var(--color-block-error-handling-border)',
    },
    variables: {
        primary: 'var(--color-block-variables)',
        hover: 'var(--color-block-variables-hover)',
        border: 'var(--color-block-variables-border)',
    },
    'web-automation': {
        primary: 'var(--color-block-web-automation)',
        hover: 'var(--color-block-web-automation-hover)',
        border: 'var(--color-block-web-automation-border)',
    },
    'desktop-automation': {
        primary: 'var(--color-block-desktop-automation)',
        hover: 'var(--color-block-desktop-automation-hover)',
        border: 'var(--color-block-desktop-automation-border)',
    },
    'data-operations': {
        primary: 'var(--color-block-data-operations)',
        hover: 'var(--color-block-data-operations-hover)',
        border: 'var(--color-block-data-operations-border)',
    },
    ocr: {
        primary: 'var(--color-block-ocr)',
        hover: 'var(--color-block-ocr-hover)',
        border: 'var(--color-block-ocr-border)',
    },
    credentials: {
        primary: 'var(--color-block-credentials)',
        hover: 'var(--color-block-credentials-hover)',
        border: 'var(--color-block-credentials-border)',
    },
    'built-in': {
        primary: 'var(--color-block-built-in)',
        hover: 'var(--color-block-built-in-hover)',
        border: 'var(--color-block-built-in-border)',
    },
    'sub-diagram': {
        primary: 'var(--color-block-sub-diagram)',
        hover: 'var(--color-block-sub-diagram-hover)',
        border: 'var(--color-block-sub-diagram-border)',
    },
};
export const BLOCK_ICONS = {
    start: '▶',
    end: '■',
    if: '◆',
    switch: '⇄',
    while: '↻',
    'for-each': '⟳',
    parallel: '⋮⋮',
    'retry-scope': '↺',
    'try-catch': '⚠',
    throw: '⚡',
    assign: '📝',
    activity: '⚙',
    'sub-diagram-call': '📞',
};
// Category names with translation keys
export const BLOCK_CATEGORIES = {
    'flow-control': { nameKey: 'blocks.flow_control', icon: '🔀' },
    'error-handling': { nameKey: 'blocks.error_handling', icon: '⚠️' },
    variables: { nameKey: 'blocks.variables', icon: '📦' },
    'web-automation': { nameKey: 'blocks.web_automation', icon: '🌐' },
    'desktop-automation': { nameKey: 'blocks.desktop_automation', icon: '🖥️' },
    'data-operations': { nameKey: 'blocks.data_operations', icon: '💾' },
    ocr: { nameKey: 'blocks.ocr', icon: '👁️' },
    credentials: { nameKey: 'blocks.credentials', icon: '🔐' },
    'built-in': { nameKey: 'blocks.built_in', icon: '🧰' },
    'sub-diagram': { nameKey: 'blocks.sub_diagrams', icon: '📞' },
};
export const BLOCK_TYPE_TO_CATEGORY = {
    start: 'flow-control',
    end: 'flow-control',
    if: 'flow-control',
    switch: 'flow-control',
    while: 'flow-control',
    'for-each': 'flow-control',
    parallel: 'flow-control',
    'retry-scope': 'flow-control',
    'try-catch': 'error-handling',
    throw: 'error-handling',
    assign: 'variables',
    activity: 'web-automation',
    'sub-diagram-call': 'sub-diagram',
};
export const BLOCK_LABELS = {
    start: 'Start',
    end: 'End',
    if: 'If',
    switch: 'Switch',
    while: 'While Loop',
    'for-each': 'For Each',
    parallel: 'Parallel',
    'retry-scope': 'Retry Scope',
    'try-catch': 'Try Catch',
    throw: 'Throw',
    assign: 'Assign',
    activity: 'Activity',
    'sub-diagram-call': 'Call Sub-Diagram',
};
// Translation key names (for use with i18n in components)
export const BLOCK_LABEL_KEYS = {
    start: 'blocks.start',
    end: 'blocks.end',
    if: 'blocks.if',
    switch: 'blocks.switch',
    while: 'blocks.while',
    'for-each': 'blocks.forEach',
    parallel: 'blocks.parallel',
    'retry-scope': 'blocks.retryScope',
    'try-catch': 'blocks.tryCatch',
    throw: 'blocks.throw',
    assign: 'blocks.assign',
    activity: 'blocks.activity',
    'sub-diagram-call': 'blocks.callSubDiagram',
};
export const BLOCK_CATEGORY_KEYS = {
    'flow-control': 'blocks.flow_control',
    'error-handling': 'blocks.error_handling',
    variables: 'blocks.variables',
    'web-automation': 'blocks.web_automation',
    'desktop-automation': 'blocks.desktop_automation',
    'data-operations': 'blocks.data_operations',
    ocr: 'blocks.ocr',
    credentials: 'blocks.credentials',
    'built-in': 'blocks.built_in',
    'sub-diagram': 'blocks.sub_diagrams',
};
const SDK_CATEGORY_TO_BLOCK_CATEGORY = {
    builtin: 'built-in',
    credentials: 'credentials',
    data: 'data-operations',
    database: 'data-operations',
    desktop: 'desktop-automation',
    excel: 'data-operations',
    'error handling': 'error-handling',
    'flow control': 'flow-control',
    ocr: 'ocr',
    subdiagram: 'sub-diagram',
    'sub-diagram': 'sub-diagram',
    web: 'web-automation',
};
export function isStartBlock(block) {
    return block.type === 'start';
}
export function isEndBlock(block) {
    return block.type === 'end';
}
export function isIfBlock(block) {
    return block.type === 'if';
}
export function isWhileBlock(block) {
    return block.type === 'while';
}
export function isSwitchBlock(block) {
    return block.type === 'switch';
}
export function isForEachBlock(block) {
    return block.type === 'for-each';
}
export function isParallelBlock(block) {
    return block.type === 'parallel';
}
export function isRetryScopeBlock(block) {
    return block.type === 'retry-scope';
}
export function isTryCatchBlock(block) {
    return block.type === 'try-catch';
}
export function isThrowBlock(block) {
    return block.type === 'throw';
}
export function isAssignBlock(block) {
    return block.type === 'assign';
}
export function isActivityBlock(block) {
    return block.type === 'activity';
}
export function isSubDiagramCallBlock(block) {
    return block.type === 'sub-diagram-call';
}
export function getBlockCategoryKey(category) {
    if (!category) {
        return 'built-in';
    }
    const normalized = category.trim().toLowerCase();
    return SDK_CATEGORY_TO_BLOCK_CATEGORY[normalized] || 'built-in';
}
export function getBlockColors(category, type) {
    if (type === 'start') {
        return {
            primary: 'var(--color-block-start)',
            hover: 'var(--color-block-start-hover)',
            border: 'var(--color-block-start-border)',
        };
    }
    if (type === 'end') {
        return {
            primary: 'var(--color-block-end)',
            hover: 'var(--color-block-end-hover)',
            border: 'var(--color-block-end-border)',
        };
    }
    return BLOCK_COLORS[getBlockCategoryKey(category)];
}
export function getSwitchPortConfig(blockData) {
    const dynamicOutputs = blockData.cases.map((switchCase) => ({
        id: switchCase.id || `case-${switchCase.value || switchCase.label || 'default'}`,
        type: 'output',
        label: switchCase.label || switchCase.value || 'Case',
        position: 'bottom',
    }));
    return {
        inputs: BLOCK_PORT_CONFIGS.switch.inputs,
        outputs: dynamicOutputs.length > 0
            ? [
                ...dynamicOutputs,
                {
                    id: 'default',
                    type: 'output',
                    label: 'Default',
                    position: 'bottom',
                },
            ]
            : BLOCK_PORT_CONFIGS.switch.outputs,
    };
}
export function getParallelPortConfig(blockData) {
    const branches = blockData.branches.length > 0
        ? blockData.branches
        : [
            { id: 'branch-1', name: 'Branch 1', activities: [] },
            { id: 'branch-2', name: 'Branch 2', activities: [] },
        ];
    return {
        inputs: BLOCK_PORT_CONFIGS.parallel.inputs,
        outputs: branches.map((branch, index) => ({
            id: branch.id || `branch-${index + 1}`,
            type: 'branch',
            label: branch.name || `Branch ${index + 1}`,
            position: 'bottom',
        })),
    };
}
export function getTryCatchPortConfig(blockData) {
    const outputs = [
        {
            id: 'output',
            type: 'output',
            label: 'Success',
            position: 'bottom',
        },
    ];
    if (blockData.exceptBlocks.length > 0) {
        blockData.exceptBlocks.forEach((exceptBlock) => {
            outputs.push({
                id: exceptBlock.id,
                type: 'error',
                label: exceptBlock.exceptionType || 'Exception',
                position: 'bottom',
            });
        });
    }
    else {
        outputs.push({
            id: 'error',
            type: 'error',
            label: 'Except',
            position: 'bottom',
        });
    }
    if (blockData.finallyBlock) {
        outputs.push({
            id: 'finally',
            type: 'output',
            label: 'Finally',
            position: 'bottom',
        });
    }
    return {
        inputs: BLOCK_PORT_CONFIGS['try-catch'].inputs,
        outputs,
    };
}
export function createActivityBlockData(activity, id) {
    return {
        id,
        type: 'activity',
        name: activity.name,
        label: activity.name,
        category: activity.category,
        description: activity.description,
        activityId: activity.id,
        activityType: activity.type,
        icon: activity.library,
        library: getActivityDisplayLibrary(activity),
        params: getActivityDefaultValues(activity),
        paramTypes: Object.fromEntries(activity.params.map((param) => [param.name, param.type])),
        builtin: {
            timeout_ms: activity.timeout_ms,
            has_retry: activity.has_retry,
            has_continue_on_error: activity.has_continue_on_error,
        },
        tags: activity.tags,
    };
}
export function createDefaultBlockData(type, id) {
    const category = BLOCK_TYPE_TO_CATEGORY[type];
    const label = BLOCK_LABELS[type];
    const base = {
        id,
        type,
        name: label,
        label,
        category,
        description: undefined,
    };
    switch (type) {
        case 'start':
            return { ...base, type: 'start', processName: 'Main Process' };
        case 'end':
            return { ...base, type: 'end', status: 'PASS' };
        case 'if':
            return { ...base, type: 'if', condition: 'True' };
        case 'while':
            return { ...base, type: 'while', condition: 'True', maxIterations: 100 };
        case 'for-each':
            return {
                ...base,
                type: 'for-each',
                itemVariable: 'item',
                collection: 'items',
            };
        case 'parallel':
            return {
                ...base,
                type: 'parallel',
                branches: [
                    { id: 'branch-1', name: 'Branch 1', activities: [] },
                    { id: 'branch-2', name: 'Branch 2', activities: [] },
                ],
            };
        case 'retry-scope':
            return { ...base, type: 'retry-scope', retryCount: 3, retryInterval: '2s' };
        case 'try-catch':
            return { ...base, type: 'try-catch', exceptBlocks: [] };
        case 'throw':
            return { ...base, type: 'throw', message: '' };
        case 'switch':
            return { ...base, type: 'switch', expression: '', cases: [] };
        case 'assign':
            return {
                ...base,
                type: 'assign',
                variableName: '',
                variableType: 'string',
                expression: '',
                scope: 'task',
            };
        case 'activity':
            return {
                ...base,
                type: 'activity',
                activityId: '',
                activityType: 'sync',
                icon: '⚙',
                library: 'BuiltIn',
                params: {},
                paramTypes: {},
                builtin: {
                    timeout_ms: 30000,
                    has_retry: false,
                    has_continue_on_error: false,
                },
                tags: [],
            };
        case 'sub-diagram-call':
            return {
                ...base,
                type: 'sub-diagram-call',
                diagramId: '',
                diagramName: '',
                parameters: {},
                returns: {},
            };
        default:
            throw new Error(`Unknown block type: ${type}`);
    }
}
