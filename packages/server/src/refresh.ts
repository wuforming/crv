import crypto from 'node:crypto';
import { diffSummary, fileContent } from './git.js';
import { updateSession, type SessionComment } from './store.js';

export interface RefreshStats {
  kept: number;
  moved: number;
  orphaned: number;
}

export interface RefreshResult {
  summary: Awaited<ReturnType<typeof diffSummary>>;
  comments: SessionComment[];
  stats: RefreshStats;
}

export function sha256Text(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * 在文件内容里按 contentHash 找锚点行：
 * 返回与原行号最接近的匹配行号；找不到返回 -1。
 */
export function matchAnchorLine(content: string, contentHash: string, fromLine: number): number {
  const lines = content.split('\n');
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < lines.length; i++) {
    if (sha256Text(lines[i]) === contentHash) {
      const ln = i + 1;
      const dist = Math.abs(ln - fromLine);
      if (dist < bestDist) {
        best = ln;
        bestDist = dist;
      }
    }
  }
  return best;
}

/**
 * 刷新 review：重新计算 diff，并把既有评论按 contentHash 重新锚定。
 * - 行内容还在（行号可能变）→ 跟随新行号（moved）
 * - 行内容没了（被改/被删/文件移出）→ orphaned=true，交人工确认
 * 已 orphaned 的评论保持原状（等人工删除或忽略），不再尝试重挂。
 */
export async function refreshReview(
  repo: string,
  review: string,
  base: string,
  prevComments: SessionComment[],
): Promise<RefreshResult> {
  const summary = await diffSummary(repo, review, base);
  const stats: RefreshStats = { kept: 0, moved: 0, orphaned: 0 };

  const newCache = new Map<string, string | null>();
  const oldCache = new Map<string, string | null>();
  const getNew = async (p: string): Promise<string | null> => {
    if (!newCache.has(p)) newCache.set(p, await fileContent(repo, review, p));
    return newCache.get(p) ?? null;
  };
  const getOld = async (p: string): Promise<string | null> => {
    if (!oldCache.has(p)) oldCache.set(p, await fileContent(repo, base, p));
    return oldCache.get(p) ?? null;
  };

  const comments: SessionComment[] = await Promise.all(
    prevComments.map(async (c): Promise<SessionComment> => {
      if (c.orphaned) {
        stats.orphaned += 1;
        return c;
      }
      if (!c.contentHash) {
        // 旧数据没有哈希（理论上不会发生，服务端保存时已补齐）→ 视为失效
        stats.orphaned += 1;
        return { ...c, orphaned: true };
      }
      const content = c.side === 'new' ? await getNew(c.file) : await getOld(c.file);
      if (content === null) {
        stats.orphaned += 1;
        return { ...c, orphaned: true };
      }
      const matched = matchAnchorLine(content, c.contentHash, c.line);
      if (matched < 0) {
        stats.orphaned += 1;
        return { ...c, orphaned: true };
      }
      if (matched !== c.line) {
        stats.moved += 1;
        return { ...c, line: matched, orphaned: false };
      }
      stats.kept += 1;
      return { ...c, orphaned: false };
    }),
  );

  // 落盘：更新评论与新基准 commit
  updateSession(repo, review, base, {
    comments,
    baseCommit: summary.baseSha,
    reviewCommit: summary.reviewSha,
  });

  return { summary, comments, stats };
}
