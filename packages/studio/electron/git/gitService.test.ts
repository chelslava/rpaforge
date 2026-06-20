// @vitest-environment node

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { GitService } from './gitService';
import { GitOperationError } from './gitErrors';

function configureIdentity(repoDir: string): void {
  execSync('git config user.email "test@test.com"', { cwd: repoDir });
  execSync('git config user.name "Test"', { cwd: repoDir });
}

function initRepo(repoDir: string): void {
  execSync('git init', { cwd: repoDir });
  configureIdentity(repoDir);
}

function writeFile(repoDir: string, relPath: string, content: string): void {
  fs.writeFileSync(path.join(repoDir, relPath), content, 'utf8');
}

describe('GitService', () => {
  let tmpDir: string;
  let service: GitService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitservice-test-'));
    service = new GitService(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isGitRepo', () => {
    test('returns false for a directory without .git', async () => {
      await expect(service.isGitRepo()).resolves.toBe(false);
    });

    test('returns true after init()', async () => {
      await service.init();
      configureIdentity(tmpDir);
      await expect(service.isGitRepo()).resolves.toBe(true);
    });
  });

  describe('status', () => {
    test('reports isRepo: false for a non-repo directory', async () => {
      const result = await service.status();
      expect(result.isRepo).toBe(false);
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
    });

    test('reports empty staged/unstaged on a clean repo with no commits', async () => {
      initRepo(tmpDir);
      const result = await service.status();
      expect(result.isRepo).toBe(true);
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
    });

    test('shows a new file as untracked/unstaged', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');

      const result = await service.status();
      expect(result.unstaged).toHaveLength(1);
      expect(result.unstaged[0].path).toBe('file.txt');
      expect(result.unstaged[0].staged).toBe(false);
      expect(result.staged).toEqual([]);
    });
  });

  describe('stage / unstage', () => {
    test('stage() moves a file from unstaged to staged', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');

      await service.stage(['file.txt']);

      const result = await service.status();
      expect(result.staged).toHaveLength(1);
      expect(result.staged[0].path).toBe('file.txt');
      expect(result.staged[0].staged).toBe(true);
      expect(result.unstaged.find((f) => f.path === 'file.txt')).toBeUndefined();
    });

    test('unstage() moves a file back to unstaged', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);

      await service.unstage(['file.txt']);

      const result = await service.status();
      expect(result.staged).toEqual([]);
      expect(result.unstaged.find((f) => f.path === 'file.txt')).toBeDefined();
    });
  });

  describe('commit', () => {
    test('creates a commit and returns a non-empty hash', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);

      const result = await service.commit('initial commit');

      expect(result.hash).toBeTruthy();
      expect(typeof result.hash).toBe('string');
    });

    test('clears staged/unstaged status for the committed file', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');

      const result = await service.status();
      expect(result.staged).toEqual([]);
      expect(result.unstaged).toEqual([]);
    });

    test('throws GitOperationError with NOTHING_TO_COMMIT when nothing is staged', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');

      await expect(service.commit('empty commit')).rejects.toMatchObject({
        code: 'NOTHING_TO_COMMIT',
      });
      await expect(service.commit('empty commit')).rejects.toBeInstanceOf(GitOperationError);
    });
  });

  describe('log', () => {
    test('returns commits in reverse chronological order, limited by `limit`', async () => {
      initRepo(tmpDir);

      for (const name of ['first.txt', 'second.txt', 'third.txt']) {
        writeFile(tmpDir, name, name);
        await service.stage([name]);
        await service.commit(`add ${name}`);
      }

      const entries = await service.log(2);

      expect(entries).toHaveLength(2);
      expect(entries[0].message).toBe('add third.txt');
      expect(entries[1].message).toBe('add second.txt');
    }, 15000);
  });

  describe('diff', () => {
    test('returns a non-empty unstaged diff after modifying a committed file', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'line1\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');

      writeFile(tmpDir, 'file.txt', 'line1\nline2\n');

      const diff = await service.diff('file.txt', false);
      expect(diff).toBeTruthy();
      expect(diff).toContain('file.txt');
    });

    test('returns a non-empty staged diff after staging the modification', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'line1\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');

      writeFile(tmpDir, 'file.txt', 'line1\nline2\n');
      await service.stage(['file.txt']);

      const diff = await service.diff('file.txt', true);
      expect(diff).toBeTruthy();
      expect(diff).toContain('file.txt');
    });
  });

  describe('currentBranch', () => {
    test('returns the current branch name matching git directly', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');

      const branch = await service.currentBranch();
      const expected = execSync('git branch --show-current', { cwd: tmpDir }).toString().trim();

      expect(branch).toBeTruthy();
      expect(branch).toBe(expected);
    });
  });

  describe('discardChanges', () => {
    test('reverts uncommitted changes to the HEAD version', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'original\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');

      writeFile(tmpDir, 'file.txt', 'modified\n');

      await service.discardChanges(['file.txt']);

      const content = fs.readFileSync(path.join(tmpDir, 'file.txt'), 'utf8');
      expect(content.replace(/\r\n/g, '\n')).toBe('original\n');
    });
  });

  describe('push / pull', () => {
    let bareDir: string;

    beforeEach(() => {
      bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitservice-test-bare-'));
      execSync('git init --bare', { cwd: bareDir });
    });

    afterEach(() => {
      fs.rmSync(bareDir, { recursive: true, force: true });
    });

    test('push() publishes commits to the remote bare repo', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');
      execSync(`git remote add origin "${bareDir}"`, { cwd: tmpDir });
      const branch = execSync('git branch --show-current', { cwd: tmpDir }).toString().trim();
      execSync(`git push -u origin ${branch}`, { cwd: tmpDir });

      writeFile(tmpDir, 'second.txt', 'world\n');
      await service.stage(['second.txt']);
      await service.commit('second commit');

      await service.push();

      const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitservice-test-clone-'));
      try {
        execSync(`git clone "${bareDir}" "${cloneDir}"`);
        expect(fs.existsSync(path.join(cloneDir, 'second.txt'))).toBe(true);
      } finally {
        fs.rmSync(cloneDir, { recursive: true, force: true });
      }
    });

    test('pull() fetches and merges changes pushed by another clone', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');
      execSync(`git remote add origin "${bareDir}"`, { cwd: tmpDir });
      const branch = execSync('git branch --show-current', { cwd: tmpDir }).toString().trim();
      execSync(`git push -u origin ${branch}`, { cwd: tmpDir });

      const otherClientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitservice-test-client-'));
      try {
        execSync(`git clone "${bareDir}" "${otherClientDir}"`);
        configureIdentity(otherClientDir);
        writeFile(otherClientDir, 'fromOther.txt', 'other client\n');
        execSync('git add fromOther.txt', { cwd: otherClientDir });
        execSync('git commit -m "from other client"', { cwd: otherClientDir });
        execSync('git push origin HEAD', { cwd: otherClientDir });

        await service.pull();

        expect(fs.existsSync(path.join(tmpDir, 'fromOther.txt'))).toBe(true);
      } finally {
        fs.rmSync(otherClientDir, { recursive: true, force: true });
      }
    });

    test('push() to an invalid host throws a GitOperationError', async () => {
      initRepo(tmpDir);
      writeFile(tmpDir, 'file.txt', 'hello\n');
      await service.stage(['file.txt']);
      await service.commit('initial commit');
      execSync(
        'git remote add origin https://invalid-host-that-does-not-exist.example.invalid/repo.git',
        { cwd: tmpDir }
      );

      await expect(service.push()).rejects.toBeInstanceOf(GitOperationError);
    }, 15000);
  });

  describe('getRemoteUrl / setRemoteUrl', () => {
    test('getRemoteUrl() returns null when no remote is configured', async () => {
      initRepo(tmpDir);

      await expect(service.getRemoteUrl()).resolves.toBeNull();
    });

    test('getRemoteUrl() returns the URL of an existing remote', async () => {
      initRepo(tmpDir);
      execSync('git remote add origin https://example.com/repo.git', { cwd: tmpDir });

      await expect(service.getRemoteUrl()).resolves.toBe('https://example.com/repo.git');
    });

    test('setRemoteUrl() creates the remote when none exists', async () => {
      initRepo(tmpDir);

      await service.setRemoteUrl('https://example.com/new-repo.git');

      const url = execSync('git remote get-url origin', { cwd: tmpDir }).toString().trim();
      expect(url).toBe('https://example.com/new-repo.git');
    });

    test('setRemoteUrl() updates the URL of an existing remote', async () => {
      initRepo(tmpDir);
      execSync('git remote add origin https://example.com/old-repo.git', { cwd: tmpDir });

      await service.setRemoteUrl('https://example.com/updated-repo.git');

      const url = execSync('git remote get-url origin', { cwd: tmpDir }).toString().trim();
      expect(url).toBe('https://example.com/updated-repo.git');
    });

    test('setRemoteUrl() supports a non-default remote name', async () => {
      initRepo(tmpDir);

      await service.setRemoteUrl('https://example.com/upstream-repo.git', 'upstream');

      const url = execSync('git remote get-url upstream', { cwd: tmpDir }).toString().trim();
      expect(url).toBe('https://example.com/upstream-repo.git');
      await expect(service.getRemoteUrl()).resolves.toBeNull();
    });
  });
});
