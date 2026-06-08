/**
 * RPA Activity Types
 *
 * Type definitions and runtime functions for RPA activities.
 */

export type ActivityType =
  | 'sync'
  | 'condition'
  | 'loop'
  | 'container'
  | 'async'
  | 'error_handler'
  | 'code'
  | 'sub_diagram';

export type ActivityParamType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'variable'
  | 'expression'
  | 'secret'
  | 'code'
  | 'list'
  | 'dict'
  | 'dataframe';

export interface ActivityParam {
  name: string;
  type: ActivityParamType;
  label: string;
  description: string;
  required: boolean;
  default?: unknown;
  options: string[];
  variadic?: boolean;
}

export interface ActivityBuiltinSettings {
  timeout_ms: number;
  has_retry: boolean;
  has_continue_on_error: boolean;
}

export interface ActivityBridgePayload {
  id?: string;
  name: string;
  library: string;
  type?: string;
  category: string;
  description: string;
  tags?: string[];
  timeout_ms?: number;
  has_retry?: boolean;
  has_continue_on_error?: boolean;
  params?: ActivityParam[];
}

export interface Activity {
  id: string;
  name: string;
  library: string;
  type: ActivityType;
  category: string;
  description: string;
  tags: string[];
  timeout_ms: number;
  has_retry: boolean;
  has_continue_on_error: boolean;
  params: ActivityParam[];
  has_output: boolean;
  output_description: string;
}

export const DEFAULT_BUILTIN_SETTINGS: ActivityBuiltinSettings = {
  timeout_ms: 30000,
  has_retry: false,
  has_continue_on_error: false,
};

function normalizeActivityParam(param: Partial<ActivityParam>): ActivityParam {
  return {
    name: param.name || '',
    type: (param.type || 'string') as ActivityParamType,
    label: param.label || param.name || '',
    description: param.description || '',
    required: param.required ?? true,
    default: param.default,
    options: param.options || [],
    variadic: param.variadic ?? false,
  };
}

export function normalizeLibraryName(rawLibrary: string): string {
  if (!rawLibrary) return 'BuiltIn';
  return rawLibrary.replace(/^RPAForge\./, '').replace(/^rpaforge_libraries\./, '');
}

export function normalizeActivity(payload: ActivityBridgePayload): Activity {
  return {
    id: payload.id || `${payload.library}.${payload.name}`.replace(/\s+/g, '_').toLowerCase(),
    name: payload.name,
    library: normalizeLibraryName(payload.library),
    type: (payload.type as ActivityType) || 'sync',
    category: payload.category || 'Other',
    description: payload.description || '',
    tags: payload.tags || [],
    timeout_ms: payload.timeout_ms ?? DEFAULT_BUILTIN_SETTINGS.timeout_ms,
    has_retry: payload.has_retry ?? DEFAULT_BUILTIN_SETTINGS.has_retry,
    has_continue_on_error: payload.has_continue_on_error ?? DEFAULT_BUILTIN_SETTINGS.has_continue_on_error,
    params: (payload.params || []).map(normalizeActivityParam),
    has_output: (payload as { has_output?: boolean }).has_output ?? false,
    output_description: (payload as { output_description?: string }).output_description ?? '',
  };
}
