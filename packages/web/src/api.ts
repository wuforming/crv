import type { BranchInfo, CallGraph, Def, DiffSummary, FileDiff, RefSite, Region, SessionComment, SessionData } from './types';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败 ${res.status}`);
  }
  return (await res.json()) as T;
}

const qs = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export const api = {
  validate: (path: string) =>
    json<{ root: string; name: string }>('/api/repos/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  pickFolder: () =>
    json<{ path: string | null; canceled?: boolean; error?: string }>('/api/repos/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  branches: (repo: string) => json<{ current: string | null; branches: BranchInfo[] }>(`/api/branches?${qs({ repo })}`),
  summary: (repo: string, review: string, base: string) =>
    json<DiffSummary>(`/api/review/summary?${qs({ repo, review, base })}`),
  fileDiff: (repo: string, review: string, base: string, path: string) =>
    json<FileDiff>(`/api/review/file-diff?${qs({ repo, review, base, path })}`),
  fileContent: (repo: string, rev: string, path: string) =>
    json<{ content: string | null }>(`/api/review/file-content?${qs({ repo, rev, path })}`).then((r) => r.content),
  getSession: (repo: string, review: string, base: string) =>
    json<{ session: SessionData | null }>(`/api/session?${qs({ repo, review, base })}`),
  saveOrder: (repo: string, review: string, base: string, fileOrder: string[], baseCommit: string, reviewCommit: string) =>
    json<{ session: SessionData }>('/api/session/order', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, review, base, fileOrder, baseCommit, reviewCommit }),
    }),
  saveComments: (
    repo: string,
    review: string,
    base: string,
    comments: SessionComment[],
    baseCommit: string,
    reviewCommit: string,
  ) =>
    json<{ session: SessionData }>('/api/session/comments', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, review, base, comments, baseCommit, reviewCommit }),
    }),
  exportUrl: (repo: string, review: string, base: string) => `/api/session/export?${qs({ repo, review, base })}`,
  treeRegions: (repo: string, rev: string, path: string) =>
    json<{ regions: Region[] }>(`/api/tree/regions?${qs({ repo, rev, path })}`).then((r) => r.regions),
  refresh: (repo: string, review: string, base: string, comments: SessionComment[]) =>
    json<{
      summary: DiffSummary;
      comments: SessionComment[];
      stats: { kept: number; moved: number; orphaned: number };
    }>('/api/review/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, review, base, comments }),
    }),
  defs: (repo: string, rev: string, symbol: string) =>
    json<{ defs: Def[] }>(`/api/tree/defs?${qs({ repo, rev, symbol })}`).then((r) => r.defs),
  refs: (repo: string, rev: string, symbol: string) =>
    json<{ refs: RefSite[] }>(`/api/tree/refs?${qs({ repo, rev, symbol })}`).then((r) => r.refs),
  graph: (repo: string, review: string, base: string) =>
    json<CallGraph>(`/api/review/graph?${qs({ repo, review, base })}`),
  prefetchIndex: (repo: string, rev: string) =>
    json<{ ok: boolean }>('/api/tree/index', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, rev }),
    }).catch(() => ({ ok: false })),
};
