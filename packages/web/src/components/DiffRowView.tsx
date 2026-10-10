import { ChevronDown } from 'lucide-react';
import type { DiffRow } from '../lib/rows';
import { useReviewStore, type LineAnchor } from '../store';
import { wordAtPoint } from '../lib/wordAt';
import { InlineCommentBlock } from './InlineCommentBlock';

const DEFAULT_COLOR = '#e6edf3';

export interface DiffRowViewProps {
  row: DiffRow;
  flashTs: number | null;
  onGap: (id: number) => void;
  onLineClick?: (a: LineAnchor) => void;
  commentCountFor?: (side: 'old' | 'new', line: number | undefined) => number;
  lineFlash?: { side: 'old' | 'new'; line: number; ts: number } | null;
}

export function DiffRowView({ row, flashTs, onGap, onLineClick, commentCountFor, lineFlash }: DiffRowViewProps) {
  const jumpDef = useReviewStore((s) => s.jumpDef);
  const setActiveSymbol = useReviewStore((s) => s.setActiveSymbol);
  const selected = useReviewStore((s) => s.selected);

  const onCodeClick = (e: React.MouseEvent) => {
    const word = wordAtPoint(e.clientX, e.clientY);
    if (!word) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      // 带上点击位置：点在定义行上时反查调用方；del 行只有旧侧行号（与新基准不易匹配，自然退回跳定义）
      const line = row.kind === 'del' ? row.oldNo : row.kind === 'ctx' || row.kind === 'add' ? row.newNo : undefined;
      jumpDef(word, { file: selected, line: line ?? null });
    } else {
      setActiveSymbol(word);
    }
  };

  if (row.kind === 'gap') {
    return (
      <button
        type="button"
        onClick={() => onGap(row.id)}
        className="flex h-6 w-max min-w-full items-center gap-2 border-y border-[#21262d] bg-[#11151c] px-6 text-[11px] text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
      >
        <ChevronDown size={12} />
        ⋯ 隐藏 {row.hidden} 行 · 点击展开上下文
      </button>
    );
  }

  if (row.kind === 'comment') {
    return <InlineCommentBlock slot={row} />;
  }

  const lineFlashing =
    lineFlash &&
    ((lineFlash.side === 'old' && row.oldNo === lineFlash.line) ||
      (lineFlash.side === 'new' && row.newNo === lineFlash.line));
  const bg = row.kind === 'add' ? 'bg-[#0d4429]' : row.kind === 'del' ? 'bg-[#67060c]' : '';
  const flash = (row.hunkIdx !== undefined && flashTs !== null) || Boolean(lineFlashing);
  const sign = row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : '';
  const signCls = row.kind === 'add' ? 'text-[#3fb950]' : row.kind === 'del' ? 'text-[#f85149]' : '';

  const oldClick =
    row.oldNo !== undefined && onLineClick
      ? () => onLineClick({ side: 'old', line: row.oldNo as number, snippet: row.text })
      : undefined;
  const newClick =
    row.newNo !== undefined && onLineClick
      ? () => onLineClick({ side: 'new', line: row.newNo as number, snippet: row.text })
      : undefined;
  const gutterCls = 'cursor-pointer hover:bg-[#1f6feb] hover:text-white';
  const oldCount = commentCountFor?.('old', row.oldNo) ?? 0;
  const newCount = commentCountFor?.('new', row.newNo) ?? 0;
  const commentCount = Math.max(oldCount, newCount);

  const words = row.words;
  const side = row.kind === 'del' ? 'del' : 'add';

  return (
    <div
      className={`flex h-6 items-center whitespace-pre code-font text-[13px] leading-6 w-max min-w-full ${bg} ${
        flash ? 'flash-row' : ''
      }`}
    >
      <span
        onClick={oldClick}
        title={oldClick ? '点击添加评论' : undefined}
        className={`w-12 shrink-0 select-none border-r border-[#21262d] bg-[#0d1117] pr-2 text-right font-mono text-[11px] leading-6 text-[#6e7681] ${
          oldClick ? gutterCls : ''
        }`}
      >
        {row.oldNo ?? ''}
      </span>
      <span
        onClick={newClick}
        title={newClick ? '点击添加评论' : undefined}
        className={`w-12 shrink-0 select-none border-r border-[#21262d] bg-[#0d1117] pr-2 text-right font-mono text-[11px] leading-6 text-[#6e7681] ${
          newClick ? gutterCls : ''
        }`}
      >
        {row.newNo ?? ''}
      </span>
      <span className={`w-6 shrink-0 select-none text-center font-mono text-[11px] leading-6 ${signCls}`}>{sign}</span>
      <code className="cursor-text px-3" onClick={onCodeClick}>
        {words
          ? words
              .filter((w) => w.kind !== (side === 'del' ? 'add' : 'del'))
              .map((w, i) => (
                <span
                  key={i}
                  style={{ color: DEFAULT_COLOR }}
                  className={
                    w.kind === 'same'
                      ? ''
                      : side === 'del'
                        ? 'rounded-[2px] bg-[#f85149]/50'
                        : 'rounded-[2px] bg-[#3fb950]/50'
                  }
                >
                  {w.value}
                </span>
              ))
          : (row.tokens ?? [{ content: row.text || ' ', color: DEFAULT_COLOR }]).map((t, i) => (
              <span key={i} style={{ color: t.color }}>
                {t.content || ' '}
              </span>
            ))}
      </code>
      {commentCount > 0 && (
        <span
          className="ml-3 mr-2 shrink-0 rounded-full bg-[#1f6feb]/20 px-2 text-[10px] leading-5 text-[#79c0ff]"
          title={`${commentCount} 条评论`}
        >
          💬 {commentCount}
        </span>
      )}
    </div>
  );
}
