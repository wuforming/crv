import { create } from 'zustand';
import { api } from './api';
import { tokenizeLines, type LineTokens } from './highlight';
import { getSidebarMode, saveSidebarMode, type SidebarMode } from './lib/storage';
import type { Region } from './lib/rows';
import type { CallGraph, DiffSummary, FileDiff, FileSummary, NavLoc, PickerItem, SessionComment, SessionData } from './types';

export type ViewMode = 'focus' | 'method' | 'full';

export interface LineAnchor {
  side: 'old' | 'new';
  line: number;
  snippet: string;
}

interface ComposerState {
  side: 'old' | 'new';
  line: number;
  snippet: string;
  editing: SessionComment | null;
}

/** 会话保存的顺序应用于当前 diff 文件列表：已保存的按序在前，新出现的文件追加到末尾。 */
function applyOrder(files: FileSummary[], order: string[] | null): FileSummary[] {
  if (!order || order.length === 0) return files;
  const ordered = order
    .map((p) => files.find((f) => f.path === p))
    .filter((f): f is FileSummary => Boolean(f));
  const rest = files.filter((f) => !order.includes(f.path));
  return [...ordered, ...rest];
}

interface ReviewStore {
  repo: string;
  repoName: string;
  review: string;
  base: string;
  summary: DiffSummary | null;
  files: FileSummary[];
  selected: string | null;
  loadingFile: boolean;
  fileData: FileDiff | null;
  newContent: string | null;
  newTokens: LineTokens[];
  oldTokens: LineTokens[];
  mode: ViewMode;
  hunkCursor: number;
  flash: { idx: number; ts: number } | null;
  pendingScroll: { hunk: number; ts: number } | null;
  expandedGaps: Record<number, number>;
  comments: SessionComment[];
  composer: ComposerState | null;
  flashLine: { side: 'old' | 'new'; line: number; ts: number } | null;
  pendingLine: { side: 'old' | 'new'; line: number; ts: number } | null;
  regions: Region[];
  methodExpand: Record<number, boolean>;
  refreshing: boolean;
  notice: string | null;
  navHistory: NavLoc[];
  navIndex: number;
  activeSymbol: string | null;
  defsPicker: { word: string; type: 'defs' | 'refs'; items: PickerItem[] } | null;
  jumping: boolean;
  commentsVisible: boolean;
  sidebarMode: SidebarMode;
  graph: CallGraph | null;
  /** 本会话内打开过 diff 的文件（树模式的已读标记） */
  visited: Set<string>;

  start: (p: {
    repo: string;
    repoName: string;
    review: string;
    base: string;
    summary: DiffSummary;
    session: SessionData | null;
  }) => void;
  back: () => void;
  selectFile: (path: string) => Promise<void>;
  setMode: (m: ViewMode) => void;
  setSidebarMode: (m: SidebarMode) => void;
  loadGraph: () => Promise<void>;
  applySuggestedOrder: () => void;
  jump: (dir: 1 | -1) => void;
  expandGap: (id: number) => void;
  setPendingScroll: (p: { hunk: number; ts: number } | null) => void;
  setPendingLine: (p: { side: 'old' | 'new'; line: number; ts: number } | null) => void;
  reorderFiles: (files: FileSummary[]) => void;
  beginComment: (a: LineAnchor) => void;
  cancelComment: () => void;
  submitComment: (text: string) => void;
  editComment: (id: string) => void;
  deleteComment: (id: string) => void;
  jumpToComment: (c: SessionComment) => void;
  toggleMethodExpand: (hunkIdx: number) => void;
  refresh: () => Promise<void>;
  dismissNotice: () => void;
  jumpDef: (word: string, at?: { file: string | null; line: number | null }) => Promise<void>;
  gotoFile: (file: string, line: number, label: string) => void;
  navBack: () => void;
  navForward: () => void;
  setActiveSymbol: (word: string | null) => void;
  closePicker: () => void;
  toggleComments: () => void;
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  repo: '',
  repoName: '',
  review: '',
  base: '',
  summary: null,
  files: [],
  selected: null,
  loadingFile: false,
  fileData: null,
  newContent: null,
  newTokens: [],
  oldTokens: [],
  mode: 'focus',
  hunkCursor: -1,
  flash: null,
  pendingScroll: null,
  expandedGaps: {},
  comments: [],
  composer: null,
  flashLine: null,
  pendingLine: null,
  regions: [],
  methodExpand: {},
  refreshing: false,
  notice: null,
  navHistory: [{ type: 'diff' }],
  navIndex: 0,
  activeSymbol: null,
  defsPicker: null,
  jumping: false,
  commentsVisible: true,
  sidebarMode: getSidebarMode(),
  graph: null,
  visited: new Set<string>(),

