import fs from 'node:fs';
import { ensureDefIndex, snapshotFile, type Def } from './defs.js';
import { diffSummary, fileContent, type FileSummary } from './git.js';
import { parseCallNames, treeLangOf } from './tree.js';

export interface CallEdge {
  from: string;
  to: string;
  /** 产生这条边的符号名（同名可能命中多个定义，取首个） */
  via: string;
}

export interface CallGraph {
  edges: CallEdge[];
  /** 推荐评审顺序：调用链拓扑序，入口（未被其他改动文件调用）在前；环按原 diff 顺序截断 */
  order: string[];
}

const MAX_SCAN_FILES = 300;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_NAMES_PER_FILE = 500;
const IDENT_RE = /[$A-Za-z_][$\w]*/g;

/** 兜底档：全文标识符扫描（任何文本语言可用，注释/字符串会误连）。 */
export function scanIdentifiers(content: string): string[] {
  const out = new Set<string>();
  for (const m of content.matchAll(IDENT_RE)) {
    out.add(m[0]);
    if (out.size >= MAX_NAMES_PER_FILE) break;
  }
  return [...out];
}

/**
 * 改动文件之间的调用边：文件 F 调用了符号名，该符号的定义落在另一个改动文件 → 连边。
 * 精度定位是导航提示：同名定义多落点时全部连出，由前端去重展示。
 */
export function buildCallGraph(
  files: FileSummary[],
  defsByName: Map<string, Def[]>,
  callsOf: (path: string) => string[],
): CallEdge[] {
  const changed = new Set(files.map((f) => f.path));
  const edges = new Map<string, CallEdge>();
  for (const f of files) {
    for (const name of callsOf(f.path)) {
      for (const def of defsByName.get(name) ?? []) {
        if (def.file === f.path || !changed.has(def.file)) continue;
        const key = `${f.path}\0${def.file}`;
        if (!edges.has(key)) edges.set(key, { from: f.path, to: def.file, via: name });
      }
    }
  }
  return [...edges.values()];
}

/** 拓扑排序（入口在前）。环无法拓扑：无零入度节点时按 diff 原序截断，保证所有文件都出现。 */
export function suggestOrder(paths: string[], edges: CallEdge[]): string[] {
  const index = new Map(paths.map((p, i) => [p, i]));
  const indeg = new Map(paths.map((p) => [p, 0]));
  const succs = new Map(paths.map((p) => [p, [] as string[]]));
  for (const e of edges) {
    if (!index.has(e.from) || !index.has(e.to) || e.from === e.to) continue;
    succs.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  // ready 始终按 diff 原序排列，同层顺序稳定
  let ready = paths.filter((p) => indeg.get(p) === 0);
  const out: string[] = [];
  while (ready.length) {
    const n = ready.shift()!;
    out.push(n);
    const newly: string[] = [];
    for (const m of succs.get(n)!) {
      const d = indeg.get(m)! - 1;
      indeg.set(m, d);
      if (d === 0) newly.push(m);
    }
    ready = [...ready, ...newly].sort((a, b) => index.get(a)! - index.get(b)!);
  }
  for (const p of paths) if (!out.includes(p)) out.push(p);
  return out;
}

async function callsOfFile(repo: string, rev: string, filePath: string): Promise<string[]> {
  const lang = treeLangOf(filePath);
  if (lang) {
    // 优先走 tree-sitter：只有真实调用点，注释/字符串不误连；成功（含无调用）直接采信
    const content = await fileContent(repo, rev, filePath);
    if (content && content.length <= MAX_FILE_BYTES) {
      const names = await parseCallNames(content, lang);
      if (names) return names;
    }
  }
  // 兜底档：快照标识符扫描（Kotlin 等无 grammar 语言 / 解析失败）
  const snap = await snapshotFile(repo, rev, filePath);
  if (!snap) return [];
  try {
    const st = fs.statSync(snap);
    if (st.size > MAX_FILE_BYTES) return [];
    return scanIdentifiers(fs.readFileSync(snap, 'utf8'));
  } catch {
    return [];
  }
}

/** 构建 repo 的 review↔base 调用链图。任何一步失败由调用方兜底为空图。 */
export async function buildReviewGraph(repo: string, review: string, base: string): Promise<CallGraph> {
  const summary = await diffSummary(repo, review, base);
  const scannable = summary.files.filter((f) => !f.binary && f.status !== 'D').slice(0, MAX_SCAN_FILES);
  const defsByName = await ensureDefIndex(repo, review);
  const calls = new Map<string, string[]>();
  for (const f of scannable) calls.set(f.path, await callsOfFile(repo, review, f.path));
  const edges = buildCallGraph(summary.files, defsByName, (p) => calls.get(p) ?? []);
  return { edges, order: suggestOrder(summary.files.map((f) => f.path), edges) };
}
