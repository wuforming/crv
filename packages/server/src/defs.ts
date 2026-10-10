import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { parseFileFacts, treeLangOf } from './tree.js';

export interface Def {
  name: string;
  kind: 'function' | 'class';
  file: string;
  line: number;
}

/** 调用点：谁在哪个文件哪一行调用了某符号 */
export interface RefSite {
  file: string;
  line: number;
}

const MAX_FILES = 4000;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DEFS_PER_SYMBOL = 20;
const MAX_REFS_PER_SYMBOL = 200;
const CACHE_ENTRIES = 4;
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'vendor', '.git', 'target', 'gen', 'bin', '.idea', '.vscode',
]);
const MARKER = '.crv-extracted';

interface IndexEntry {
  defs: Map<string, Def[]>;
  refs: Map<string, RefSite[]>;
  at: number;
}

const cache = new Map<string, IndexEntry>();
const inflight = new Map<string, Promise<IndexEntry>>();

const quote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/** 索引键必须用 commit sha：分支名不变但内容前移时，旧缓存不能命中。 */
async function resolveSha(repo: string, rev: string): Promise<string> {
  try {
    return (await simpleGit(repo).raw(['rev-parse', `${rev}^{commit}`])).trim();
  } catch {
    return rev;
  }
}

const keyOf = (repo: string, sha: string) => `${repo}\0${sha}`;

function extractDir(repo: string, rev: string): string {
  const hash = crypto.createHash('sha1').update(keyOf(repo, rev)).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `crv-defs-${hash}`);
}

/** git archive 一次性导出 rev 快照到临时目录（含标记文件，半截目录不会被复用）。 */
function extractSnapshot(repo: string, rev: string, dir: string): boolean {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const r = spawnSync('sh', ['-c', `git -C ${quote(repo)} archive ${quote(rev)} | tar -x -C ${quote(dir)}`], {
    timeout: 120_000,
  });
  if (r.status !== 0) return false;
  fs.writeFileSync(path.join(dir, MARKER), new Date().toISOString());
  return true;
}

async function collectFacts(dir: string): Promise<{ defs: Map<string, Def[]>; refs: Map<string, RefSite[]> }> {
  const defs = new Map<string, Def[]>();
  const refs = new Map<string, RefSite[]>();
  let count = 0;
  const pushDef = (d: Def) => {
    const list = defs.get(d.name) ?? [];
    if (list.length < MAX_DEFS_PER_SYMBOL) {
      list.push(d);
      defs.set(d.name, list);
    }
  };
  const pushRef = (name: string, site: RefSite) => {
    const list = refs.get(name) ?? [];
    if (list.length < MAX_REFS_PER_SYMBOL) {
      list.push(site);
      refs.set(name, list);
    }
  };
  const walk = async (d: string, rel: string): Promise<void> => {
    if (count > MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (count > MAX_FILES) return;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(path.join(d, e.name), relPath);
        continue;
      }
      if (!e.isFile() || !treeLangOf(e.name)) continue;
      count += 1;
      const full = path.join(d, e.name);
      try {
        const st = fs.statSync(full);
        if (st.size > MAX_FILE_BYTES) continue;
        const content = fs.readFileSync(full, 'utf8');
        const facts = await parseFileFacts(content, treeLangOf(e.name) as string);
        if (!facts) continue;
        for (const r of facts.regions) pushDef({ name: r.name, kind: r.kind, file: relPath, line: r.startLine });
        for (const s of facts.callSites) pushRef(s.name, { file: relPath, line: s.line });
      } catch {
        // 单文件解析失败跳过
      }
    }
  };
  await walk(dir, '');
  return { defs, refs };
}

/** 构建（或复用）repo@rev 的索引：定义 + 反向调用点。rev 支持分支名，内部按解析后的 sha 缓存。 */
export async function ensureEntry(repo: string, rev: string): Promise<IndexEntry> {
  const sha = await resolveSha(repo, rev);
  const key = keyOf(repo, sha);
  const hit = cache.get(key);
  if (hit) {
    hit.at = Date.now();
    return hit;
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<IndexEntry> => {
    const dir = extractDir(repo, sha);
    if (!fs.existsSync(path.join(dir, MARKER))) {
      const ok = extractSnapshot(repo, sha, dir);
      if (!ok) {
        fs.rmSync(dir, { recursive: true, force: true });
        return { defs: new Map(), refs: new Map(), at: Date.now() };
      }
    }
    const { defs, refs } = await collectFacts(dir);
    const entry: IndexEntry = { defs, refs, at: Date.now() };
    cache.set(key, entry);
    while (cache.size > CACHE_ENTRIES) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!oldest) break;
      cache.delete(oldest[0]);
      fs.rmSync(extractDir(repo, oldest[0].split('\0')[1] ?? ''), { recursive: true, force: true });
    }
    return entry;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/** 兼容入口：定义索引（graph.ts 等使用）。 */
export async function ensureDefIndex(repo: string, rev: string): Promise<Map<string, Def[]>> {
  return (await ensureEntry(repo, rev)).defs;
}

export async function findDefs(repo: string, rev: string, symbol: string): Promise<Def[]> {
  if (!/^[$A-Za-z_][$\w]*$/.test(symbol)) return [];
  const entry = await ensureEntry(repo, rev);
  return entry.defs.get(symbol) ?? [];
}

/** 反查调用方：符号在仓库内的调用点（排除定义行本身）。与跳定义同档精度（按名字解析）。 */
export async function findRefs(repo: string, rev: string, symbol: string): Promise<RefSite[]> {
  if (!/^[$A-Za-z_][$\w]*$/.test(symbol)) return [];
  const entry = await ensureEntry(repo, rev);
  const sites = entry.refs.get(symbol) ?? [];
  // 标识符兜底档会把定义行也算进来，剔除与定义重合的站点
  const defSites = new Set((entry.defs.get(symbol) ?? []).map((d) => `${d.file}\0${d.line}`));
  return sites.filter((s) => !defSites.has(`${s.file}\0${s.line}`));
}

/** 返回 repo@rev 快照中某文件的绝对路径（快照缺失时补解包）。不可用返回 null，供调用图等复用快照。 */
export async function snapshotFile(repo: string, rev: string, relPath: string): Promise<string | null> {
  const sha = await resolveSha(repo, rev);
  const dir = extractDir(repo, sha);
  if (!fs.existsSync(path.join(dir, MARKER))) {
    const ok = extractSnapshot(repo, sha, dir);
    if (!ok) {
      fs.rmSync(dir, { recursive: true, force: true });
      return null;
    }
  }
  const full = path.join(dir, relPath);
  if (!path.resolve(full).startsWith(path.resolve(dir) + path.sep)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}