  start: (p) => {
    set({
      repo: p.repo,
      repoName: p.repoName,
      review: p.review,
      base: p.base,
      summary: p.summary,
      files: applyOrder(p.summary.files, p.session?.fileOrder ?? null),
      comments: p.session?.comments ?? [],
      selected: null,
      fileData: null,
      hunkCursor: -1,
      expandedGaps: {},
      composer: null,
      flashLine: null,
      pendingLine: null,
      navHistory: [{ type: 'diff' }],
      navIndex: 0,
      activeSymbol: null,
      defsPicker: null,
      commentsVisible: true,
      graph: null,
      visited: new Set<string>(),
    });
    // 空闲时预热定义索引与调用链图，让第一次 ⌘点击 / 树模式 秒开
    const { repo, review } = get();
    setTimeout(() => {
      api.prefetchIndex(repo, review);
      get().loadGraph();
    }, 1500);
  },

  back: () => set({ summary: null, files: [], selected: null, fileData: null, composer: null, comments: [] }),

  selectFile: async (path) => {
    const { repo, review, base } = get();
    set({
      selected: path,
      loadingFile: true,
      fileData: null,
      hunkCursor: -1,
      expandedGaps: {},
      methodExpand: {},
      regions: [],
      composer: null,
      flashLine: null,
      pendingLine: null,
      visited: new Set(get().visited).add(path),
      // 点文件 = 回到评审该文件的 diff；从跳定义的只读视图里被点击时由此退出浏览器模式
      navHistory: [{ type: 'diff' }],
      navIndex: 0,
    });
    try {
      const fd = await api.fileDiff(repo, review, base, path);
      if (fd.isBinary) {
        set({ fileData: fd, newContent: null, newTokens: [], oldTokens: [], loadingFile: false });
        return;
      }
      const sum = get().files.find((f) => f.path === path);
      const needOld = Boolean(fd.isDeleted) || (sum?.deletions ?? 0) > 0;
      const [newContent, oldContent, regions] = await Promise.all([
        fd.isDeleted ? Promise.resolve(null) : api.fileContent(repo, review, path),
        needOld ? api.fileContent(repo, base, fd.oldPath ?? path) : Promise.resolve(null),
        api.treeRegions(repo, review, path).catch(() => [] as Region[]),
      ]);
      const [nt, ot] = await Promise.all([
        tokenizeLines(newContent ?? '', path),
        oldContent ? tokenizeLines(oldContent, fd.oldPath ?? path) : Promise.resolve([]),
      ]);
      set({ fileData: fd, newContent, newTokens: nt, oldTokens: ot, regions, loadingFile: false });
    } catch (e) {
      console.error('加载文件失败', e);
      set({ loadingFile: false });
    }
  },

  setMode: (m) => set({ mode: m, hunkCursor: -1, flash: null, pendingScroll: null }),

  setSidebarMode: (m) => {
    set({ sidebarMode: m });
    saveSidebarMode(m);
  },

  loadGraph: async () => {
    const { repo, review, base } = get();
    try {
      const graph = await api.graph(repo, review, base);
      // 会话已切换时丢弃过期结果
      if (get().repo === repo && get().review === review && get().base === base) set({ graph });
    } catch {
      // 调用链是纯导航增强，失败静默降级为无图
    }
  },

