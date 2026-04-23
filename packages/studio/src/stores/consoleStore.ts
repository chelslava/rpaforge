/**
 * RPAForge Console Store
 *
 * Manages console output for process execution.
 */

import { create } from 'zustand';
import type { LogLevel } from '../types/events';
import { config } from '../config/app.config';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  source?: string;
  details?: unknown;
}

interface ConsoleState {
  logs: LogEntry[];
  filter: LogLevel[];
  searchQuery: string;
  autoScroll: boolean;
  maxLogs: number;

  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  addLogs: (entries: Omit<LogEntry, 'id' | 'timestamp'>[]) => void;
  clearLogs: () => void;

  setFilter: (levels: LogLevel[]) => void;
  toggleFilterLevel: (level: LogLevel) => void;
  setSearchQuery: (query: string) => void;
  setAutoScroll: (autoScroll: boolean) => void;

  getFilteredLogs: () => LogEntry[];
  exportLogs: () => string;
}

const generateId = () => `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;



export const useConsoleStore = create<ConsoleState>((set, get) => ({
  logs: [],
  filter: ['info', 'warn', 'error'],
  searchQuery: '',
  autoScroll: true,
  maxLogs: config.console.maxLogs,

  addLog: (entry) => {
    const log: LogEntry = {
      ...entry,
      id: generateId(),
      timestamp: new Date(),
    };

    set((state) => {
      const recentLogs = state.logs.slice(-10);
      const isDuplicate = recentLogs.some(
        (l) => l.level === log.level && l.message === log.message && l.source === log.source
      );
      if (isDuplicate) {
        return state;
      }

      const logs = [...state.logs, log];
      if (logs.length > state.maxLogs) {
        return { logs: logs.slice(-state.maxLogs) };
      }
      return { logs };
    });
  },

  addLogs: (entries) => {
    const logs: LogEntry[] = entries.map((entry) => ({
      ...entry,
      id: generateId(),
      timestamp: new Date(),
    }));

    set((state) => {
      const newLogs = [...state.logs, ...logs];
      if (newLogs.length > state.maxLogs) {
        return { logs: newLogs.slice(-state.maxLogs) };
      }
      return { logs: newLogs };
    });
  },

  clearLogs: () => set({ logs: [] }),

  setFilter: (levels) => set({ filter: levels }),

  toggleFilterLevel: (level) => {
    set((state) => {
      const filter = state.filter.includes(level)
        ? state.filter.filter((l) => l !== level)
        : [...state.filter, level];
      return { filter };
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setAutoScroll: (autoScroll) => set({ autoScroll }),

  getFilteredLogs: () => {
    const { logs, filter, searchQuery } = get();

    let filtered = logs.filter((log) => filter.includes(log.level));

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.source?.toLowerCase().includes(query)
      );
    }

    return filtered;
  },

  exportLogs: () => {
    const { logs } = get();
    return logs
      .map(
        (log) =>
          `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${
            log.source ? `[${log.source}] ` : ''
          }${log.message}`
      )
      .join('\n');
  },
}));
