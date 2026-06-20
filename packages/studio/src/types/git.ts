/**
 * Shared types for the Git Source Control panel.
 * Used by both the Electron main process (electron/git/*) and the renderer
 * (src/stores/gitStore.ts, src/components/SourceControl/*).
 */

export interface GitFileStatus {
  path: string;
  /** Index (staged) status char from `git status --porcelain`, e.g. 'M', 'A', 'D', ' '. */
  index: string;
  /** Working-tree (unstaged) status char, e.g. 'M', 'D', '?', ' '. */
  working_dir: string;
  staged: boolean;
}

export interface GitStatusResult {
  isRepo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  tracking: string | null;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  conflicted: string[];
}

export interface GitLogEntry {
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}

export type GitOperationErrorCode =
  | 'NOT_A_REPO'
  | 'GIT_NOT_FOUND'
  | 'AUTH_FAILED'
  | 'MERGE_CONFLICT'
  | 'NOTHING_TO_COMMIT'
  | 'UNKNOWN';

export interface GitOperationErrorPayload {
  code: GitOperationErrorCode;
  message: string;
  conflictedFiles?: string[];
}
