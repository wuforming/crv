import {
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getCommentPanelCollapsed,
  saveCommentPanelCollapsed,
} from '../lib/storage';
import { useReviewStore } from '../store';
import type { SessionComment } from '../types';
import { Composer, timeLabel } from './Composer';

/** 失效评论卡片：无行内槽位，编辑/删除都在右栏完成。 */
function OrphanedCard({ comment }: { comment: SessionComment }) {
  const deleteComment = useReviewStore((s) => s.deleteComment);
  const editComment = useReviewStore((s) => s.editComment);

  return (
    <div className="rounded-md border border-[#5a1d1f] bg-[#161b22]/60 p-2">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="flex items-center gap-1 rounded bg-[#5a1d1f] px-1.5 py-0.5 text-[10px] text-[#f85149]">
          <TriangleAlert size={10} />
          已失效 L{comment.line}
        </span>
        <span className="text-[10px] text-[#6e7681]">{timeLabel(comment.updatedAt)}</span>
        <span className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => editComment(comment.id)}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
            title="编辑"
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={() => deleteComment(comment.id)}
            className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#f85149]"
            title="删除"
          >
            <Trash2 size={11} />
          </button>
        </span>
      </div>
      <p className="mb-0.5 line-clamp-2 text-[10px] text-[#f85149]/80">代码已变更或移除，确认后删除或重新评论</p>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-4">{comment.text}</p>
    </div>
  );
}

/** 有效评论导航行：点击跳到代码处（行内卡片就在那里）。 */
function NavRow({ comment }: { comment: SessionComment }) {
  const jumpToComment = useReviewStore((s) => s.jumpToComment);
  return (
    <button
      type="button"
      onClick={() => jumpToComment(comment)}
      className="w-full rounded-md border border-transparent px-2 py-1.5 text-left hover:border-[#30363d] hover:bg-[#161b22]"
      title={`${comment.side === 'new' ? '新' : '旧'} L${comment.line} · 点击跳到代码`}
    >
      <span className="mb-0.5 flex items-center gap-2">
        <span className="rounded bg-[#1f6feb]/20 px-1.5 py-0.5 text-[10px] text-[#79c0ff]">
          {comment.side === 'new' ? '新' : '旧'} L{comment.line}
        </span>
        <span className="text-[10px] text-[#6e7681]">{timeLabel(comment.updatedAt)}</span>
      </span>
      <span className="line-clamp-2 block text-[12px] leading-4 text-[#e6edf3]/90">{comment.text}</span>
    </button>
  );
}

export function CommentPanel() {
  const selected = useReviewStore((s) => s.selected);
  const comments = useReviewStore((s) => s.comments);
  const composer = useReviewStore((s) => s.composer);
  const [collapsed, setCollapsed] = useState(() => getCommentPanelCollapsed());

  const fileComments = comments
    .filter((c) => c.file === selected)
    .sort((a, b) =>
      a.orphaned !== b.orphaned ? (a.orphaned ? 1 : -1) : a.side === b.side ? a.line - b.line : a.side === 'old' ? -1 : 1,
    );
  const valid = fileComments.filter((c) => !c.orphaned);
  const orphaned = fileComments.filter((c) => c.orphaned);
  const otherCount = comments.length - fileComments.length;
  // 仅失效评论的编辑留在右栏（无行内槽位）；有效评论的 composer 都在代码行内
  const panelComposer = composer?.editing?.orphaned ? composer : null;

  const applyCollapsed = (next: boolean) => {
    setCollapsed(next);
    saveCommentPanelCollapsed(next);
  };

  // 失效评论的编辑只能在右栏 composer 完成，收起时自动展开
  useEffect(() => {
    if (collapsed && composer?.editing?.orphaned) {
      setCollapsed(false);
      saveCommentPanelCollapsed(false);
    }
  }, [collapsed, composer]);

  if (collapsed) {
    return (
      <aside className="flex w-7 shrink-0 flex-col items-center gap-2 border-l border-[#30363d] bg-[#0d1117] py-2">
        <button
          type="button"
          onClick={() => applyCollapsed(false)}
          className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
          title="展开评论栏"
        >
          <PanelRightOpen size={13} />
        </button>
        {comments.length > 0 && (
          <span
            className="rounded-full bg-[#1f6feb]/20 px-1 text-[10px] leading-4 text-[#79c0ff]"
            title={`${comments.length} 条评论`}
          >
            {comments.length}
          </span>
        )}
      </aside>
    );
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-[#30363d] bg-[#0d1117]">
      <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-[#21262d] px-3 text-xs text-[#8b949e]">
        <MessageSquare size={12} />
        评论 {valid.length}
        {orphaned.length > 0 && <span className="text-[#f85149]">· 失效 {orphaned.length}</span>}
        {otherCount > 0 && <span className="ml-auto text-[10px] text-[#6e7681]">其他文件 {otherCount}</span>}
        <button
          type="button"
          onClick={() => applyCollapsed(true)}
          className={`shrink-0 rounded p-0.5 hover:bg-[#21262d] hover:text-[#e6edf3] ${otherCount > 0 ? '' : 'ml-auto'}`}
          title="收起评论栏"
        >
          <PanelRightClose size={12} />
        </button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
        {panelComposer && <Composer />}
        {!selected ? (
          <p className="p-2 text-xs text-[#6e7681]">选择文件后，点击代码行号在代码旁添加评论</p>
        ) : fileComments.length === 0 && !panelComposer ? (
          <p className="p-2 text-xs text-[#6e7681]">点击代码行号，评论会直接出现在那一行下面</p>
        ) : (
          fileComments.map((c) => (c.orphaned ? <OrphanedCard key={c.id} comment={c} /> : <NavRow key={c.id} comment={c} />))
        )}
      </div>
    </aside>
  );
}
