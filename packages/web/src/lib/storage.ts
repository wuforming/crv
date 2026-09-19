export interface RecentRepo {
  path: string;
  name: string;
  at: number;
}

const KEY = 'crv.recent';

export function getRecent(): RecentRepo[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentRepo[];
    return Array.isArray(list) ? list.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentRepo, 'at'>): void {
  try {
    const list = getRecent().filter((r) => r.path !== item.path);
    list.unshift({ ...item, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    // localStorage 不可用时静默忽略
  }
}
