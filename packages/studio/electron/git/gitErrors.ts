import type { GitOperationErrorCode } from '../../src/types/git';

export class GitOperationError extends Error {
  readonly code: GitOperationErrorCode;
  readonly conflictedFiles?: string[];

  constructor(code: GitOperationErrorCode, message: string, conflictedFiles?: string[]) {
    super(message);
    this.name = 'GitOperationError';
    this.code = code;
    this.conflictedFiles = conflictedFiles;
  }
}

/**
 * Map an unknown error thrown by simple-git into a typed GitOperationError by
 * pattern-matching its message/stderr. NOT_A_REPO, NOTHING_TO_COMMIT and
 * MERGE_CONFLICT are thrown explicitly by GitService instead of being inferred
 * here; this only covers the cases best detected from raw git output.
 */
export function classifyGitError(err: unknown): GitOperationError {
  if (err instanceof GitOperationError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (lower.includes('enoent') || lower.includes('not found') || lower.includes('is not recognized')) {
    return new GitOperationError('GIT_NOT_FOUND', message);
  }

  if (
    lower.includes('authentication failed') ||
    lower.includes('permission denied') ||
    lower.includes('could not read username') ||
    lower.includes('could not read password')
  ) {
    return new GitOperationError('AUTH_FAILED', message);
  }

  return new GitOperationError('UNKNOWN', message);
}
