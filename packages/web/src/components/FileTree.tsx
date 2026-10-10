import { ChevronDown, ChevronRight, Check, CornerDownRight, Repeat2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useReviewStore } from '../store';
import type { CallEdge, FileSummary } from '../types';

export const STATUS_STYLE: Record<FileSummary['status'], { label: string; cls: string }> = {
  A: { label: '新增', cls: 'bg-[#1b4721] text-[#3fb950]' },
  M: { label: '修改', cls: 'bg-[#4a3800] text-[#d29922]' },
  D: { label: '删除', cls: 'bg-[#5a1d1f] text-[#f85149]' },
  R: { label: '重命名', cls: 'bg-[#121d3a] text-[#58a6ff]' },
};

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

interface TreeFileNode {
  path: string;
  parent: string | null;
  via: string | null;
  /** 目标出现在祖先链上（互相调用），不再下探 */
  cycle: boolean;
  children: TreeFileNode[];
}

/**
 * 调用链树：根 = 未被其他改动文件调用的文件，子节点 = 该文件调用的其他改动文件。
 * 共享文件在每个调用者下重复出现（已读标记兜底）；只沿改动文件连边，未改动中间层被跨越。
 */
function buildTree(files: FileSummary[], edges: CallEdge[]): TreeFileNode[] {
  const adj = new Map<string, { to: string; via: string }[]>();
  const incoming = new Set<string>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push({ to: e.to, via: e.via });
    incoming.add(e.to);
  }
  // 子节点保持 diff 顺序
  const order = new Map(files.map((f, i) => [f.path, i]));
  for (const list of adj.values()) {
    list.sort((a, b) => (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0));
  }

  const emitted = new Set<string>();
  const make = (path: string, parent: string | null, via: string | null, ancestors: Set<string>): TreeFileNode => {
    emitted.add(path);
    const nextAncestors = new Set(ancestors).add(path);
    const children = (adj.get(path) ?? []).map(({ to, via: childVia }) =>
      nextAncestors.has(to)
        ? { path: to, parent: path, via: childVia, cycle: true, children: [] }
        : make(to, path, childVia, nextAncestors),
    );
    return { path, parent, via, cycle: false, children };
  };

  const roots = files.filter((f) => !incoming.has(f.path)).map((f) => make(f.path, null, null, new Set()));
  // 纯环组件（互相调用、无外部入口）没有自然根：按 diff 顺序取首个作为顶级入口
  const extra = files.filter((f) => !emitted.has(f.path)).map((f) => make(f.path, null, null, new Set()));
  return [...roots, ...extra];
}

function TreeRow({
  node,
  files,
  depth,
}: {
  node: TreeFileNode;
  files: Map<string, FileSummary>;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const selected = useReviewStore((s) => s.selected);
  const selectFile = useReviewStore((s) => s.selectFile);
  const comments = useReviewStore((s) => s.comments);
  const visited = useReviewStore((s) => s.visited);
  const file = files.get(node.path);
  if (!file) return null;
  const st = STATUS_STYLE[file.status] ?? STATUS_STYLE.M;
  const isVisited = visited.has(node.path);
  const commentCount = comments.filter((c) => c.file === node.path).length;
  const hasChildren = node.children.length > 0;
  const viaTitle = node.parent && node.via ? `被 ${basename(node.parent)} 通过 ${node.via}() 调用\n` : '';

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md border px-1 py-1 ${
          selected === node.path
            ? 'border-[#1f6feb] bg-[#1f6feb]/15'
            : 'border-transparent hover:border-[#30363d] hover:bg-[#161b22]'
        }`}
        style={{ marginLeft: depth * 12 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="shrink-0 rounded p-0.5 text-[#484f58] hover:text-[#e6edf3]"
            title={open ? '收起' : '展开'}
            aria-label={`${open ? '收起' : '展开'} ${node.path}`}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}
        <button
          type="button"
          onClick={() => selectFile(node.path)}
          title={`${viaTitle}${node.path}${isVisited ? '\n已看过' : ''}`}
          data-path={node.path}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
          <span
            className={`min-w-0 flex-1 truncate text-[13px] leading-5 ${isVisited ? 'text-[#8b949e]' : 'text-[#e6edf3]'}`}
          >
            {basename(node.path)}
          </span>
          {isVisited && <Check size={11} className="shrink-0 text-[#3fb950]" />}
          {node.cycle && <Repeat2 size={11} className="shrink-0 text-[#d29922]" />}
        </button>
        {file.binary ? (
          <span className="shrink-0 text-[10px] text-[#8b949e]">BIN</span>
        ) : (
          <span className="shrink-0 font-mono text-[11px]">
            <span className="text-[#3fb950]">+{file.additions}</span>{' '}
            <span className="text-[#f85149]">−{file.deletions}</span>
          </span>
        )}
        {commentCount > 0 && (
          <span
            className="shrink-0 rounded-full bg-[#1f6feb]/20 px-1.5 text-[10px] leading-5 text-[#79c0ff]"
            title={`${commentCount} 条评论`}
          >
            💬{commentCount}
          </span>
        )}
      </div>
      {open && hasChildren && (
        <div className="border-l border-[#21262d]" style={{ marginLeft: depth * 12 + 10 }}>
          {node.children.map((child) => (
            <TreeRow key={`${child.parent}>${child.path}`} node={child} files={files} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const files = useReviewStore((s) => s.files);
  const graph = useReviewStore((s) => s.graph);

  const tree = useMemo(() => buildTree(files, graph?.edges ?? []), [files, graph]);
  const filesByName = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const hasEdges = (graph?.edges.length ?? 0) > 0;

  return (
    <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {!hasEdges && (
        <p className="mb-2 flex items-start gap-1 rounded border border-[#21262d] bg-[#11151c] p-2 text-[11px] leading-4 text-[#6e7681]">
          <CornerDownRight size={11} className="mt-0.5 shrink-0" />
          未发现改动文件之间的调用关系（或索引仍在构建），先按 diff 顺序平铺。
        </p>
      )}
      {tree.map((root) => (
        <TreeRow key={root.path} node={root} files={filesByName} depth={0} />
      ))}
    </div>
  );
}
