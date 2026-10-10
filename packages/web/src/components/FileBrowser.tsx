import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowLeft, ArrowRight, BookOpen, CornerUpLeft } from 'lucide-react';
import { useReviewStore } from '../store';
import { api } from '../api';
import { tokenizeLines, type LineTokens } from '../highlight';
import { wordAtPoint } from '../lib/wordAt';

const ROW_HEIGHT = 24;
const DEFAULT_COLOR = '#e6edf3';

/**
 * 任意文件只读浏览器（跳转定义的落地页）：
 * 虚拟滚动 + 语法高亮 + 定位到目标行并闪烁；⌘点击可继续跳转，⌘[ 返回。
 */
export function FileBrowser() {
  const loc = useReviewStore((s) => s.navHistory[s.navIndex]);
  const navHistoryLen = useReviewStore((s) => s.navHistory.length);
  const navIndex = useReviewStore((s) => s.navIndex);
  const navBack = useReviewStore((s) => s.navBack);
  const navForward = useReviewStore((s) => s.navForward);
  const repo = useReviewStore((s) => s.repo);
  const review = useReviewStore((s) => s.review);
  const jumpDef = useReviewStore((s) => s.jumpDef);
  const setActiveSymbol = useReviewStore((s) => s.setActiveSymbol);

  const file = loc?.type === 'file' ? loc.file : null;
  const targetLine = loc?.type === 'file' ? loc.line : 0;
  const targetTs = navIndex;

  const [tokens, setTokens] = useState<LineTokens[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const content = await api.fileContent(repo, review, file);
      const t = await tokenizeLines(content ?? '', file);
      if (alive) {
        setTokens(t);
        setLoading(false);
      }
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [repo, review, file]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: tokens.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  // 文件加载完成后定位目标行
  useEffect(() => {
    if (loading || targetLine <= 0 || tokens.length === 0) return;
    virtualizer.scrollToIndex(Math.min(targetLine, tokens.length) - 1, { align: 'center' });
  }, [loading, tokens.length, targetLine, targetTs, virtualizer]);

  const onCodeClick = (e: React.MouseEvent, lineNo: number) => {
    const word = wordAtPoint(e.clientX, e.clientY);
    if (!word) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      // 带上点击位置：点在定义行上时反查调用方
      jumpDef(word, { file, line: lineNo });
    } else {
      setActiveSymbol(word);
    }
  };

  const rows = virtualizer.getVirtualItems();
  const canBack = navIndex > 0;
  const canForward = navIndex < navHistoryLen - 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[#30363d] bg-[#161b22] px-3 text-xs">
        <button
          type="button"
          onClick={navBack}
          disabled={!canBack}
          className="flex items-center gap-1 rounded border border-[#30363d] px-2 py-1 text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3] disabled:opacity-40"
          title="返回（⌘[）"
        >
          <ArrowLeft size={12} />
          返回
        </button>
        <button
          type="button"
          onClick={navForward}
          disabled={!canForward}
          className="rounded border border-[#30363d] p-1 text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3] disabled:opacity-40"
          title="前进（⌘]）"
        >
          <ArrowRight size={12} />
        </button>
        <span className="flex min-w-0 items-center gap-1.5 text-[#79c0ff]">
          <BookOpen size={12} className="shrink-0" />
          <span className="truncate code-font" title={file ?? ''}>
            {file}
          </span>
          {targetLine > 0 && <span className="shrink-0 text-[#8b949e]">:L{targetLine}</span>}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-[#6e7681]">
          <CornerUpLeft size={10} />
          只读 · ⌘点击 继续跳转 · ⌘[ 返回
        </span>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[#8b949e]">加载中…</div>
        ) : (
          <div className="relative w-max min-w-full" style={{ height: virtualizer.getTotalSize() }}>
            {rows.map((v) => {
              const lineNo = v.index + 1;
              const isTarget = lineNo === targetLine;
              return (
                <div
                  key={`${v.key}-${isTarget ? `t${targetTs}` : ''}`}
                  className={`absolute left-0 top-0 flex h-6 w-max min-w-full items-center whitespace-pre code-font text-[13px] leading-6 ${
                    isTarget ? 'flash-row' : ''
                  }`}
                  style={{ transform: `translateY(${v.start}px)` }}
                >
                  <span className="w-12 shrink-0 select-none border-r border-[#21262d] bg-[#0d1117] pr-2 text-right font-mono text-[11px] text-[#6e7681]">
                    {lineNo}
                  </span>
                  <code className="px-3" onClick={(e) => onCodeClick(e, lineNo)}>
                    {(tokens[v.index] ?? [{ content: '', color: DEFAULT_COLOR }]).map((t, i) => (
                      <span key={i} style={{ color: t.color }} className="cursor-text">
                        {t.content || ' '}
                      </span>
                    ))}
                  </code>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
