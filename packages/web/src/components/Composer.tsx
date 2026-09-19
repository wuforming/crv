import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, Pencil } from 'lucide-react';
import { useReviewStore } from '../store';

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 评论输入框：读全局 composer 状态，渲染在内联槽位或右栏（失效评论编辑）。 */
export function Composer() {
  const composer = useReviewStore((s) => s.composer)!;
  const submitComment = useReviewStore((s) => s.submitComment);
  const cancelComment = useReviewStore((s) => s.cancelComment);
  const [text, setText] = useState(() => composer.editing?.text ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const submit = () => {
    if (!text.trim()) return;
    submitComment(text);
  };

  return (
    <div className="rounded-md border border-[#1f6feb]/60 bg-[#161b22] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[#79c0ff]">
        {composer.editing ? <Pencil size={12} /> : <MessageSquarePlus size={12} />}
        {composer.editing ? '编辑评论' : '添加评论'} · {composer.side === 'old' ? '旧' : '新'} L{composer.line}
      </div>
      <pre className="mb-1.5 max-h-16 overflow-hidden whitespace-pre rounded bg-[#0d1117] p-1.5 code-font text-[11px] leading-4 text-[#8b949e]">
        {composer.snippet}
      </pre>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
        }}
        placeholder="评论内容…（⌘/Ctrl+Enter 提交）"
        className="w-full resize-y rounded border border-[#30363d] bg-[#0d1117] p-2 text-[13px] outline-none focus:border-[#1f6feb]"
      />
      <div className="mt-1.5 flex justify-end gap-2 text-xs">
        <button
          type="button"
          onClick={cancelComment}
          className="rounded border border-[#30363d] px-2.5 py-1 text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="rounded bg-[#238636] px-2.5 py-1 text-white hover:bg-[#2ea043] disabled:opacity-50"
        >
          提交
        </button>
      </div>
    </div>
  );
}
