import { useMemo } from 'react';
import { Braces, UnfoldVertical } from 'lucide-react';
import { useReviewStore } from '../store';
import { buildDiffRows, computeCoverage, enclosingRegion, rangeAt, type Region } from '../lib/rows';
import { DiffRowView, type DiffRowViewProps } from './DiffRowView';

type ExtraProps = Pick<DiffRowViewProps, 'onLineClick' | 'commentCountFor'>;

/** hunk 区块头下方的"展开整个方法"条：方法范围未被当前可见范围完全覆盖时显示。 */
function MethodBar({
  hunkIdx,
  region,
  hiddenBefore,
  hiddenAfter,
}: {
  hunkIdx: number;
  region: Region;
  hiddenBefore: number;
  hiddenAfter: number;
}) {
  const toggleMethodExpand = useReviewStore((s) => s.toggleMethodExpand);
  return (
    <button
      type="button"
      onClick={() => toggleMethodExpand(hunkIdx)}
      className="flex w-full items-center gap-2 border-b border-[#30363d] bg-[#12181f] px-3 py-1 text-left text-[11px] text-[#58a6ff] hover:bg-[#1a2233]"
      title={`展开 ${region.name} 的完整定义（L${region.startLine}–L${region.endLine}）`}
    >
      <UnfoldVertical size={12} />
      <span>
        展开整个方法 · <span className="code-font">{region.name}</span>（L{region.startLine}–L{region.endLine}）
      </span>
      <span className="ml-auto flex gap-2 text-[10px] text-[#8b949e]">
        {hiddenBefore > 0 && <span>上方藏 {hiddenBefore} 行</span>}
        {hiddenAfter > 0 && <span>下方藏 {hiddenAfter} 行</span>}
      </span>
    </button>
  );
}

export function FocusMode({ onLineClick, commentCountFor }: ExtraProps) {
  const fileData = useReviewStore((s) => s.fileData)!;
  const newContent = useReviewStore((s) => s.newContent);
  const newTokens = useReviewStore((s) => s.newTokens);
  const oldTokens = useReviewStore((s) => s.oldTokens);
  const expandedGaps = useReviewStore((s) => s.expandedGaps);
  const expandGap = useReviewStore((s) => s.expandGap);
  const flash = useReviewStore((s) => s.flash);
  const regions = useReviewStore((s) => s.regions);
  const methodExpand = useReviewStore((s) => s.methodExpand);
  const mode = useReviewStore((s) => s.mode);
  const expandAllMethods = mode === 'method';
  const selected = useReviewStore((s) => s.selected);
  const allComments = useReviewStore((s) => s.comments);
  const composerState = useReviewStore((s) => s.composer);
  const commentsVisible = useReviewStore((s) => s.commentsVisible);
  const inlineComments = useMemo(
    () => (commentsVisible ? allComments.filter((c) => !c.orphaned && c.file === selected) : []),
    [allComments, selected, commentsVisible],
  );
  // 失效评论的编辑仍由右栏承载，不占行内槽位；隐藏评论时 composer 一并隐藏
  const composerAnchor =
    commentsVisible && composerState && !composerState.editing?.orphaned
      ? { side: composerState.side, line: composerState.line }
      : null;

  const totalNew = useMemo(
    () => (newContent ? newContent.split('\n').length - (newContent.endsWith('\n') ? 1 : 0) : 0),
    [newContent],
  );

  const coverage = useMemo(
    () =>
      computeCoverage({
        hunks: fileData.hunks,
        totalNew,
        ctx: 3,
        expandedGaps,
        regions,
        methodExpand,
        expandAllMethods,
      }),
    [fileData, totalNew, expandedGaps, regions, methodExpand, expandAllMethods],
  );

  const rows = useMemo(
    () =>
      buildDiffRows({
        hunks: fileData.hunks,
        totalNew,
        newTokens,
        oldTokens,
        ctx: 3,
        expandedGaps,
        regions,
        methodExpand,
        expandAllMethods,
        inlineComments,
        composerAnchor,
      }),
    [fileData, totalNew, newTokens, oldTokens, expandedGaps, regions, methodExpand, expandAllMethods, inlineComments, composerAnchor],
  );

  const sections = useMemo(() => {
    const map = new Map<number, typeof rows>();
    for (const r of rows) {
      const list = map.get(r.sec) ?? [];
      list.push(r);
      map.set(r.sec, list);
    }
    return map;
  }, [rows]);

  const hunkMeta = useMemo(
    () =>
      fileData.hunks.map((h, i) => {
        const region = enclosingRegion(
          regions,
          Math.max(1, h.newStart),
          Math.max(1, Math.min(totalNew || h.newStart, h.newStart + h.newLines - 1 || h.newStart)),
        );
        // 方法视图下全部展开，条永不出现
        if (!region || methodExpand[i] || expandAllMethods)
          return { region, bar: null as null | { hiddenBefore: number; hiddenAfter: number } };
        const m = rangeAt(coverage, h.newStart);
        const hiddenBefore = m ? Math.max(0, m.s - region.startLine) : 0;
        const hiddenAfter = m ? Math.max(0, region.endLine - m.e) : 0;
        const covered = coverage.some((r) => r.s <= region.startLine && region.endLine <= r.e);
        return { region, bar: covered ? null : { hiddenBefore, hiddenAfter } };
      }),
    [fileData, regions, methodExpand, coverage, totalNew, expandAllMethods],
  );

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {fileData.hunks.map((h, i) => (
          <section key={i} id={`hunk-${i}`} className="overflow-hidden rounded-md border border-[#30363d]">
            <div className="flex items-center gap-3 border-b border-[#30363d] bg-[#161b22] px-3 py-1 text-[11px] text-[#8b949e]">
              <span className="code-font">
                @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
              </span>
              {hunkMeta[i]?.region && (
                <span className="flex min-w-0 items-center gap-1 rounded bg-[#21262d] px-1.5 py-0.5 text-[10px] text-[#79c0ff]">
                  <Braces size={10} className="shrink-0" />
                  <span className="code-font truncate" title={hunkMeta[i]?.region?.name}>
                    {hunkMeta[i]!.region!.name}
                  </span>
                </span>
              )}
              <span className="ml-auto">
                <span className="text-[#3fb950]">{h.lines.filter((l) => l.type === 'add').length}+</span>{' '}
                <span className="text-[#f85149]">
                  {h.lines.filter((l) => l.type === 'del').length}−
                </span>
              </span>
            </div>
            {hunkMeta[i]?.bar && (
              <MethodBar hunkIdx={i} region={hunkMeta[i]!.region!} hiddenBefore={hunkMeta[i]!.bar!.hiddenBefore} hiddenAfter={hunkMeta[i]!.bar!.hiddenAfter} />
            )}
            {/* 外层占满 section 宽作为横向滚动容器，内层 w-max 撑到最宽行；内联评论 sticky left-0 保持可见 */}
            <div className="overflow-x-auto">
              <div className="w-max min-w-full">
                {(sections.get(i) ?? []).map((row, j) => (
                  <DiffRowView
                    key={j}
                    row={row}
                    flashTs={
                      flash && row.kind !== 'gap' && row.kind !== 'comment' && row.hunkIdx === flash.idx ? flash.ts : null
                    }
                    onGap={expandGap}
                    onLineClick={onLineClick}
                    commentCountFor={commentCountFor}
                  />
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
