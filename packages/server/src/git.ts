import { simpleGit, type SimpleGit } from 'simple-git';
import { pairWordDiffs, parseUnifiedDiff, type FileDiff } from './diff.js';

export interface BranchInfo {
  name: string;
  sha: string;
  date: string;
  subject: string;
  isHead: boolean;
}

export interface FileSummary {
  path: string;
  oldPath?: string;
  status: 'A' | 'M' | 'D' | 'R';
  additions: number;
  deletions: number;
  hunks: number;
  binary: boolean;
}

export interface DiffSummary {
  baseSha: string;
  reviewSha: string;
  files: FileSummary[];
}

const g = (repo: string): SimpleGit => simpleGit(repo);

export async function validateRepo(repoPath: string): Promise<string> {
  const root = (await g(repoPath).raw(['rev-parse', '--show-toplevel'])).trim();
  if (!root) throw new Error('不是 git 仓库');
  return root;
}

export async function listBranches(repo: string): Promise<{ current: string | null; branches: BranchInfo[] }> {
  const out = await g(repo).raw([
    'for-each-ref',
    'refs/heads',
    '--format=%(refname:short)%09%(objectname)%09%(committerdate:short)%09%(HEAD)%09%(contents:subject)',
  ]);
  const branches: BranchInfo[] = [];
  let current: string | null = null;
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const name = parts[0];
    const sha = parts[1] ?? '';
    const date = parts[2] ?? '';
    const isHead = parts[3] === '*';
    const subject = parts.slice(4).join('\t');
    if (isHead) current = name;
    branches.push({ name, sha: sha.slice(0, 8), date, subject, isHead });
  }
  return { current, branches };
}

export async function diffSummary(repo: string, review: string, base: string): Promise<DiffSummary> {
  const revspec = `${base}...${review}`;
  const [numstatOut, diffOut, shaOut] = await Promise.all([
    g(repo).raw(['diff', '-M', '--numstat', revspec]),
    g(repo).raw(['diff', '-M', '-U0', '--no-color', revspec]),
    g(repo).raw(['rev-parse', `${base}^{commit}`, `${review}^{commit}`]).catch(() => ''),
  ]);
  const parsed = parseUnifiedDiff(diffOut);
  const stats = numstatOut.split('\n').filter(Boolean);
  const files: FileSummary[] = parsed.map((f, i) => {
    const [a, d] = stats[i]?.split('\t') ?? ['0', '0'];
    const binary = Boolean(f.isBinary) || a === '-';
    const status: FileSummary['status'] = f.isNew ? 'A' : f.isDeleted ? 'D' : f.oldPath ? 'R' : 'M';
    return {
      path: f.path,
      oldPath: f.oldPath,
      status,
      additions: a === '-' || !a ? 0 : Number(a) || 0,
      deletions: d === '-' || !d ? 0 : Number(d) || 0,
      hunks: binary ? 0 : f.hunks.length,
      binary,
    };
  });
  const shas = shaOut.trim().split('\n');
  return { baseSha: shas[0] ?? '', reviewSha: shas[1] ?? '', files };
}

export async function fileDiff(repo: string, review: string, base: string, filePath: string): Promise<FileDiff> {
  const out = await g(repo).raw(['diff', '-M', '-U0', '--no-color', `${base}...${review}`, '--', filePath]);
  const files = parseUnifiedDiff(out);
  const f = files[0];
  if (!f) throw new Error(`文件 ${filePath} 在这两个分支间没有文本改动`);
  pairWordDiffs(f.hunks);
  return f;
}

export async function fileContent(repo: string, rev: string, filePath: string): Promise<string | null> {
  try {
    return await g(repo).raw(['show', `${rev}:${filePath}`]);
  } catch {
    return null;
  }
}
