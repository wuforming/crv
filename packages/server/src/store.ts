import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import writeFileAtomic from 'write-file-atomic';

export interface SessionComment {
  id: string;
  file: string;
  side: 'new' | 'old';
  line: number;
  snippet: string;
  contentHash: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  /** 刷新后内容匹配失败，等人工确认（删除或重新挂到新行） */
  orphaned?: boolean;
}

export interface SessionData {
  reviewBranch: string;
  baseBranch: string;
  baseCommit: string;
  reviewCommit: string;
  fileOrder: string[] | null;
  comments: SessionComment[];
  lastOpenedAt: string;
}

export const DEFAULT_STORE_DIR = path.join(os.homedir(), '.code-review');

/** 会话按 仓库绝对路径哈希 + 分支对 隔离，与仓库目录完全分离。 */
export function repoHash(repo: string): string {
  return crypto.createHash('sha256').update(repo).digest('hex').slice(0, 12);
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || '_';
}

export function sessionFile(repo: string, review: string, base: string, baseDir = DEFAULT_STORE_DIR): string {
  return path.join(baseDir, repoHash(repo), 'sessions', `${safeName(review)}__${safeName(base)}.json`);
}

function isValidSession(d: unknown): d is SessionData {
  if (!d || typeof d !== 'object') return false;
  const s = d as Partial<SessionData>;
  return (
    typeof s.reviewBranch === 'string' &&
    typeof s.baseBranch === 'string' &&
    typeof s.baseCommit === 'string' &&
    typeof s.reviewCommit === 'string' &&
    (s.fileOrder === null || (Array.isArray(s.fileOrder) && s.fileOrder.every((p) => typeof p === 'string'))) &&
    Array.isArray(s.comments)
  );
}

export function readSession(repo: string, review: string, base: string, baseDir?: string): SessionData | null {
  try {
    const data = JSON.parse(fs.readFileSync(sessionFile(repo, review, base, baseDir), 'utf8'));
    return isValidSession(data) ? data : null;
  } catch {
    return null;
  }
}

export interface SessionPatch {
  fileOrder?: string[] | null;
  comments?: SessionComment[];
  baseCommit?: string;
  reviewCommit?: string;
}

/** 读-改-写合并：order 与 comments 分别更新互不覆盖，原子写防止中断损坏。 */
export function updateSession(
  repo: string,
  review: string,
  base: string,
  patch: SessionPatch,
  baseDir?: string,
): SessionData {
  const existing = readSession(repo, review, base, baseDir) ?? {
    reviewBranch: review,
    baseBranch: base,
    baseCommit: '',
    reviewCommit: '',
    fileOrder: null,
    comments: [],
    lastOpenedAt: new Date().toISOString(),
  };
  const next: SessionData = {
    ...existing,
    ...(patch.fileOrder !== undefined ? { fileOrder: patch.fileOrder } : {}),
    ...(patch.comments !== undefined ? { comments: patch.comments } : {}),
    ...(patch.baseCommit ? { baseCommit: patch.baseCommit } : {}),
    ...(patch.reviewCommit ? { reviewCommit: patch.reviewCommit } : {}),
    reviewBranch: review,
    baseBranch: base,
    lastOpenedAt: new Date().toISOString(),
  };
  const file = sessionFile(repo, review, base, baseDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic.sync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}
