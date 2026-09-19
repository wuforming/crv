import type { DiffLine, FileHunk, SessionComment, WordToken } from '../types';
import type { LineTokens } from '../highlight';

export interface Region {
  name: string;
  kind: 'function' | 'class';
  startLine: number;
  endLine: number;
}

export interface RenderRow {
  kind: 'ctx' | 'add' | 'del';
  sec: number;
  oldNo?: number;
  newNo?: number;
  hunkIdx?: number;
  text: string;
  tokens?: LineTokens;
  words?: WordToken[];
}

export interface GapRow {
  kind: 'gap';
  sec: number;
  id: number;
  hidden: number;
}

/** 内联评论槽位：紧跟在锚定代码行之后，卡片随代码滚动/折叠。 */
export interface CommentSlotRow {
  kind: 'comment';
  sec: number;
  side: 'old' | 'new';
  line: number;
  comments: SessionComment[];
  composer: boolean;
}

export type DiffRow = RenderRow | GapRow | CommentSlotRow;

export interface Range {
  s: number;
  e: number;
}

const GAP_EXPAND_STEP = 50;

/** 找完全包含 [startLine, endLine] 的最小区域，函数优先于类。 */
export function enclosingRegion(regions: Region[] | undefined, startLine: number, endLine: number): Region | null {
  if (!regions || regions.length === 0) return null;
  const inside = regions.filter((r) => r.startLine <= startLine && endLine <= r.endLine);
  if (inside.length === 0) return null;
  inside.sort((a, b) => a.endLine - a.startLine - (b.endLine - b.startLine));
  return inside.find((r) => r.kind === 'function') ?? inside[0];
}

function mergeRanges(list: Range[]): Range[] {
  const merged: Range[] = [];
  [...list].sort((a, b) => a.s - b.s || a.e - b.e).forEach((r) => {
    const last = merged[merged.length - 1];
    if (last && r.s <= last.e + 1) last.e = Math.max(last.e, r.e);
    else merged.push({ ...r });
  });
  return merged;
}

function ctxRow(sec: number, n: number, newTokens: LineTokens[]): RenderRow {
  const tokens = newTokens[n - 1];
  return { kind: 'ctx', sec, newNo: n, text: tokens ? tokens.map((t) => t.content).join('') : '', tokens };
}

/**
 * 计算"可见范围"：hunk ± ctx 为基础，加上三类强制展开——
 * 1) methodExpand[i]：hunk i 所在方法的完整范围
 * 2) expandAllMethods：方法视图——所有 hunk 一律展开到所在方法（无方法边界的 hunk 维持 ±ctx）
 * 3) expandedGaps[i]：hunk i 与下一个可见范围（或文件尾）之间的折叠条，每次点击向两侧各放 50 行
 */
export function computeCoverage(opts: {
  hunks: FileHunk[];
  totalNew: number;
  ctx: number;
  expandedGaps?: Record<number, number>;
  regions?: Region[];
  methodExpand?: Record<number, boolean>;
  expandAllMethods?: boolean;
}): Range[] {
  const { hunks, totalNew, ctx } = opts;
  const expandedGaps = opts.expandedGaps ?? {};
  const regions = opts.regions;
  const methodExpand = opts.methodExpand ?? {};
  const clamp = (n: number) => Math.max(1, Math.min(totalNew, n));

  const hunkRange = (h: FileHunk): Range => ({ s: clamp(h.newStart - ctx), e: clamp(h.newStart + h.newLines - 1 + ctx) });
  const baseRanges = hunks.map(hunkRange);
  const forced: Range[] = [];

  hunks.forEach((h, i) => {
    if (methodExpand[i] || opts.expandAllMethods) {
      const r = enclosingRegion(regions, clamp(h.newStart), clamp(h.newStart + h.newLines - 1));
      if (r) forced.push({ s: clamp(r.startLine), e: clamp(r.endLine) });
    }
    const g = expandedGaps[i] ?? 0;
    if (g > 0) {
      const from = baseRanges[i].e + 1;
      const to = Math.min(baseRanges[i].e + g * GAP_EXPAND_STEP, totalNew);
      if (to >= from) forced.push({ s: from, e: to });
      if (hunks[i + 1]) {
        const nextStart = Math.max(hunks[i + 1].newStart - ctx, 1);
        const s2 = Math.max(nextStart - g * GAP_EXPAND_STEP, from);
        const e2 = nextStart - 1;
        if (e2 >= s2) forced.push({ s: s2, e: e2 });
      }
    }
  });

  return mergeRanges([...baseRanges, ...forced]);
}

export function rangeAt(ranges: Range[], line: number): Range | null {
  return ranges.find((r) => r.s <= line && line <= r.e) ?? null;
}

