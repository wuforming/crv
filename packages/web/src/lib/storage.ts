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

const SIDEBAR_KEY = 'crv.sidebarWidth';
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 640;
export const SIDEBAR_DEFAULT = 288;

export function clampSidebarWidth(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w)));
}

export function getSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(SIDEBAR_KEY));
    if (Number.isFinite(v) && v > 0) return clampSidebarWidth(v);
  } catch {
    // localStorage 不可用时静默降级
  }
  return SIDEBAR_DEFAULT;
}

export function saveSidebarWidth(w: number): void {
  try {
    localStorage.setItem(SIDEBAR_KEY, String(w));
  } catch {
    // localStorage 不可用时静默忽略
  }
}

const PANEL_KEY = 'crv.commentPanelCollapsed';

export function getCommentPanelCollapsed(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveCommentPanelCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(PANEL_KEY, collapsed ? '1' : '0');
  } catch {
    // localStorage 不可用时静默忽略
  }
}

const SIDEBAR_MODE_KEY = 'crv.sidebarMode';

export type SidebarMode = 'list' | 'tree';

export function getSidebarMode(): SidebarMode {
  try {
    return localStorage.getItem(SIDEBAR_MODE_KEY) === 'tree' ? 'tree' : 'list';
  } catch {
    return 'list';
  }
}

export function saveSidebarMode(mode: SidebarMode): void {
  try {
    localStorage.setItem(SIDEBAR_MODE_KEY, mode);
  } catch {
    // localStorage 不可用时静默忽略
  }
}
