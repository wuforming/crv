import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki';

export interface RowToken {
  content: string;
  color: string;
}

export type LineTokens = RowToken[];

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= (async () => {
    const { createHighlighter } = await import('shiki');
    return createHighlighter({
      themes: ['github-dark-default' as BundledTheme],
      langs: [
        'java',
        'typescript',
        'tsx',
        'javascript',
        'kotlin',
        'json',
        'markdown',
      ] as BundledLanguage[],
    });
  })();
  return highlighterPromise;
}

const EXT_LANG: Record<string, BundledLanguage> = {
  ts: 'typescript',
  mts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  json: 'json',
  md: 'markdown',
};

export function langOf(path: string): BundledLanguage {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? ('plaintext' as BundledLanguage);
}

const DEFAULT_COLOR = '#e6edf3';

/** 整文件 token 化，返回按行组织的 token；失败时退化为纯文本。 */
export async function tokenizeLines(code: string, path: string): Promise<LineTokens[]> {
  if (!code) return [];
  const fallback = () => code.split('\n').map((l) => [{ content: l, color: DEFAULT_COLOR }]);
  try {
    const hl = await getHighlighter();
    const result = hl.codeToTokens(code, {
      lang: langOf(path),
      theme: 'github-dark-default' as BundledTheme,
    }) as unknown;
    // 兼容 shiki 各版本返回结构：{ tokens } / { lines } / 裸数组
    const src = Array.isArray(result)
      ? result
      : ((result as { tokens?: unknown[][]; lines?: unknown[][] }).tokens ??
        (result as { lines?: unknown[][] }).lines);
    if (!Array.isArray(src)) return fallback();
    return (src as { content: string; color?: string }[][]).map((line) =>
      line.map((t) => ({ content: t.content, color: t.color ?? DEFAULT_COLOR })),
    );
  } catch {
    return fallback();
  }
}
