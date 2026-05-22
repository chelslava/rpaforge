import { create } from 'zustand';
import type { ProjectTemplate, ProcessTemplate, TemplateCategory, CategoryInfo } from '../types/template';
import { MARKETPLACE_CATEGORIES } from '../types/template';
import { PROJECT_TEMPLATES, PROCESS_TEMPLATES } from '../templates';

interface MarketplaceState {
  projectTemplates: ProjectTemplate[];
  processTemplates: ProcessTemplate[];
  selectedCategory: TemplateCategory | 'all';
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  
  loadTemplates: () => void;
  setSelectedCategory: (category: TemplateCategory | 'all') => void;
  setSearchQuery: (query: string) => void;
  getFilteredProjectTemplates: () => ProjectTemplate[];
  getFilteredProcessTemplates: () => ProcessTemplate[];
  getCategories: () => CategoryInfo[];
  getTemplateById: (id: string) => ProjectTemplate | ProcessTemplate | undefined;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  projectTemplates: [],
  processTemplates: [],
  selectedCategory: 'all',
  searchQuery: '',
  isLoading: false,
  error: null,
  
  loadTemplates: () => {
    set({ 
      projectTemplates: PROJECT_TEMPLATES, 
      processTemplates: PROCESS_TEMPLATES,
      isLoading: false 
    });
  },
  
  setSelectedCategory: (category) => {
    set({ selectedCategory: category });
  },
  
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
  
  getFilteredProjectTemplates: () => {
    const { projectTemplates, selectedCategory, searchQuery } = get();
    
    return projectTemplates.filter(template => {
      if (selectedCategory !== 'all' && template.metadata.category !== selectedCategory) {
        return false;
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = template.metadata.name.toLowerCase();
        const desc = template.metadata.description.toLowerCase();
        const tags = template.metadata.tags?.join(' ').toLowerCase() || '';
        const author = template.metadata.author?.toLowerCase() || '';
        
        if (!name.includes(query) && !desc.includes(query) && !tags.includes(query) && !author.includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  },
  
  getFilteredProcessTemplates: () => {
    const { processTemplates, selectedCategory, searchQuery } = get();
    
    return processTemplates.filter(template => {
      if (selectedCategory !== 'all' && template.metadata.category !== selectedCategory) {
        return false;
      }
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const name = template.metadata.name.toLowerCase();
        const desc = template.metadata.description.toLowerCase();
        const tags = template.metadata.tags?.join(' ').toLowerCase() || '';
        
        if (!name.includes(query) && !desc.includes(query) && !tags.includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  },
  
  getCategories: () => MARKETPLACE_CATEGORIES,
  
  getTemplateById: (id: string) => {
    const { projectTemplates, processTemplates } = get();
    return projectTemplates.find(t => t.metadata.id === id) || 
           processTemplates.find(t => t.metadata.id === id);
  },
}));
