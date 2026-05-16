export type Namespace =
  | 'common'
  | 'errors'
  | 'blocks'
  | 'builtin'
  | 'desktopui'
  | 'webui'
  | 'excel'
  | 'database'
  | 'ocr'
  | 'credentials'
  | 'file'
  | 'string'
  | 'datetime'
  | 'flow'
  | 'http'
  | 'variables'
  | 'dataframes';

export const NAMESPACES: Namespace[] = [
  'common',
  'errors',
  'blocks',
  'builtin',
  'desktopui',
  'webui',
  'excel',
  'database',
  'ocr',
  'credentials',
  'file',
  'string',
  'datetime',
  'flow',
  'http',
  'variables',
  'dataframes',
];

export type Language = 'en' | 'ru';

export interface I18nConfig {
  supportedLanguages: Language[];
  defaultLanguage: Language;
  namespaces: Namespace[];
}