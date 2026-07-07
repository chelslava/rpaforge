import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AiPrompt } from '../types/ai';

interface PromptLibraryState {
  prompts: AiPrompt[];
  addPrompt: (prompt: Omit<AiPrompt, 'id' | 'builtin' | 'createdAt'>) => void;
  updatePrompt: (id: string, data: Partial<AiPrompt>) => void;
  deletePrompt: (id: string) => void;
  getPrompt: (id: string) => AiPrompt | undefined;
  searchPrompts: (query: string) => AiPrompt[];
  exportPrompts: () => string;
  importPrompts: (json: string) => { success: boolean; count: number; errors?: string[] };
  incrementUsage: (id: string) => void;
}

const BUILTIN_TEMPLATES: AiPrompt[] = [
  {
    id: 'builtin-extract-table',
    name: 'Extract table data from website',
    description: 'Generate a process that navigates to a website and extracts table data into a structured format.',
    prompt: 'Generate a process that navigates to a website and extracts table data into a structured format. Analyze the HTML structure, identify tables, and parse them into a list of dictionaries with column headers as keys.',
    category: 'Web Automation',
    builtin: true,
    createdAt: '2026-07-05T00:00:00.000Z',
    usageCount: 0,
  },
  {
    id: 'builtin-fill-excel',
    name: 'Fill Excel report from database',
    description: 'Create a process that reads data from a database and fills an Excel spreadsheet.',
    prompt: 'Create a process that reads data from a database using SQL queries and fills an Excel spreadsheet with the results. Format the spreadsheet with headers, apply conditional formatting, and save it to a specified path.',
    category: 'Data Processing',
    builtin: true,
    createdAt: '2026-07-05T00:00:00.000Z',
    usageCount: 0,
  },
  {
    id: 'builtin-login-automation',
    name: 'Login automation flow',
    description: 'Design an automation that logs into a web application with credentials from the credential store.',
    prompt: 'Design an automation that logs into a web application using credentials securely retrieved from the credential store. Handle login form fields, submit button, and include error handling for failed authentication attempts.',
    category: 'Web Automation',
    builtin: true,
    createdAt: '2026-07-05T00:00:00.000Z',
    usageCount: 0,
  },
  {
    id: 'builtin-file-processing',
    name: 'File processing pipeline',
    description: 'Build a process that monitors a folder, processes new files, and moves them to an archive.',
    prompt: 'Build a process that monitors a designated folder for new files, processes them according to specified rules (e.g., CSV parsing, data transformation), and moves successfully processed files to an archive folder with a timestamp.',
    category: 'File Operations',
    builtin: true,
    createdAt: '2026-07-05T00:00:00.000Z',
    usageCount: 0,
  },
  {
    id: 'builtin-email-monitoring',
    name: 'Email monitoring and response',
    description: 'Create an automation that monitors an email inbox, filters by subject, and processes attachments.',
    prompt: 'Create an automation that monitors an email inbox using IMAP/POP3, filters emails by subject line or sender, downloads attachments, processes their content, and optionally sends automated responses.',
    category: 'Email Automation',
    builtin: true,
    createdAt: '2026-07-05T00:00:00.000Z',
    usageCount: 0,
  },
];

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      prompts: BUILTIN_TEMPLATES,

      addPrompt: (promptData) => {
        const newPrompt: AiPrompt = {
          ...promptData,
          id: `user-${crypto.randomUUID()}`,
          builtin: false,
          createdAt: new Date().toISOString(),
          usageCount: 0,
        };
        set((state) => ({
          prompts: [newPrompt, ...state.prompts],
        }));
      },

      updatePrompt: (id, data) => {
        set((state) => ({
          prompts: state.prompts.map((prompt) =>
            prompt.id === id
              ? {
                  ...prompt,
                  ...data,
                  updatedAt: new Date().toISOString(),
                }
              : prompt
          ),
        }));
      },

      deletePrompt: (id) => {
        set((state) => ({
          prompts: state.prompts.filter((prompt) => prompt.id !== id),
        }));
      },

      getPrompt: (id) => {
        return get().prompts.find((p) => p.id === id);
      },

      searchPrompts: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().prompts.filter(
          (prompt) =>
            prompt.name.toLowerCase().includes(lowerQuery) ||
            prompt.description.toLowerCase().includes(lowerQuery) ||
            (prompt.category && prompt.category.toLowerCase().includes(lowerQuery))
        );
      },

      exportPrompts: () => {
        const state = get();
        return JSON.stringify(
          {
            prompts: state.prompts,
            exportedAt: new Date().toISOString(),
            version: '1.0',
          },
          null,
          2
        );
      },

      importPrompts: (json) => {
        try {
          const parsed = JSON.parse(json);
          if (!parsed.prompts || !Array.isArray(parsed.prompts)) {
            return { success: false, count: 0, errors: ['Invalid JSON structure'] };
          }

          const errors: string[] = [];
          let count = 0;

          parsed.prompts.forEach((prompt: unknown) => {
            if (typeof prompt !== 'object' || prompt === null) {
              errors.push('Invalid prompt format');
              return;
            }

            const promptData = prompt as Partial<AiPrompt>;
            if (
              !promptData.name ||
              !promptData.description ||
              !promptData.prompt ||
              !promptData.category
            ) {
              errors.push(`Missing required fields in prompt: ${promptData.name || 'unnamed'}`);
              return;
            }

            if (promptData.builtin) {
              return;
            }

            get().addPrompt(promptData as Omit<AiPrompt, 'id' | 'builtin' | 'createdAt'>);
            count++;
          });

          return { success: count > 0, count, errors };
        } catch (error) {
          return { success: false, count: 0, errors: ['Failed to parse JSON'] };
        }
      },

      incrementUsage: (id) => {
        set((state) => ({
          prompts: state.prompts.map((prompt) =>
            prompt.id === id
              ? {
                  ...prompt,
                  usageCount: (prompt.usageCount || 0) + 1,
                  updatedAt: new Date().toISOString(),
                }
              : prompt
          ),
        }));
      },
    }),
    {
      name: 'rpaforge-prompt-library',
    }
  )
);
