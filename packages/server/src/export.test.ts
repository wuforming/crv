import { describe, expect, it } from 'vitest';
import { buildExportMarkdown } from './export.js';
import type { FileSummary } from './git.js';
import type { SessionComment, SessionData } from './store.js';

const files: FileSummary[] = [
  { path: 'src/utils.ts', status: 'M', additions: 4, deletions: 3, hunks: 3, binary: false },
  { path: 'src/api.ts', status: 'A', additions: 7, deletions: 0, hunks: 1, binary: false },
];

const c = (id: string, file: string, side: 'new' | 'old', line: number, snippet = 'code line'): SessionComment => ({
  id,
  file,
  side,
  line,
  snippet,
  contentHash: 'h',
  text: `评论-${id}`,
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
});

describe('buildExportMarkdown', () => {
  it('按保存顺序分节、评论带侧别行号与代码快照', () => {
    const session: SessionData = {
      reviewBranch: 'feature-x',
      baseBranch: 'develop',
      baseCommit: 'aaa',
      reviewCommit: 'bbb',
      fileOrder: ['src/api.ts', 'src/utils.ts'],
      comments: [c('c1', 'src/utils.ts', 'new', 14), c('c2', 'src/utils.ts', 'old', 3), c('c3', 'src/api.ts', 'new', 2)],
      lastOpenedAt: '',
    };
    const md = buildExportMarkdown({
      repoName: 'demo',
      repoPath: '/tmp/demo',
      review: 'feature-x',
      base: 'develop',
      baseSha: 'aaaa1111',
      reviewSha: 'bbbb2222',
      files,
      session,
      now: new Date('2026-09-18T12:00:00+08:00'),
    });

    // 顺序：api.ts 在前（会话保存的顺序）
    expect(md.indexOf('## 1. src/api.ts')).toBeLessThan(md.indexOf('## 2. src/utils.ts'));
    expect(md).toContain('`develop` → `feature-x`');
    expect(md).toContain('aaaa1111 → bbbb2222');
    expect(md).toContain('### 新 L2');
    expect(md).toContain('### 新 L14');
    expect(md).toContain('### 旧 L3');
    // 旧侧评论排在新侧前面（同文件内）
    expect(md.indexOf('### 旧 L3')).toBeLessThan(md.indexOf('### 新 L14'));
    expect(md).toContain('````ts');
    expect(md).toContain('评论-c1');
    expect(md).toContain('（新增，+7 −0）');
  });

  it('无会话时按 diff 顺序、无评论文件显示无评论；消失文件的评论保留独立小节', () => {
    const session: SessionData = {
      reviewBranch: 'feature-x',
      baseBranch: 'develop',
      baseCommit: '',
      reviewCommit: '',
      fileOrder: null,
      comments: [c('gone', 'src/removed.ts', 'new', 8)],
      lastOpenedAt: '',
    };
    const md = buildExportMarkdown({
      repoName: 'demo',
      repoPath: '/tmp/demo',
      review: 'feature-x',
      base: 'develop',
      baseSha: 'a',
      reviewSha: 'b',
      files,
      session,
    });
    expect(md.indexOf('## 1. src/utils.ts')).toBeLessThan(md.indexOf('## 2. src/api.ts'));
    expect(md).toContain('无评论');
    expect(md).toContain('## 3. src/removed.ts（已不在本次改动中）');
    expect(md).toContain('### 新 L8');
  });
});
