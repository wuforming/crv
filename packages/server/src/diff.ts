import { diffWordsWithSpace } from 'diff';

export type LineType = 'add' | 'del' | 'context';

export interface WordToken {
  value: string;
  kind: 'add' | 'del' | 'same';
}

export interface DiffLine {
  type: LineType;
  oldNumber?: number;
  newNumber?: number;
  text: string;
  words?: WordToken[];
}

export interface FileHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  isNew?: boolean;
  isDeleted?: boolean;
  isBinary?: boolean;
  hunks: FileHunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPath(p: string): string | null {
  let s = p.trim();
  if (s === '/dev/null') return null;
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s.startsWith('a/') || s.startsWith('b/')) s = s.slice(2);
  return s;
}

function finalizeNumbers(h: FileHunk): void {
  let o = h.oldStart;
  let n = h.newStart;
  for (const l of h.lines) {
    if (l.type === 'add') l.newNumber = n++;
    else if (l.type === 'del') l.oldNumber = o++;
    else {
      l.oldNumber = o++;
      l.newNumber = n++;
    }
  }
}

/**
 * 解析 `git diff` 的 unified diff 输出。
 * 行号在 finalizeNumbers 中按 hunk 头重算，不依赖输出里的隐式顺序。
 */
export function parseUnifiedDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git ')) {
      i++;
      continue;
    }
    i++;
    let from: string | null = null;
    let to: string | null = null;
    let isBinary = false;
    const hunks: FileHunk[] = [];

    while (i < lines.length && !lines[i].startsWith('diff --git ')) {
      const l = lines[i];
      if (l.startsWith('--- ')) {
        from = stripPath(l.slice(4));
        i++;
      } else if (l.startsWith('+++ ')) {
        to = stripPath(l.slice(4));
        i++;
      } else if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) {
        isBinary = true;
        i++;
      } else if (HUNK_RE.test(l)) {
        const m = HUNK_RE.exec(l);
        if (!m) break;
        const hunk: FileHunk = {
          oldStart: Number(m[1]),
          oldLines: m[2] === undefined ? 1 : Number(m[2]),
          newStart: Number(m[3]),
          newLines: m[4] === undefined ? 1 : Number(m[4]),
          lines: [],
        };
        i++;
        while (i < lines.length) {
          const hl = lines[i];
          if (hl.startsWith('diff --git ') || HUNK_RE.test(hl)) break;
          if (hl.startsWith('+')) hunk.lines.push({ type: 'add', text: hl.slice(1) });
          else if (hl.startsWith('-')) hunk.lines.push({ type: 'del', text: hl.slice(1) });
          else if (hl.startsWith(' ')) hunk.lines.push({ type: 'context', text: hl.slice(1) });
          // "\ No newline at end of file" 等标记直接跳过
          i++;
        }
        finalizeNumbers(hunk);
        hunks.push(hunk);
      } else {
        i++;
      }
    }

    const isNew = from === null;
    const isDeleted = to === null;
    files.push({
      path: to ?? from ?? '',
      oldPath: !isNew && !isDeleted && from !== to ? (from as string) : undefined,
      isNew,
      isDeleted,
      isBinary,
      hunks,
    });
  }
  return files;
}

/**
 * 对 hunk 内相邻的 del/add 行做行内词级 diff：
 * 连续的 del 块与紧随的 add 块按顺序一一配对（取两者较短长度），
 * 配对成功的行携带相同的 words 数组，渲染时 del 行取 kind!=='add' 的 token，add 行取 kind!=='del'。
 */
export function pairWordDiffs(hunks: FileHunk[]): void {
  for (const h of hunks) {
    const ls = h.lines;
    let i = 0;
    while (i < ls.length) {
      if (ls[i].type !== 'del') {
        i++;
        continue;
      }
      let j = i;
      while (j < ls.length && ls[j].type === 'del') j++;
      let k = j;
      while (k < ls.length && ls[k].type === 'add') k++;
      if (k > j) {
        const n = Math.min(j - i, k - j);
        for (let x = 0; x < n; x++) {
          const tokens = wordTokens(ls[i + x].text, ls[j + x].text);
          ls[i + x].words = tokens;
          ls[j + x].words = tokens;
        }
      }
      i = k;
    }
  }
}

function wordTokens(oldText: string, newText: string): WordToken[] {
  return diffWordsWithSpace(oldText, newText).map((p) => ({
    value: p.value,
    kind: p.added ? 'add' : p.removed ? 'del' : 'same',
  }));
}
