import { Pencil, Trash2 } from 'lucide-react';
import { useReviewStore } from '../store';
import type { CommentSlotRow } from '../lib/rows';
import type { SessionComment } from '../types';
import { Composer, timeLabel } from './Composer';

function InlineCard({ comment }: { comment: SessionComment }) {
  const editComment = useReviewStore((s) => s.editComment);
  const deleteComment = useReviewStore((s) => s.deleteComment);

  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-2">
      <div className="mb-0.5 flex items-center gap-2">
        <span className="rounded bg-[#1f6feb]/20 px-1.5 py-0.5 text-[10px] text-[#79c0ff]">
          {comment.side === 'new' ? '新' : '旧'} L{comment.line}
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
      <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{comment.text}</p>
    </div>
  );
}

/** 锚定行下方的内联评论块：卡片随代码滚动、折叠；composer 就地展开。 */
export function InlineCommentBlock({ slot }: { slot: CommentSlotRow }) {
  return (
    <div className="sticky left-0 my-1 w-[min(44rem,85vw)] min-w-[22rem] space-y-1.5 border-l-2 border-[#1f6feb]/70 bg-[#161b22]/95 p-2 shadow-md">
      {slot.composer && <Composer />}
      {slot.comments.map((c) => (
        <InlineCard key={c.id} comment={c} />
      ))}
    </div>
  );
}
