import type { FileSummary } from './git.js';
import type { SessionComment, SessionData } from './store.js';

const EXT_LANG: Record<string, string> = {
  ts: 'ts',
  mts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  py: 'python',
  go: 'go',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  json: 'json',
  md: 'markdown',
  sql: 'sql',
  sh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
};

const STATUS_LABEL: Record<string, string> = { A: '新增', M: '修改', D: '删除', R: '重命名' };

function langOf(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? '';
}

function sortComments(list: SessionComment[]): SessionComment[] {
  return [...list].sort((a, b) => (a.side === b.side ? a.line - b.line : a.side === 'old' ? -1 : 1));
}

/**
 * 导出会议纪要 Markdown：文件按会话保存的顺序（无则按 diff 顺序）分节，
 * 每条评论带行号侧别（新/旧）+ 代码快照（四反引号 fence，防三反引号内容截断）。
 */
export function buildExportMarkdown(opts: {
  repoName: string;
  repoPath: string;
  review: string;
  base: string;
  baseSha: string;
  reviewSha: string;
  files: FileSummary[];
  session: SessionData | null;
  now?: Date;
}): string {
  const { repoName, repoPath, review, base, baseSha, reviewSha, files, session } = opts;
  const now = opts.now ?? new Date();
  const comments = session?.comments ?? [];
  const order = session?.fileOrder;
  const ordered = order
    ? [
        ...order.map((p) => files.find((f) => f.path === p)).filter((f): f is FileSummary => Boolean(f)),
        ...files.filter((f) => !order.includes(f.path)),
      ]
    : files;
  const commentFiles = [...new Set(comments.map((c) => c.file))];
  const extraFiles = commentFiles.filter((f) => !ordered.some((x) => x.path === f));

  const lines: string[] = [];
  lines.push('# Code Review 纪要', '');
  lines.push(`- 仓库：${repoName}（${repoPath}）`);
  lines.push(`- 分支：\`${base}\` → \`${review}\``);
  lines.push(`- Commit：${baseSha.slice(0, 8)} → ${reviewSha.slice(0, 8)}`);
  lines.push(`- 导出时间：${now.toLocaleString('zh-CN', { hour12: false })}`);
  lines.push(`- 评论数：${comments.length}（覆盖 ${commentFiles.length} 个文件）`);
  lines.push('', '---', '');

  let idx = 0;
  const fileSection = (filePath: string, meta?: FileSummary): void => {
    idx++;
    const stat = meta
      ? `（${STATUS_LABEL[meta.status] ?? meta.status}，+${meta.additions} −${meta.deletions}${meta.oldPath ? `，原 ${meta.oldPath}` : ''}）`
      : '（已不在本次改动中）';
    lines.push(`## ${idx}. ${filePath}${stat}`, '');
    const list = sortComments(comments.filter((c) => c.file === filePath));
    if (list.length === 0) {
      lines.push('无评论', '');
      return;
    }
    for (const c of list) {
      lines.push(`### ${c.side === 'new' ? '新' : '旧'} L${c.line}`, '');
      lines.push(`\`\`\`\`${langOf(filePath)}`, c.snippet, '````', '');
      lines.push(c.text, '');
    }
  };

  for (const f of ordered) fileSection(f.path, f);
  for (const f of extraFiles) fileSection(f);
  return lines.join('\n');
}
