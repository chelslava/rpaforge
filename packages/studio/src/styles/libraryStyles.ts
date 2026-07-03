import { FiSettings, FiMonitor, FiGlobe, FiGrid, FiFolder, FiType, FiClock, FiBox, FiDatabase, FiFileText, FiLock, FiTable, FiZap } from 'react-icons/fi';
import type { IconType } from 'react-icons';

export interface LibraryStyle {
  icon: IconType;
  color: string;
  bgColor: string;
  descriptionKey: string;
}

export const LIBRARY_STYLES: Record<string, LibraryStyle> = {
  BuiltIn: {
    icon: FiSettings,
    color: 'var(--color-library-builtin)',
    bgColor: 'var(--color-library-builtin-soft)',
    descriptionKey: 'palette.descriptions.builtin',
  },
  DesktopUI: {
    icon: FiMonitor,
    color: 'var(--color-library-desktopui)',
    bgColor: 'var(--color-library-desktopui-soft)',
    descriptionKey: 'palette.descriptions.desktopUI',
  },
  WebUI: {
    icon: FiGlobe,
    color: 'var(--color-library-webui)',
    bgColor: 'var(--color-library-webui-soft)',
    descriptionKey: 'palette.descriptions.webUI',
  },
  Excel: {
    icon: FiGrid,
    color: 'var(--color-library-excel)',
    bgColor: 'var(--color-library-excel-soft)',
    descriptionKey: 'palette.descriptions.excel',
  },
  File: {
    icon: FiFolder,
    color: 'var(--color-library-file)',
    bgColor: 'var(--color-library-file-soft)',
    descriptionKey: 'palette.descriptions.file',
  },
  String: {
    icon: FiType,
    color: 'var(--color-library-string)',
    bgColor: 'var(--color-library-string-soft)',
    descriptionKey: 'palette.descriptions.string',
  },
  DateTime: {
    icon: FiClock,
    color: 'var(--color-library-datetime)',
    bgColor: 'var(--color-library-datetime-soft)',
    descriptionKey: 'palette.descriptions.datetime',
  },
  Variables: {
    icon: FiBox,
    color: 'var(--color-library-variables)',
    bgColor: 'var(--color-library-variables-soft)',
    descriptionKey: 'palette.descriptions.variables',
  },
  Flow: {
    icon: FiZap,
    color: 'var(--color-library-flow)',
    bgColor: 'var(--color-library-flow-soft)',
    descriptionKey: 'palette.descriptions.flow',
  },
  Database: {
    icon: FiDatabase,
    color: 'var(--color-library-database)',
    bgColor: 'var(--color-library-database-soft)',
    descriptionKey: 'palette.descriptions.database',
  },
  OCR: {
    icon: FiFileText,
    color: 'var(--color-library-ocr)',
    bgColor: 'var(--color-library-ocr-soft)',
    descriptionKey: 'palette.descriptions.ocr',
  },
  Credentials: {
    icon: FiLock,
    color: 'var(--color-library-credentials)',
    bgColor: 'var(--color-library-credentials-soft)',
    descriptionKey: 'palette.descriptions.credentials',
  },
  DataFrames: {
    icon: FiTable,
    color: 'var(--color-library-dataframes)',
    bgColor: 'var(--color-library-dataframes-soft)',
    descriptionKey: 'palette.descriptions.dataframes',
  },
};

export const LIBRARY_ORDER = ['DesktopUI', 'WebUI', 'Excel', 'File', 'Database', 'OCR', 'Credentials', 'DataFrames'];
