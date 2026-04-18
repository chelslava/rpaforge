import type { ActivityParam, ActivityParamType } from '../../../../types/engine';
import type { FilePickerMode } from '../../FilePicker';

export const multilineParamTypes: ActivityParamType[] = ['code', 'dict', 'expression', 'list'];

export const PATH_PARAM_PATTERNS: Array<{ pattern: RegExp; mode: FilePickerMode }> = [
  { pattern: /path$/i, mode: 'file' },
  { pattern: /file$/i, mode: 'file' },
  { pattern: /filepath$/i, mode: 'file' },
  { pattern: /directory$/i, mode: 'folder' },
  { pattern: /folder$/i, mode: 'folder' },
  { pattern: /dir$/i, mode: 'folder' },
  { pattern: /outputpath$/i, mode: 'save' },
  { pattern: /savepath$/i, mode: 'save' },
  { pattern: /destination$/i, mode: 'file' },
  { pattern: /source$/i, mode: 'file' },
];

export const FILE_FILTERS: Record<string, Array<{ name: string; extensions: string[] }>> = {
  excel: [{ name: 'Excel Files', extensions: ['xlsx', 'xls', 'xlsm', 'csv'] }],
  text: [{ name: 'Text Files', extensions: ['txt', 'log', 'json', 'xml', 'yaml', 'yml'] }],
  python: [{ name: 'Python Files', extensions: ['py', 'pyw'] }],
  image: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg'] }],
  all: [{ name: 'All Files', extensions: ['*'] }],
};

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return String(value);
}

export function isPathParam(param: ActivityParam): FilePickerMode | null {
  const paramName = param.name.toLowerCase();
  for (const { pattern, mode } of PATH_PARAM_PATTERNS) {
    if (pattern.test(paramName)) {
      return mode;
    }
  }
  return null;
}

export function getFileFilters(
  param: ActivityParam,
  activityLibrary?: string
): Array<{ name: string; extensions: string[] }> | undefined {
  const library = activityLibrary?.toLowerCase() || '';
  if (library.includes('excel')) {
    return FILE_FILTERS.excel;
  }
  if (param.name.toLowerCase().includes('image') || param.name.toLowerCase().includes('screenshot')) {
    return FILE_FILTERS.image;
  }
  return undefined;
}

export const generateNestedId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
