const LIBRARY_NAMESPACE_MAP: Record<string, string> = {
  BuiltIn: 'builtin',
  DesktopUI: 'desktopui',
  WebUI: 'webui',
  Excel: 'excel',
  File: 'file',
  String: 'string',
  DateTime: 'datetime',
  Variables: 'variables',
  Flow: 'flow',
  Database: 'database',
  OCR: 'ocr',
  Credentials: 'credentials',
  HTTP: 'http',
  DataFrames: 'dataframes',
};

export function getLibraryNamespace(library: string): string {
  return LIBRARY_NAMESPACE_MAP[library] ?? library.toLowerCase();
}

export function getActivityKey(activityId: string): string {
  const parts = activityId.split('.');
  return parts[parts.length - 1];
}
