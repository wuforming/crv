import { useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  Download,
  Loader2,
  MessageSquare,
  MessageSquareOff,
  RefreshCw,
  X,
} from 'lucide-react';
import { useReviewStore } from '../store';
import { api } from '../api';
import { FileSidebar } from './FileSidebar';
import { DiffPane } from './DiffPane';
import { CommentPanel } from './CommentPanel';
import { FileBrowser } from './FileBrowser';

export function ReviewPage() {
  const repo = useReviewStore((s) => s.repo);
  const repoName = useReviewStore((s) => s.repoName);
  const review = useReviewStore((s) => s.review);
  const base = useReviewStore((s) => s.base);
  const back = useReviewStore((s) => s.back);
  const mode = useReviewStore((s) => s.mode);
  const setMode = useReviewStore((s) => s.setMode);
  const jump = useReviewStore((s) => s.jump);
  const fileData = useReviewStore((s) => s.fileData);
  const loadingFile = useReviewStore((s) => s.loadingFile);
  const hunkCursor = useReviewStore((s) => s.hunkCursor);
  const comments = useReviewStore((s) => s.comments);
  const refresh = useReviewStore((s) => s.refresh);
  const refreshing = useReviewStore((s) => s.refreshing);
  const notice = useReviewStore((s) => s.notice);
  const dismissNotice = useReviewStore((s) => s.dismissNotice);
  const navHistory = useReviewStore((s) => s.navHistory);
  const navIndex = useReviewStore((s) => s.navIndex);
  const navBack = useReviewStore((s) => s.navBack);
  const navForward = useReviewStore((s) => s.navForward);
  const activeSymbol = useReviewStore((s) => s.activeSymbol);
  const defsPicker = useReviewStore((s) => s.defsPicker);
  const closePicker = useReviewStore((s) => s.closePicker);
  const jumpDef = useReviewStore((s) => s.jumpDef);
  const gotoFile = useReviewStore((s) => s.gotoFile);
  const summary = useReviewStore((s) => s.summary);
  const commentsVisible = useReviewStore((s) => s.commentsVisible);
  const toggleComments = useReviewStore((s) => s.toggleComments);

  const activeLoc = navHistory[navIndex];
  const inBrowser = activeLoc?.type === 'file';

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => dismissNotice(), 8000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  const hunkTotal = fileData?.hunks.length ?? 0;
  const showJump = Boolean(fileData) && !loadingFile && hunkTotal > 0;
  const cursorLabel = hunkCursor < 0 ? `0/${hunkTotal}` : `${hunkCursor + 1}/${hunkTotal}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return;
      const mod = e.metaKey || e.ctrlKey;
      // ⌘B / Ctrl+B 跳转当前符号定义
      if (mod && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (activeSymbol) jumpDef(activeSymbol);
        return;
      }
      // ⌘[ / ⌘] 或 Ctrl+Alt+←/→ 回退/前进（IDEA 风格）
      if ((e.metaKey && e.key === '[') || (e.ctrlKey && e.altKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        navBack();
        return;
      }
      if ((e.metaKey && e.key === ']') || (e.ctrlKey && e.altKey && e.key === 'ArrowRight')) {
        e.preventDefault();
        navForward();
        return;
      }
      if (e.key === 'Escape') {
        if (defsPicker) closePicker();
        else if (inBrowser) navBack();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        jump(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        jump(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jump, jumpDef, navBack, navForward, activeSymbol, defsPicker, closePicker, inBrowser]);

  const segBtn = (active: boolean) =>
    `rounded px-3 py-1 ${active ? 'bg-[#30363d] text-[#e6edf3]' : 'text-[#8b949e] hover:text-[#e6edf3]'}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[#30363d] bg-[#161b22] px-4">
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-1 rounded-md border border-[#30363d] px-2 py-1 text-xs text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3]"
          title="返回"
        >
          <ArrowLeft size={14} />
          返回
        </button>
        <span className="text-sm font-medium">{repoName}</span>
        <span className="flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-1 text-xs text-[#8b949e]">
          <span>{base}</span>
          <ArrowRight size={11} />
          <span className="text-[#e6edf3]">{review}</span>
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleComments}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              commentsVisible
                ? 'border-[#1f6feb]/60 bg-[#1f6feb]/15 text-[#79c0ff] hover:bg-[#1f6feb]/25'
                : 'border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3]'
            }`}
            title={commentsVisible ? '隐藏代码视图中的评论' : '显示代码视图中的评论'}
          >
            {commentsVisible ? <MessageSquare size={13} /> : <MessageSquareOff size={13} />}
            评论{commentsVisible ? '' : '（隐藏）'}
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-[#30363d] px-2.5 py-1.5 text-xs text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3] disabled:opacity-50"
            title="分支有新提交后重新拉取 diff，评论按内容自动跟随"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            刷新
          </button>
          <a
            href={api.exportUrl(repo, review, base)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              comments.length > 0
                ? 'border-[#238636] bg-[#238636]/20 text-[#3fb950] hover:bg-[#238636]/40'
                : 'border-[#30363d] text-[#8b949e] hover:border-[#8b949e] hover:text-[#e6edf3]'
            }`}
            title={`导出会议纪要（${comments.length} 条评论）`}
          >
            <Download size={13} />
            导出纪要
          </a>
          {showJump && (
            <div className="flex items-center rounded-md border border-[#30363d] p-0.5" title="↑/↓ 跳转改动项">
              <button
                type="button"
                onClick={() => jump(-1)}
                className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
              >
                <ChevronUp size={14} />
              </button>
              <span className="min-w-10 text-center font-mono text-xs text-[#8b949e]">{cursorLabel}</span>
              <button
                type="button"
                onClick={() => jump(1)}
                className="rounded p-1 text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3]"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}
          <div className="flex rounded-md border border-[#30363d] p-0.5 text-xs">
            <button type="button" onClick={() => setMode('focus')} className={segBtn(mode === 'focus')}>
              聚焦改动
            </button>
            <button type="button" onClick={() => setMode('method')} className={segBtn(mode === 'method')} title="每个改动所在的方法整体展开">
              方法视图
            </button>
            <button type="button" onClick={() => setMode('full')} className={segBtn(mode === 'full')}>
              全文件
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-[#30363d] bg-[#161b22] text-xs text-[#e6edf3]">
          <span>{notice}</span>
          <button
            type="button"
            onClick={dismissNotice}
            className="rounded p-0.5 text-[#8b949e] hover:text-[#e6edf3]"
            title="关闭"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <FileSidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{inBrowser ? <FileBrowser /> : <DiffPane />}</div>
          {/* 状态栏：当前符号 + 导航提示 */}
          <div className="flex h-7 shrink-0 items-center gap-3 border-t border-[#30363d] bg-[#161b22] px-3 text-[11px] text-[#8b949e]">
            {activeSymbol ? (
              <span className="flex items-center gap-1 text-[#79c0ff]">
                <CornerDownRight size={11} />
                <span className="code-font">{activeSymbol}</span>
                <span className="text-[#6e7681]">⌘B / ⌘点击 跳转定义</span>
              </span>
            ) : (
              <span>点击代码选中符号 · ⌘点击 跳定义 · 定义上⌘点击 查调用方 · ↑↓ 跳改动 · ⌘[ 返回</span>
            )}
            <span className="ml-auto font-mono text-[10px] text-[#6e7681]">
              {review}@{summary?.reviewSha.slice(0, 8) ?? ''}
            </span>
          </div>
        </main>
        <CommentPanel />

        {/* 多定义 / 多调用方选择器 */}
        {defsPicker && (
          <div className="absolute inset-0 z-20 flex items-start justify-center bg-black/40 pt-24" onClick={closePicker}>
            <div
              className="w-[480px] rounded-lg border border-[#30363d] bg-[#161b22] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[#30363d] px-4 py-2 text-xs text-[#8b949e]">
                "<span className="code-font text-[#79c0ff]">{defsPicker.word}</span>"{' '}
                {defsPicker.type === 'refs'
                  ? `有 ${defsPicker.items.length} 处调用，选择要查看的：`
                  : `有 ${defsPicker.items.length} 个定义，选择要跳转的：`}
              </div>
              <ul className="max-h-72 overflow-y-auto p-1">
                {defsPicker.items.map((item, i) => (
                  <li key={`${item.file}-${item.line}-${i}`}>
                    <button
                      type="button"
                      onClick={() => gotoFile(item.file, item.line, item.label)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-[#1f6feb]/20"
                    >
                      {item.kind ? (
                        <Braces size={13} className={item.kind === 'class' ? 'text-[#d29922]' : 'text-[#3fb950]'} />
                      ) : (
                        <CornerDownRight size={13} className="text-[#79c0ff]" />
                      )}
                      <span className="code-font text-[#e6edf3]">{item.label}</span>
                      <span className="ml-auto truncate text-[11px] text-[#8b949e]">
                        {item.file}:{item.line}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
