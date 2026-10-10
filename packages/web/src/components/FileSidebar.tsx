import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownUp, GripVertical, List, Network } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useReviewStore } from '../store';
import { clampSidebarWidth, getSidebarWidth, saveSidebarWidth, SIDEBAR_DEFAULT } from '../lib/storage';
import type { FileSummary } from '../types';
import { FileTree, STATUS_STYLE } from './FileTree';

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function SortableFile({
  file,
  selected,
  commentCount,
  onSelect,
}: {
  file: FileSummary;
  selected: boolean;
  commentCount: number;
  onSelect: (path: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.path });
  const st = STATUS_STYLE[file.status] ?? STATUS_STYLE.M;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`list-none ${isDragging ? 'z-10 opacity-60' : ''}`}
    >
      <div
        className={`group flex w-full items-center gap-1 rounded-md border px-1 py-1.5 ${
          selected
            ? 'border-[#1f6feb] bg-[#1f6feb]/15'
            : 'border-transparent hover:border-[#30363d] hover:bg-[#161b22]'
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-[#484f58] opacity-0 focus:opacity-100 group-hover:opacity-100"
          title="拖动调整顺序（键盘：聚焦后空格 + ↑↓ + 空格）"
          aria-label={`调整 ${file.path} 顺序`}
        >
          <GripVertical size={13} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(file.path)}
          title={file.path}
          data-path={file.path}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-5">{basename(file.path)}</span>
            <span className="block truncate text-[11px] leading-4 text-[#8b949e]">
              {dirname(file.path) || '·'}
              {file.status === 'R' && file.oldPath ? ` ← ${file.oldPath}` : ''}
            </span>
          </span>
          {file.binary ? (
            <span className="shrink-0 text-[10px] text-[#8b949e]">BIN</span>
          ) : (
            <span className="shrink-0 font-mono text-[11px]">
              <span className="text-[#3fb950]">+{file.additions}</span>{' '}
              <span className="text-[#f85149]">−{file.deletions}</span>
            </span>
          )}
        </button>
        {commentCount > 0 && (
          <span
            className="shrink-0 rounded-full bg-[#1f6feb]/20 px-1.5 text-[10px] leading-5 text-[#79c0ff]"
            title={`${commentCount} 条评论`}
          >
            💬{commentCount}
          </span>
        )}
      </div>
    </li>
  );
}

export function FileSidebar() {
  const files = useReviewStore((s) => s.files);
  const selected = useReviewStore((s) => s.selected);
  const selectFile = useReviewStore((s) => s.selectFile);
  const reorderFiles = useReviewStore((s) => s.reorderFiles);
  const comments = useReviewStore((s) => s.comments);
  const sidebarMode = useReviewStore((s) => s.sidebarMode);
  const setSidebarMode = useReviewStore((s) => s.setSidebarMode);
  const graph = useReviewStore((s) => s.graph);
  const applySuggestedOrder = useReviewStore((s) => s.applySuggestedOrder);

  // 选中项变化（含跳定义跟随）时滚进视野；平铺与树两种模式的行都挂 data-path
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!selected) return;
    const el = asideRef.current?.querySelector(`[data-path="${window.CSS.escape(selected)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected, sidebarMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [width, setWidth] = useState<number>(() => getSidebarWidth());
  const [dragging, setDragging] = useState(false);

  const applyWidth = (w: number) => {
    const next = clampSidebarWidth(w);
    setWidth(next);
    saveSidebarWidth(next);
  };

  // 侧栏贴视口左缘，clientX 即目标宽度；pointer capture 保证移出手柄仍持续拖拽
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging) setWidth(clampSidebarWidth(e.clientX));
  };
  const onHandleEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    applyWidth(e.clientX);
  };

  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = files.findIndex((f) => f.path === active.id);
    const to = files.findIndex((f) => f.path === over.id);
    if (from < 0 || to < 0) return;
    reorderFiles(arrayMove(files, from, to));
  };

  return (
    <aside
      ref={asideRef}
      style={{ width }}
      className="relative flex shrink-0 flex-col border-r border-[#30363d] bg-[#0d1117]"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#21262d] px-3 text-xs text-[#8b949e]">
        <span className="shrink-0">
          {files.length} 个文件 ·{' '}
          <span className="text-[#3fb950]">+{totalAdd}</span> <span className="text-[#f85149]">−{totalDel}</span>
        </span>
        <div className="flex items-center gap-1">
          {graph && graph.order.length > 0 && sidebarMode === 'list' && (
            <button
              type="button"
              onClick={applySuggestedOrder}
              className="rounded p-1 text-[#6e7681] hover:bg-[#21262d] hover:text-[#79c0ff]"
              title="按调用链推荐排序（拓扑序，导出纪要同步此顺序）"
            >
              <ArrowDownUp size={12} />
            </button>
          )}
          {sidebarMode === 'list' && <span className="text-[10px] text-[#6e7681]">拖动排序</span>}
          <div className="flex items-center rounded border border-[#21262d] p-0.5">
            <button
              type="button"
              onClick={() => setSidebarMode('list')}
              className={`rounded p-0.5 ${sidebarMode === 'list' ? 'bg-[#30363d] text-[#e6edf3]' : 'text-[#6e7681] hover:text-[#e6edf3]'}`}
              title="平铺列表"
              aria-label="切换到平铺列表"
            >
              <List size={12} />
            </button>
            <button
              type="button"
              onClick={() => setSidebarMode('tree')}
              className={`rounded p-0.5 ${sidebarMode === 'tree' ? 'bg-[#30363d] text-[#e6edf3]' : 'text-[#6e7681] hover:text-[#e6edf3]'}`}
              title="调用链树"
              aria-label="切换到调用链树"
            >
              <Network size={12} />
            </button>
          </div>
        </div>
      </div>
      {sidebarMode === 'tree' ? (
        <FileTree />
      ) : (
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={files.map((f) => f.path)} strategy={verticalListSortingStrategy}>
              {files.map((f) => (
                <SortableFile
                  key={f.path}
                  file={f}
                  selected={selected === f.path}
                  commentCount={comments.filter((c) => c.file === f.path).length}
                  onSelect={selectFile}
                />
              ))}
            </SortableContext>
          </DndContext>
        </ul>
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏宽度"
        tabIndex={0}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleEnd}
        onPointerCancel={onHandleEnd}
        onDoubleClick={() => applyWidth(SIDEBAR_DEFAULT)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            applyWidth(width - 16);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            applyWidth(width + 16);
          }
        }}
        title="拖动调整宽度 · 双击恢复默认 · 聚焦后 ←/→ 微调"
        className={`absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none focus-visible:bg-[#1f6feb]/40 focus-visible:outline-none ${
          dragging ? 'bg-[#1f6feb]/50' : 'bg-transparent hover:bg-[#1f6feb]/30'
        }`}
      />
    </aside>
  );
}
