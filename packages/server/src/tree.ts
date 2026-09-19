import path from 'node:path';
import { fileContent } from './git.js';

export interface Region {
  name: string;
  kind: 'function' | 'class';
  startLine: number;
  endLine: number;
}

/** 语言 → grammar 配置：wasm 位置 + 函数/类节点类型。 */
const GRAMMARS: Record<
  string,
  { wasm: () => string; functions: string[]; classes: string[] }
> = {
  java: {
    wasm: () => require.resolve('tree-sitter-java/tree-sitter-java.wasm'),
    functions: ['method_declaration', 'constructor_declaration'],
    classes: ['class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration'],
  },
  typescript: {
    wasm: () => require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm'),
    functions: ['function_declaration', 'generator_function_declaration', 'method_definition'],
    classes: ['class_declaration', 'abstract_class_declaration', 'interface_declaration'],
  },
  tsx: {
    wasm: () => require.resolve('tree-sitter-typescript/tree-sitter-tsx.wasm'),
    functions: ['function_declaration', 'generator_function_declaration', 'method_definition'],
    classes: ['class_declaration', 'abstract_class_declaration', 'interface_declaration'],
  },
  javascript: {
    wasm: () => require.resolve('tree-sitter-javascript/tree-sitter-javascript.wasm'),
    functions: ['function_declaration', 'generator_function_declaration', 'method_definition'],
    classes: ['class_declaration'],
  },
  // kotlin grammar 的 npm 包未随包发布 wasm，暂走通用折叠（M4 处理）
};

export function treeLangOf(filePath: string): string | null {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === 'ts' || ext === 'mts' || ext === 'cts') return 'typescript';
  if (ext === 'tsx') return 'tsx';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs' || ext === 'jsx') return 'javascript';
  if (ext === 'java') return 'java';
  return null;
}

// web-tree-sitter 运行时对象（懒加载，避免启动开销）
type AnyParser = new () => { parse(input: string): { rootNode: TreeNode }; setLanguage(lang: unknown): void };
interface TreeNode {
  type: string;
  childCount: number;
  child(i: number): TreeNode;
  startPosition: { row: number };
  endPosition: { row: number };
  childForFieldName?(field: string): TreeNode | null;
  text?: string;
}
interface WTSModule {
  Parser: { init(opts?: unknown): Promise<void>; new (): never } & Record<string, unknown>;
  Language: { load(input: string): Promise<unknown> };
}

let wtsPromise: Promise<WTSModule> | null = null;
const parserInstances = new Map<string, { parse(input: string): { rootNode: TreeNode } }>();
const failedLangs = new Set<string>();

async function getWTS(): Promise<WTSModule> {
  wtsPromise ??= (async () => {
    const mod = (await import('web-tree-sitter')) as unknown as WTSModule & { default?: WTSModule };
    const resolved: WTSModule = mod.Parser ? mod : ((mod.default ?? mod) as WTSModule);
    await resolved.Parser.init();
    return resolved;
  })();
  return wtsPromise;
}

async function getParser(lang: string): Promise<{ parse(input: string): { rootNode: TreeNode } } | null> {
  if (parserInstances.has(lang)) return parserInstances.get(lang)!;
  if (failedLangs.has(lang)) return null;
  try {
    const g = GRAMMARS[lang];
    const wts = await getWTS();
    const ParserCtor = wts.Parser as unknown as AnyParser;
    const parser = new ParserCtor();
    const language = await wts.Language.load(g.wasm());
    (parser as unknown as { setLanguage(l: unknown): void }).setLanguage(language);
    parserInstances.set(lang, parser);
    return parser;
  } catch (e) {
    console.warn(`[tree-sitter] 加载 ${lang} grammar 失败，该语言退回通用折叠:`, (e as Error).message);
    failedLangs.add(lang);
    return null;
  }
}

function nameOf(node: TreeNode, kind: Region['kind']): string {
  const named = node.childForFieldName?.('name');
  if (named) return named.text ?? kind;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c.type.includes('identifier')) return c.text ?? kind;
  }
  return kind;
}

function collectRegions(root: TreeNode, lang: string): Region[] {
  const g = GRAMMARS[lang];
  const out: Region[] = [];
  const visit = (node: TreeNode): void => {
    if (g.functions.includes(node.type)) {
      out.push({ name: nameOf(node, 'function'), kind: 'function', startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
    } else if (g.classes.includes(node.type)) {
      out.push({ name: nameOf(node, 'class'), kind: 'class', startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 });
    }
    for (let i = 0; i < node.childCount; i++) visit(node.child(i));
  };
  visit(root);
  return out;
}

/** 解析内容提取函数/类边界（纯函数，测试直接用）。加载失败或语言未适配返回 []。 */
export async function parseRegions(content: string, lang: string): Promise<Region[]> {
  if (!GRAMMARS[lang] || !content) return [];
  const parser = await getParser(lang);
  if (!parser) return [];
  try {
    const tree = parser.parse(content);
    return collectRegions(tree.rootNode, lang);
  } catch (e) {
    console.warn('[tree-sitter] 解析失败:', (e as Error).message);
    return [];
  }
}

/** API 入口：取指定 rev 下文件的方法/类区域。 */
export async function treeRegions(repo: string, rev: string, filePath: string): Promise<Region[]> {
  const lang = treeLangOf(filePath);
  if (!lang) return [];
  const content = await fileContent(repo, rev, filePath);
  if (content === null) return [];
  return parseRegions(content, lang);
}
