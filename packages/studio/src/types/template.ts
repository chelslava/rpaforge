import type { BlockData, BlockType } from './blocks';
export type { BlockData, BlockType };

export type TemplateType = 'project' | 'process';

export type TemplateCategory = 
  | 'empty' 
  | 'simple' 
  | 'framework'
  | 'web-automation'
  | 'desktop-automation'
  | 'data-processing'
  | 'file-operations'
  | 'excel-automation'
  | 'database'
  | 'web-scraping'
  | 'email'
  | 'ocr';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  type: TemplateType;
  icon: string;
  category: TemplateCategory;
  author?: string;
  email?: string;
  url?: string;
  tags?: string[];
  coverImage?: string;
  version?: string;
  minStudioVersion?: string;
  license?: string;
  docsUrl?: string;
  installs?: number;
  rating?: number;
}

export interface TemplateNode {
  id: string;
  type: BlockType | 'activity';
  position: { x: number; y: number };
  data: Partial<BlockData> & {
    activity?: {
      library: string;
      name: string;
      params: Record<string, unknown>;
    };
  };
}

export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface TemplateSubDiagram {
  id: string;
  name: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

export interface ProjectTemplate {
  metadata: TemplateMetadata;
  mainProcess: {
    nodes: TemplateNode[];
    edges: TemplateEdge[];
  };
  subDiagrams?: TemplateSubDiagram[];
  variables?: Record<string, unknown>;
}

export interface ProcessTemplate {
  metadata: TemplateMetadata;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

export interface CategoryInfo {
  id: TemplateCategory;
  name: string;
  icon: string;
  description: string;
}

export const MARKETPLACE_CATEGORIES: CategoryInfo[] = [
  { id: 'web-automation', name: 'Web Automation', icon: 'FiGlobe', description: 'Browser-based automation workflows' },
  { id: 'desktop-automation', name: 'Desktop Automation', icon: 'FiMonitor', description: 'Windows application automation' },
  { id: 'data-processing', name: 'Data Processing', icon: 'FiDatabase', description: 'Data transformation and processing' },
  { id: 'excel-automation', name: 'Excel Automation', icon: 'FiFile', description: 'Spreadsheet operations' },
  { id: 'file-operations', name: 'File Operations', icon: 'FiFolder', description: 'File and folder management' },
  { id: 'web-scraping', name: 'Web Scraping', icon: 'FiSearch', description: 'Extract data from websites' },
  { id: 'email', name: 'Email', icon: 'FiMail', description: 'Email automation' },
  { id: 'ocr', name: 'OCR & Text', icon: 'FiType', description: 'Text recognition from images' },
  { id: 'empty', name: 'Empty', icon: 'FiFile', description: 'Start from scratch' },
  { id: 'simple', name: 'Simple', icon: 'FiArrowRight', description: 'Basic workflows' },
  { id: 'framework', name: 'Framework', icon: 'FiSettings', description: 'Enterprise frameworks' },
];