  // 按调用链拓扑序回填文件顺序（走 saveOrder 持久化，导出纪要按此分节）
  applySuggestedOrder: () => {
    const { graph, files } = get();
    if (!graph || graph.order.length === 0) return;
    const rank = new Map(graph.order.map((p, i) => [p, i]));
    const inGraph = files.filter((f) => rank.has(f.path)).sort((a, b) => rank.get(a.path)! - rank.get(b.path)!);
    const rest = files.filter((f) => !rank.has(f.path));
    if (inGraph.length) get().reorderFiles([...inGraph, ...rest]);
  },

  jump: (dir) => {
    const { fileData, hunkCursor, mode } = get();
    const total = fileData?.hunks.length ?? 0;
    if (!total) return;
    const next =
      hunkCursor < 0 ? (dir === 1 ? 0 : total - 1) : Math.min(total - 1, Math.max(0, hunkCursor + dir));
    set({ hunkCursor: next, flash: { idx: next, ts: Date.now() } });
    if (mode === 'full') {
      set({ pendingScroll: { hunk: next, ts: Date.now() } });
    } else {
      document.getElementById(`hunk-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  expandGap: (id) => set((s) => ({ expandedGaps: { ...s.expandedGaps, [id]: (s.expandedGaps[id] ?? 0) + 1 } })),

  setPendingScroll: (p) => set({ pendingScroll: p }),
  setPendingLine: (p) => set({ pendingLine: p }),

  reorderFiles: (files) => {
    set({ files });
    const { repo, review, base, summary } = get();
    if (!summary) return;
    api
      .saveOrder(repo, review, base, files.map((f) => f.path), summary.baseSha, summary.reviewSha)
      .catch((e) => console.error('保存文件顺序失败', e));
  },

  // 隐藏评论时点行号 = 明确要评论 → 自动恢复显示
  beginComment: (a) => set({ commentsVisible: true, composer: { side: a.side, line: a.line, snippet: a.snippet, editing: null } }),
  cancelComment: () => set({ composer: null }),

  submitComment: (text) => {
    const { composer, comments, selected } = get();
    const trimmed = text.trim();
    if (!composer || !trimmed) return;
    const now = new Date().toISOString();
    let next: SessionComment[];
    if (composer.editing) {
      next = comments.map((c) => (c.id === composer.editing?.id ? { ...c, text: trimmed, updatedAt: now } : c));
    } else {
      next = [
        ...comments,
        {
          id: crypto.randomUUID(),
          file: selected ?? '',
          side: composer.side,
          line: composer.line,
          snippet: composer.snippet,
          contentHash: '',
          text: trimmed,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    set({ comments: next, composer: null });
    const { repo, review, base, summary } = get();
    if (!summary) return;
    api
      .saveComments(repo, review, base, next, summary.baseSha, summary.reviewSha)
      .catch((e) => console.error('保存评论失败', e));
  },

  editComment: (id) => {
    const c = get().comments.find((x) => x.id === id);
    if (!c) return;
    set({ composer: { side: c.side, line: c.line, snippet: c.snippet, editing: c } });
  },

  deleteComment: (id) => {
    const next = get().comments.filter((c) => c.id !== id);
    set({ comments: next, composer: null });
    const { repo, review, base, summary } = get();
    if (!summary) return;
    api
      .saveComments(repo, review, base, next, summary.baseSha, summary.reviewSha)
      .catch((e) => console.error('删除评论失败', e));
  },

  jumpToComment: (c) => {
    set({
      mode: 'full',
      hunkCursor: -1,
      flashLine: { side: c.side, line: c.line, ts: Date.now() },
      pendingLine: { side: c.side, line: c.line, ts: Date.now() },
    });
  },

  toggleMethodExpand: (hunkIdx) =>
    set((s) => ({ methodExpand: { ...s.methodExpand, [hunkIdx]: true } })),

  refresh: async () => {
    const { repo, review, base, comments, files, selected } = get();
    set({ refreshing: true });
    try {
      const res = await api.refresh(repo, review, base, comments);
      const prevPaths = files.map((f) => f.path);
      const newPaths = res.summary.files.map((f) => f.path);
      const added = newPaths.filter((p) => !prevPaths.includes(p));
      const removed = prevPaths.filter((p) => !newPaths.includes(p));
      set({
        summary: res.summary,
        files: applyOrder(res.summary.files, prevPaths),
        comments: res.comments,
        methodExpand: {},
        expandedGaps: {},
        notice: [
          `评论 ${res.stats.kept} 保留 / ${res.stats.moved} 跟随移动 / ${res.stats.orphaned} 失效`,
          added.length ? `新增 ${added.length} 文件` : '',
          removed.length ? `${removed.length} 文件移出` : '',
        ]
          .filter(Boolean)
          .join('，'),
      });
      if (selected && newPaths.includes(selected)) {
        await get().selectFile(selected);
      } else {
        set({ selected: null, fileData: null });
      }
      get().loadGraph();
    } catch (e) {
      set({ notice: `刷新失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      set({ refreshing: false });
    }
  },

  dismissNotice: () => set({ notice: null }),

  jumpDef: async (word, at) => {
    const { repo, review, jumping } = get();
    if (jumping) return;
    set({ activeSymbol: word, jumping: true });
    try {
      const defs = await api.defs(repo, review, word);
      // 点在定义行上 = 已经在定义处：反查调用方（IDEA 风格 Find Usages）
      const atFile = at?.file ?? null;
      const atLine = at?.line ?? null;
      const onDef = atFile !== null && atLine !== null && defs.some((d) => d.file === atFile && d.line === atLine);
      if (onDef) {
        const refs = await api.refs(repo, review, word);
        if (refs.length === 0) {
          set({ notice: `"${word}" 没有找到调用方（索引覆盖函数/类/方法调用点）` });
          return;
        }
        if (refs.length === 1) {
          get().gotoFile(refs[0].file, refs[0].line, word);
          return;
        }
        set({
          defsPicker: { word, type: 'refs', items: refs.map((r) => ({ file: r.file, line: r.line, label: word })) },
        });
        return;
      }
      if (defs.length === 0) {
        set({ notice: `未找到 "${word}" 的定义（索引覆盖函数/类/方法声明）` });
        return;
      }
      if (defs.length === 1) {
        get().gotoFile(defs[0].file, defs[0].line, defs[0].name);
        return;
      }
      set({
        defsPicker: {
          word,
          type: 'defs',
          items: defs.map((d) => ({ file: d.file, line: d.line, label: d.name, kind: d.kind })),
        },
      });
    } catch (e) {
      set({ notice: `跳转失败：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      set({ jumping: false });
    }
  },

  gotoFile: (file, line, label) => {
    // 侧栏跟随：目标在改动清单里就选中（预载 diff，Esc 返回时直接就绪）；不在清单（未改动文件）则保持原选中
    if (get().files.some((f) => f.path === file) && get().selected !== file) {
      get().selectFile(file);
    }
    const history: NavLoc[] = [{ type: 'diff' }, { type: 'file', file, line, label }];
    set({ navHistory: history, navIndex: history.length - 1, defsPicker: null });
  },

  navBack: () => {
    const { navIndex } = get();
    if (navIndex > 0) set({ navIndex: navIndex - 1, defsPicker: null });
  },

  navForward: () => {
    const { navHistory, navIndex } = get();
    if (navIndex < navHistory.length - 1) set({ navIndex: navIndex + 1, defsPicker: null });
  },

  setActiveSymbol: (word) => set({ activeSymbol: word }),

  closePicker: () => set({ defsPicker: null }),

  toggleComments: () => set((s) => ({ commentsVisible: !s.commentsVisible, composer: s.commentsVisible ? null : s.composer })),
}));
