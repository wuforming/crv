import { useCallback } from 'react';
import { useReviewStore } from '../store';
import { FocusMode } from './FocusMode';
import { FullFileMode } from './FullFileMode';
import { EmptyState } from './EmptyState';

export function DiffPane() {
  const selected = useReviewStore((s) => s.selected);
  const loadingFile = useReviewStore((s) => s.loadingFile);
  const fileData = useReviewStore((s) => s.fileData);
  const mode = useReviewStore((s) => s.mode);
  const comments = useReviewStore((s) => s.comments);
  const beginComment = useReviewStore((s) => s.beginComment);

  const commentsVisible = useReviewStore((s) => s.commentsVisible);

  const commentCountFor = useCallback(
    (side: 'old' | 'new', line: number | undefined) => {
      if (!commentsVisible || line === undefined || !selected) return 0;
      return comments.filter((c) => !c.orphaned && c.file === selected && c.side === side && c.line === line).length;
    },
    [comments, selected, commentsVisible],
  );

  if (!selected) return <EmptyState text="在左侧选择一个文件开始 Review" />;
  if (loadingFile) return <EmptyState text="加载中…" />;
  if (!fileData) return <EmptyState text="无数据" />;
  if (fileData.isBinary) return <EmptyState text="二进制文件，无文本 diff" />;

  return (
    <div className="h-full">
      {mode === 'full' ? (
        <FullFileMode onLineClick={beginComment} commentCountFor={commentCountFor} />
      ) : (
        <FocusMode onLineClick={beginComment} commentCountFor={commentCountFor} />
      )}
    </div>
  );
}
