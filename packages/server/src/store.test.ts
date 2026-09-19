import fsSync from 'node:fs';
import pathSync from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSession, repoHash, sessionFile, updateSession, type SessionComment } from './store.js';

let dir: string | null = null;
const baseDir = () => (dir ??= mkdtempSync(join(tmpdir(), 'crv-test-')));

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const comment = (id: string, line: number): SessionComment => ({
  id,
  file: 'src/utils.ts',
  side: 'new',
  line,
  snippet: '  const yuan = cents / 100;',
  contentHash: '',
  text: '单位换算疑义',
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
});

describe('session store', () => {
  it('不同仓库路径哈希不同、路径合法', () => {
    expect(repoHash('/a/b')).not.toBe(repoHash('/a/c'));
    expect(sessionFile('/a/b', 'feature/x', 'develop')).toMatch(/\.code-review\/[^/]+\/sessions\/feature_x__develop\.json$/);
  });

  it('读-改-写：order 与 comments 互不覆盖，原子落盘', () => {
    expect(readSession('/repo', 'feature-x', 'develop', baseDir())).toBeNull();

    updateSession('/repo', 'feature-x', 'develop', { fileOrder: ['b.ts', 'a.ts'] }, baseDir());
    updateSession('/repo', 'feature-x', 'develop', { comments: [comment('c1', 2)] }, baseDir());

    const s = readSession('/repo', 'feature-x', 'develop', baseDir());
    expect(s?.fileOrder).toEqual(['b.ts', 'a.ts']);
    expect(s?.comments).toHaveLength(1);
    expect(s?.reviewBranch).toBe('feature-x');
    expect(s?.baseBranch).toBe('develop');
    expect(s?.lastOpenedAt).toBeTruthy();

    // 更新 order 不动 comments
    updateSession('/repo', 'feature-x', 'develop', { fileOrder: ['a.ts'] }, baseDir());
    const s2 = readSession('/repo', 'feature-x', 'develop', baseDir());
    expect(s2?.fileOrder).toEqual(['a.ts']);
    expect(s2?.comments).toHaveLength(1);
  });

  it('同仓库不同分支对互不隔离串扰', () => {
    updateSession('/repo', 'feature-x', 'develop', { comments: [comment('c1', 2)] }, baseDir());
    updateSession('/repo', 'feature-y', 'develop', { comments: [comment('c2', 5)] }, baseDir());
    expect(readSession('/repo', 'feature-x', 'develop', baseDir())?.comments[0].id).toBe('c1');
    expect(readSession('/repo', 'feature-y', 'develop', baseDir())?.comments[0].id).toBe('c2');
  });

  it('损坏的会话文件读出 null 而不是抛错', () => {
    const f = sessionFile('/repo2', 'r', 'b', baseDir());
    fsSync.mkdirSync(pathSync.dirname(f), { recursive: true });
    fsSync.writeFileSync(f, '{broken json');
    expect(readSession('/repo2', 'r', 'b', baseDir())).toBeNull();
  });
});
