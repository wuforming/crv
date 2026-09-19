import { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReviewStore } from '../store';
import { buildDiffRows, type DiffRow } from '../lib/rows';
import { DiffRowView, type DiffRowViewProps } from './DiffRowView';

const ROW_HEIGHT = 24;

type ExtraProps = Pick<DiffRowViewProps, 'onLineClick' | 'commentCountFor'>;

/** 行元素稳定 key：动态测高（measureElement）依赖它跨渲染保持测量值。 */
function rowKey(r: DiffRow, i: number): string {
  if (r.kind === 'comment') return `c:${r.side}:${r.line}`;
  if (r.kind === 'gap') return `g:${r.id}`;
  if (r.kind === 'del') return `d:${r.oldNo}`;
  if (r.kind === 'add') return `a:${r.newNo}`;
  return `x:${r.newNo ?? i}`;
}

export function FullFileMode({ onLineClick, commentCountFor }: ExtraProps) {
  const fileData = useReviewStore((s) => s.fileData)!;
  const newContent = useReviewStore((s) => s.newContent);
  const newTokens = useReviewStore((s) => s.newTokens);
  const oldTokens = useReviewStore((s) => s.oldTokens);
  const flash = useReviewStore((s) => s.flash);
  const flashLine = useReviewStore((s) => s.flashLine);
  const pendingScroll = useReviewStore((s) => s.pendingScroll);
  const setPendingScroll = useReviewStore((s) => s.setPendingScroll);
  const pendingLine = useReviewStore((s) => s.pendingLine);
  const setPendingLine = useReviewStore((s) => s.setPendingLine);
  const selected = useReviewStore((s) => s.selected);
  const allComments = useReviewStore((s) => s.comments);
  const composerState = useReviewStore((s) => s.composer);
  const commentsVisible = useReviewStore((s) => s.commentsVisible);
  const inlineComments = useMemo(
    () => (commentsVisible ? allComments.filter((c) => !c.orphaned && c.file === selected) : []),
    [allComments, selected, commentsVisible],
  );
  const composerAnchor =
    commentsVisible && composerState && !composerState.editing?.orphaned
      ? { side: composerState.side, line: composerState.line }
      : null;

  const totalNew = useMemo(
    () => (newContent ? newContent.split('\n').length - (newContent.endsWith('\n') ? 1 : 0) : 0),
    [newContent],
  );

  const rows = useMemo(
    () =>
      buildDiffRows({
        hunks: fileData.hunks,
        totalNew,
        newTokens,
        oldTokens,
        ctx: Number.MAX_SAFE_INTEGER,
        inlineComments,
        composerAnchor,
      }),
    [fileData, totalNew, newTokens, oldTokens, inlineComments, composerAnchor],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    getItemKey: (i) => rowKey(rows[i], i),
  });

  useEffect(() => {
    if (!pendingScroll) return;
    const idx = rows.findIndex((r) => r.kind !== 'gap' && r.kind !== 'comment' && r.hunkIdx === pendingScroll.hunk);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'start' });
    setPendingScroll(null);
  }, [pendingScroll, rows, virtualizer, setPendingScroll]);

  useEffect(() => {
    if (!pendingLine) return;
    const idx = rows.findIndex(
      (r) =>
        r.kind !== 'gap' &&
        r.kind !== 'comment' &&
        (pendingLine.side === 'new' ? r.newNo === pendingLine.line : r.oldNo === pendingLine.line),
    );
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
    setPendingLine(null);
  }, [pendingLine, rows, virtualizer, setPendingLine]);

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="relative w-max min-w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          const codeRow = row.kind === 'ctx' || row.kind === 'add' || row.kind === 'del' ? row : null;
          const hunkFlashing = flash && codeRow !== null && codeRow.hunkIdx === flash.idx;
          const lineFlashing =
            flashLine !== null &&
            codeRow !== null &&
            ((flashLine.side === 'old' && codeRow.oldNo === flashLine.line) ||
              (flashLine.side === 'new' && codeRow.newNo === flashLine.line));
          return (
            <div
              key={`${v.key}-${hunkFlashing ? `h${flash?.ts}` : ''}-${lineFlashing ? `l${flashLine?.ts}` : ''}`}
              data-index={v.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-max min-w-full"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              <DiffRowView
                row={row}
                flashTs={hunkFlashing && flash ? flash.ts : null}
                onGap={() => {}}
                onLineClick={onLineClick}
                commentCountFor={commentCountFor}
                lineFlash={lineFlashing && flashLine ? flashLine : null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
