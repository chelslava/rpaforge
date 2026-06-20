import * as fs from 'node:fs';
import * as path from 'node:path';
import { simpleGit, GitResponseError, type SimpleGit, type StatusResult, type MergeResult } from 'simple-git';
import type { GitFileStatus, GitLogEntry, GitStatusResult } from '../../src/types/git';
import { GitOperationError, classifyGitError } from './gitErrors';

export class GitService {
  private readonly repoRoot: string;
  private readonly git: SimpleGit;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.git = simpleGit({ baseDir: repoRoot });
  }

  async isGitRepo(): Promise<boolean> {
    if (!fs.existsSync(path.join(this.repoRoot, '.git'))) {
      return false;
    }
    try {
      return await this.git.checkIsRepo();
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async init(): Promise<void> {
    try {
      await this.git.init();
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async status(): Promise<GitStatusResult> {
    if (!(await this.isGitRepo())) {
      return {
        isRepo: false,
        branch: null,
        ahead: 0,
        behind: 0,
        tracking: null,
        staged: [],
        unstaged: [],
        conflicted: [],
      };
    }

    let result: StatusResult;
    try {
      result = await this.git.status();
    } catch (err) {
      throw classifyGitError(err);
    }

    const conflicted = new Set(result.conflicted);
    const stagedPaths = new Set(result.staged);

    const staged: GitFileStatus[] = result.files
      .filter((f) => stagedPaths.has(f.path) && !conflicted.has(f.path))
      .map((f) => ({ path: f.path, index: f.index, working_dir: f.working_dir, staged: true }));

    const unstaged: GitFileStatus[] = result.files
      .filter((f) => !stagedPaths.has(f.path) && !conflicted.has(f.path))
      .map((f) => ({ path: f.path, index: f.index, working_dir: f.working_dir, staged: false }));

    return {
      isRepo: true,
      branch: result.current ?? null,
      ahead: result.ahead,
      behind: result.behind,
      tracking: result.tracking ?? null,
      staged,
      unstaged,
      conflicted: result.conflicted,
    };
  }

  async stage(paths: string[]): Promise<void> {
    try {
      await this.git.add(paths);
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async unstage(paths: string[]): Promise<void> {
    try {
      await this.git.reset(['HEAD', '--', ...paths]);
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async commit(message: string): Promise<{ hash: string }> {
    try {
      const result = await this.git.commit(message);
      if (!result.commit) {
        throw new GitOperationError('NOTHING_TO_COMMIT', 'Nothing to commit');
      }
      return { hash: result.commit };
    } catch (err) {
      if (err instanceof GitOperationError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/nothing to commit|no changes added/i.test(message)) {
        throw new GitOperationError('NOTHING_TO_COMMIT', message);
      }
      throw classifyGitError(err);
    }
  }

  async push(): Promise<void> {
    try {
      await this.git.push();
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async pull(): Promise<void> {
    try {
      await this.git.pull();
    } catch (err) {
      // simple-git throws GitResponseError<MergeResult> when the merge fails;
      // the wrapped MergeResult.conflicts lists the conflicting files.
      if (err instanceof GitResponseError) {
        const merge = err.git as MergeResult | undefined;
        const conflicts = merge?.conflicts ?? [];
        if (conflicts.length > 0 || merge?.failed) {
          const files = conflicts.map((c) => c.file).filter((f): f is string => Boolean(f));
          throw new GitOperationError('MERGE_CONFLICT', err.message, files);
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/conflict/i.test(message)) {
        throw new GitOperationError('MERGE_CONFLICT', message);
      }
      throw classifyGitError(err);
    }
  }

  async log(limit = 50): Promise<GitLogEntry[]> {
    try {
      const result = await this.git.log({ maxCount: limit });
      return result.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author_name: entry.author_name,
        author_email: entry.author_email,
      }));
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async diff(filePath: string, staged: boolean): Promise<string> {
    try {
      const args = staged ? ['--cached', '--', filePath] : ['--', filePath];
      return await this.git.diff(args);
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async currentBranch(): Promise<string | null> {
    try {
      const result = await this.git.branch();
      return result.current || null;
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async discardChanges(paths: string[]): Promise<void> {
    try {
      await this.git.checkout(['--', ...paths]);
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async getRemoteUrl(name = 'origin'): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const remote = remotes.find((r) => r.name === name);
      return remote?.refs.push || remote?.refs.fetch || null;
    } catch (err) {
      throw classifyGitError(err);
    }
  }

  async setRemoteUrl(url: string, name = 'origin'): Promise<void> {
    try {
      const remotes = await this.git.getRemotes();
      const exists = remotes.some((r) => r.name === name);
      if (exists) {
        await this.git.remote(['set-url', name, url]);
      } else {
        await this.git.addRemote(name, url);
      }
    } catch (err) {
      throw classifyGitError(err);
    }
  }
}
