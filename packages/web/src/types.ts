export interface WordToken {
  value: string;
  kind: 'add' | 'del' | 'same';
}

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  oldNumber?: number;
  newNumber?: number;
  text: string;
  words?: WordToken[];
}

export interface FileHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  isNew?: boolean;
  isDeleted?: boolean;
  isBinary?: boolean;
  hunks: FileHunk[];
}

export interface FileSummary {
  path: string;
  oldPath?: string;
  status: 'A' | 'M' | 'D' | 'R';
  additions: number;
  deletions: number;
  hunks: number;
  binary: boolean;
}

export interface BranchInfo {
  name: string;
  sha: string;
  date: string;
  subject: string;
  isHead: boolean;
}

export interface DiffSummary {
  baseSha: string;
  reviewSha: string;
  files: FileSummary[];
}

export interface SessionComment {
  id: string;
  file: string;
  side: 'new' | 'old';
  line: number;
  snippet: string;
  contentHash: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  orphaned?: boolean;
}

export interface Region {
  name: string;
  kind: 'function' | 'class';
  startLine: number;
  endLine: number;
}

export interface Def {
  name: string;
  kind: 'function' | 'class';
  file: string;
  line: number;
}

export interface RefSite {
  file: string;
  line: number;
}

/** 定义/调用方选择器的通用条目 */
export interface PickerItem {
  file: string;
  line: number;
  label: string;
  kind?: 'function' | 'class';
}

export type NavLoc = { type: 'diff' } | { type: 'file'; file: string; line: number; label: string };

export interface CallEdge {
  from: string;
  to: string;
  via: string;
}

export interface CallGraph {
  edges: CallEdge[];
  /** 推荐评审顺序：调用链拓扑序，入口在前 */
  order: string[];
}

export interface SessionData {
  reviewBranch: string;
  baseBranch: string;
  baseCommit: string;
  reviewCommit: string;
  fileOrder: string[] | null;
  comments: SessionComment[];
  lastOpenedAt: string;
}
