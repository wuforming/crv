import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FolderGit2, FolderOpen, Loader2 } from 'lucide-react';
import { api } from '../api';
import { useReviewStore } from '../store';
import { getRecent, pushRecent, type RecentRepo } from '../lib/storage';
import type { BranchInfo } from '../types';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function HomePage() {
  const start = useReviewStore((s) => s.start);
  const [pathInput, setPathInput] = useState(() => new URLSearchParams(location.search).get('repo') ?? '');
  const [repo, setRepo] = useState<{ root: string; name: string } | null>(null);
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [review, setReview] = useState('');
  const [base, setBase] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRepo[]>(() => getRecent());

  const doValidate = useCallback(async (p: string) => {
    if (!p.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.validate(p.trim());
      setRepo(r);
      const b = await api.branches(r.root);
      setBranches(b.branches);
      const head = b.branches.find((x) => x.isHead)?.name;
      const preferBase = ['develop', 'main', 'master'].find(
        (n) => n !== head && b.branches.some((x) => x.name === n),
      );
      setReview(head ?? b.branches[0]?.name ?? '');
      setBase(preferBase ?? b.branches.find((x) => x.name !== head)?.name ?? '');
    } catch (e) {
      setRepo(null);
      setBranches(null);
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search).get('repo');
    if (q) doValidate(q);
  }, [doValidate]);

  const doPick = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.pickFolder();
      if (r.canceled || !r.path) {
        if (r.error) setErr(r.error);
        return;
      }
      setPathInput(r.path);
      await doValidate(r.path);
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const doStart = async () => {
    if (!repo || !review || !base) return;
    if (review === base) {
      setErr('review 分支和对比分支不能相同');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const [summary, sessionRes] = await Promise.all([
        api.summary(repo.root, review, base),
        api.getSession(repo.root, review, base).catch(() => ({ session: null })),
      ]);
      if (summary.files.length === 0) {
        setErr(`${review} 相对 ${base} 没有改动`);
        return;
      }
      pushRecent({ path: repo.root, name: repo.name });
      setRecent(getRecent());
      start({ repo: repo.root, repoName: repo.name, review, base, summary, session: sessionRes.session });
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(false);
    }
  };

  const branchOption = (b: BranchInfo) => `${b.name} · ${b.date} ${b.subject}`.slice(0, 60);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold">Code Review</h1>
          <p className="mt-2 text-sm text-[#8b949e]">选两个分支，面对面快速过改动</p>
        </div>

        <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-5">
          <button
            type="button"
            onClick={doPick}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#238636] px-4 py-3 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FolderOpen size={16} />}
            选择仓库文件夹…
          </button>

          <div className="mt-4 flex items-center gap-3 text-[11px] text-[#6e7681]">
            <span className="h-px flex-1 bg-[#21262d]" />
            或手动输入路径
            <span className="h-px flex-1 bg-[#21262d]" />
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doValidate(pathInput)}
              placeholder="/path/to/repo"
              className="min-w-0 flex-1 rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm outline-none focus:border-[#1f6feb]"
            />
            <button
              type="button"
              onClick={() => doValidate(pathInput)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm hover:bg-[#30363d] disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderGit2 size={14} />}
              打开
            </button>
          </div>

          {err && <p className="mt-2 text-xs text-[#f85149]">{err}</p>}

          {repo && branches && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-[#3fb950]">
                已打开 {repo.name}（{branches.length} 个本地分支）
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-[#8b949e]">review 分支</label>
                  <select
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-2 text-sm outline-none focus:border-[#1f6feb]"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {branchOption(b)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[#8b949e]">对比分支（基准）</label>
                  <select
                    value={base}
                    onChange={(e) => setBase(e.target.value)}
                    className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-2 text-sm outline-none focus:border-[#1f6feb]"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {branchOption(b)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={doStart}
                disabled={busy || !review || !base}
                className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#238636] px-3 py-2 text-sm font-medium text-white hover:bg-[#2ea043] disabled:opacity-50"
              >
                开启 Review
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-[#8b949e]">最近打开</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  onClick={() => {
                    setPathInput(r.path);
                    doValidate(r.path);
                  }}
                  className="rounded-full border border-[#30363d] bg-[#161b22] px-3 py-1 text-xs text-[#8b949e] hover:border-[#1f6feb] hover:text-[#e6edf3]"
                  title={r.path}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
