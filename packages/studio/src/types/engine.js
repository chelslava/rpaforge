/**
 * RPAForge Engine Types
 *
 * Types and normalization helpers for the Python bridge contract.
 */
const DEFAULT_BUILTIN_SETTINGS = {
    timeout_ms: 30000,
    has_retry: false,
    has_continue_on_error: false,
};
function normalizeActivityParam(param) {
    return {
        name: param.name || '',
        type: (param.type || 'string'),
        label: param.label || param.name || '',
        description: param.description || '',
        required: param.required ?? true,
        default: param.default,
        options: param.options || [],
        variadic: param.variadic ?? false,
    };
}
export function normalizeLibraryName(rawLibrary) {
    if (!rawLibrary)
        return 'BuiltIn';
    return rawLibrary.replace(/^RPAForge\./, '').replace(/^rpaforge_libraries\./, '');
}
export function normalizeActivity(payload) {
    return {
        id: payload.id || `${payload.library}.${payload.name}`.replace(/\s+/g, '_').toLowerCase(),
        name: payload.name,
        library: normalizeLibraryName(payload.library),
        type: payload.type || 'sync',
        category: payload.category || 'Other',
        description: payload.description || '',
        tags: payload.tags || [],
        timeout_ms: payload.timeout_ms ?? DEFAULT_BUILTIN_SETTINGS.timeout_ms,
        has_retry: payload.has_retry ?? DEFAULT_BUILTIN_SETTINGS.has_retry,
        has_continue_on_error: payload.has_continue_on_error ?? DEFAULT_BUILTIN_SETTINGS.has_continue_on_error,
        params: (payload.params || []).map(normalizeActivityParam),
        has_output: payload.has_output ?? false,
        output_description: payload.output_description ?? '',
    };
}
export function normalizeActivitiesResult(payload) {
    const rawActivities = Array.isArray(payload)
        ? payload
        : typeof payload === 'object' && payload !== null && 'activities' in payload
            ? payload.activities || []
            : [];
    const activities = rawActivities
        .filter((item) => typeof item === 'object' && item !== null)
        .map(normalizeActivity);
    return {
        activities,
    };
}
export function createFallbackActivities() {
    return normalizeActivitiesResult({
        activities: [
            {
                id: 'builtin.log',
                name: 'Log',
                library: 'BuiltIn',
                type: 'sync',
                category: 'BuiltIn',
                description: 'Log a message to the console.',
                tags: ['logging', 'debug'],
                timeout_ms: 30000,
                has_retry: false,
                has_continue_on_error: true,
                params: [
                    {
                        name: 'message',
                        type: 'string',
                        label: 'Message',
                        description: 'Message to write to the log.',
                        required: true,
                        options: [],
                    },
                ],
            },
            {
                id: 'builtin.set_variable',
                name: 'Set Variable',
                library: 'BuiltIn',
                type: 'sync',
                category: 'BuiltIn',
                description: 'Assign a value to a variable.',
                tags: ['variables'],
                timeout_ms: 30000,
                has_retry: false,
                has_continue_on_error: false,
                params: [
                    {
                        name: 'variable',
                        type: 'variable',
                        label: 'Variable',
                        description: 'Variable name to set.',
                        required: true,
                        options: [],
                    },
                    {
                        name: 'value',
                        type: 'string',
                        label: 'Value',
                        description: 'Value to assign.',
                        required: true,
                        options: [],
                    },
                ],
            },
        ],
    }).activities;
}
export function createActivityParamValues(activity) {
    return activity.params.reduce((acc, param) => {
        if (param.variadic) {
            acc[param.name] = [''];
            return acc;
        }
        if (param.default !== undefined && param.default !== null) {
            acc[param.name] = param.default;
            return acc;
        }
        if (param.type === 'boolean') {
            acc[param.name] = false;
            return acc;
        }
        if (param.type === 'integer' || param.type === 'float') {
            acc[param.name] = 0;
            return acc;
        }
        acc[param.name] = '';
        return acc;
    }, {});
}
export function getActivityDefaultValues(activity) {
    return createActivityParamValues(activity);
}
export function getActivityDisplayLibrary(activity) {
    return normalizeLibraryName(activity.library);
}
