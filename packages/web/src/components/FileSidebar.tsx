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
import { GripVertical } from 'lucide-react';
import { useReviewStore } from '../store';
import type { FileSummary } from '../types';

const STATUS_STYLE: Record<FileSummary['status'], { label: string; cls: string }> = {
  A: { label: '新增', cls: 'bg-[#1b4721] text-[#3fb950]' },
  M: { label: '修改', cls: 'bg-[#4a3800] text-[#d29922]' },
  D: { label: '删除', cls: 'bg-[#5a1d1f] text-[#f85149]' },
  R: { label: '重命名', cls: 'bg-[#121d3a] text-[#58a6ff]' },
};

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    <aside className="flex w-72 shrink-0 flex-col border-r border-[#30363d] bg-[#0d1117]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[#21262d] px-3 text-xs text-[#8b949e]">
        <span>
          {files.length} 个文件 ·{' '}
          <span className="text-[#3fb950]">+{totalAdd}</span> <span className="text-[#f85149]">−{totalDel}</span>
        </span>
        <span className="text-[10px] text-[#6e7681]">拖动排序</span>
      </div>
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
    </aside>
  );
}