/**
 * 由可见范围生成渲染行：
 * - 范围之间（含最后一段之后的尾部）生成 gap 折叠条
 * - del 行插入在其 hunk 的 newStart 位置之前，add 行替换同号 ctx 行
 * - 锚定行后紧跟内联评论槽位（ctx = MAX_SAFE_INTEGER 时覆盖全文件，无折叠条）
 * - 折叠导致锚定行不在流内时，对应评论不生成槽位（跟随折叠，由右栏/全文件兜底）
 */
export function buildDiffRows(opts: {
  hunks: FileHunk[];
  totalNew: number;
  newTokens: LineTokens[];
  oldTokens: LineTokens[];
  ctx: number;
  expandedGaps?: Record<number, number>;
  regions?: Region[];
  methodExpand?: Record<number, boolean>;
  expandAllMethods?: boolean;
  inlineComments?: SessionComment[];
  composerAnchor?: { side: 'old' | 'new'; line: number } | null;
}): DiffRow[] {
  const { hunks, totalNew, newTokens, oldTokens, ctx } = opts;
  const rows: DiffRow[] = [];
  if (totalNew === 0 && hunks.length === 0) return rows;

  const ranges = computeCoverage(opts);

  // 行号索引
  const addByLine = new Map<number, { line: DiffLine; hunkIdx: number }>();
  const delsByStart = new Map<number, { line: DiffLine; hunkIdx: number }[]>();
  hunks.forEach((h, i) => {
    h.lines.forEach((l) => {
      if (l.type === 'add') addByLine.set(l.newNumber as number, { line: l, hunkIdx: i });
      else if (l.type === 'del') {
        const list = delsByStart.get(h.newStart) ?? [];
        list.push({ line: l, hunkIdx: i });
        delsByStart.set(h.newStart, list);
      }
    });
  });
  const prevHunkAt = (n: number): number => {
    for (let i = hunks.length - 1; i >= 0; i--) {
      if (hunks[i].newStart <= n) return i;
    }
    return 0;
  };

  ranges.forEach((m, mi) => {
    for (let n = m.s; n <= m.e; n++) {
      const dels = delsByStart.get(n);
      if (dels) {
        for (const d of dels) {
          rows.push({
            kind: 'del',
            sec: d.hunkIdx,
            hunkIdx: d.hunkIdx,
            oldNo: d.line.oldNumber,
            text: d.line.text,
            tokens: oldTokens[(d.line.oldNumber ?? 1) - 1],
            words: d.line.words,
          });
        }
      }
      const add = addByLine.get(n);
      if (add) {
        rows.push({
          kind: 'add',
          sec: add.hunkIdx,
          hunkIdx: add.hunkIdx,
          newNo: add.line.newNumber,
          text: add.line.text,
          tokens: newTokens[n - 1],
          words: add.line.words,
        });
      } else {
        rows.push(ctxRow(prevHunkAt(n), n, newTokens));
      }
    }
    // 范围之间的折叠条
    if (mi < ranges.length - 1) {
      const hidden = ranges[mi + 1].s - m.e - 1;
      if (hidden > 0) rows.push({ kind: 'gap', sec: prevHunkAt(m.e), id: prevHunkAt(m.e), hidden });
    }
  });
  // 文件尾部折叠条
  const last = ranges[ranges.length - 1];
  if (last && last.e < totalNew) {
    const sec = prevHunkAt(last.e);
    rows.push({ kind: 'gap', sec, id: sec, hidden: totalNew - last.e });
  }

  // 内联评论槽位：按锚点分组，渲染在锚定行之后（锚定行被折叠时不生成，跟随折叠）
  const inline = opts.inlineComments ?? [];
  const composerAnchor = opts.composerAnchor ?? null;
  if (inline.length === 0 && !composerAnchor) return rows;
  const groups = new Map<string, SessionComment[]>();
  for (const c of inline) {
    const k = `${c.side}:${c.line}`;
    const list = groups.get(k) ?? [];
    list.push(c);
    groups.set(k, list);
  }
  const out: DiffRow[] = [];
  for (const r of rows) {
    out.push(r);
    if (r.kind !== 'ctx' && r.kind !== 'add' && r.kind !== 'del') continue;
    const anchors: Array<{ side: 'old' | 'new'; line: number }> = [];
    if (r.oldNo !== undefined) anchors.push({ side: 'old', line: r.oldNo });
    if (r.newNo !== undefined) anchors.push({ side: 'new', line: r.newNo });
    for (const a of anchors) {
      const k = `${a.side}:${a.line}`;
      const list = groups.get(k);
      const isComposer = composerAnchor !== null && `${composerAnchor.side}:${composerAnchor.line}` === k;
      if (!list && !isComposer) continue;
      out.push({ kind: 'comment', sec: r.sec, side: a.side, line: a.line, comments: list ?? [], composer: isComposer });
      groups.delete(k);
    }
  }
  return out;
}
