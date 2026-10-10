import { describe, expect, it } from 'vitest';
import { buildCallGraph, scanIdentifiers, suggestOrder, type CallEdge } from './graph.js';
import type { Def } from './defs.js';
import type { FileSummary } from './git.js';
import { parseCallNames } from './tree.js';

const file = (path: string, status: FileSummary['status'] = 'M'): FileSummary => ({
  path,
  status,
  additions: 1,
  deletions: 0,
  hunks: 1,
  binary: false,
});

const def = (name: string, file: string): Def => ({ name, kind: 'function', file, line: 1 });

describe('scanIdentifiers', () => {
  it('提取去重标识符', () => {
    const names = scanIdentifiers('const foo = bar(foo); // baz baz');
    expect(names).toContain('foo');
    expect(names).toContain('bar');
    expect(names).toContain('baz');
    expect(names.filter((n) => n === 'baz')).toHaveLength(1);
  });
});

describe('buildCallGraph', () => {
  const files = [file('a.ts'), file('b.ts'), file('c.ts'), file('docs.md')];
  const defs = new Map<string, Def[]>([
    ['formatAmount', [def('formatAmount', 'b.ts')]],
    ['Helper', [def('Helper', 'c.ts'), def('Helper', 'x.ts')]],
  ]);

  it('调用的定义落在其他改动文件时连边', () => {
    const edges = buildCallGraph(files, defs, (p) => (p === 'a.ts' ? ['formatAmount', 'Helper'] : []));
    expect(edges).toContainEqual({ from: 'a.ts', to: 'b.ts', via: 'formatAmount' });
    expect(edges).toContainEqual({ from: 'a.ts', to: 'c.ts', via: 'Helper' });
    expect(edges.filter((e) => e.to === 'x.ts')).toHaveLength(0);
  });

  it('自调用与未改动文件不连边，同文件对去重', () => {
    const edges = buildCallGraph(files, defs, (p) => (p === 'b.ts' ? ['formatAmount'] : ['Helper']));
    // Helper 定义在 c.ts：a.ts 与 docs.md 各连一条；c.ts 是自调用跳过；x.ts 未改动跳过
    const toC = edges.filter((e) => e.to === 'c.ts');
    expect(toC).toHaveLength(2);
    expect(toC.map((e) => e.from).sort()).toEqual(['a.ts', 'docs.md']);
    expect(edges.every((e) => e.from !== e.to)).toBe(true);
  });
});

describe('suggestOrder', () => {
  it('入口（零入度）在前，拓扑有序', () => {
    const paths = ['a.ts', 'b.ts', 'c.ts'];
    const edges: CallEdge[] = [
      { from: 'a.ts', to: 'b.ts', via: 'f' },
      { from: 'b.ts', to: 'c.ts', via: 'g' },
    ];
    const order = suggestOrder(paths, edges);
    expect(order).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('环按原序截断，所有文件都保留', () => {
    const paths = ['a.ts', 'b.ts', 'c.ts'];
    const edges: CallEdge[] = [
      { from: 'a.ts', to: 'b.ts', via: 'f' },
      { from: 'b.ts', to: 'a.ts', via: 'g' },
    ];
    const order = suggestOrder(paths, edges);
    // c.ts 是唯一零入度入口排最前；a↔b 环按原序截断在后
    expect(order[0]).toBe('c.ts');
    expect(order.slice(1).sort()).toEqual(['a.ts', 'b.ts']);
    expect(order).toHaveLength(3);
  });

  it('无边时保持原序', () => {
    expect(suggestOrder(['x.ts', 'y.ts'], [])).toEqual(['x.ts', 'y.ts']);
  });
});

describe('parseCallNames', () => {
  it('TS：直接调用、方法链、构造器', async () => {
    const names = await parseCallNames(
      `
      import { formatAmount } from './format';
      export function total(lines: Line[]): string {
        const sorted = lines.sort(byAmount);
        const text = formatAmount(sorted[0].cents);
        const svc = new OrderService();
        return svc.render(text).trim();
      }
      `,
      'typescript',
    );
    expect(names).not.toBeNull();
    expect(names).toContain('formatAmount');
    expect(names).toContain('OrderService');
    expect(names).toContain('render');
    expect(names).toContain('trim');
    // 定义处关键字与实参（回调引用）都不是调用
    expect(names).not.toContain('total');
    expect(names).not.toContain('byAmount');
  });

  it('Java：方法调用与构造器', async () => {
    const names = await parseCallNames(
      `
      public class OrderService {
        public BigDecimal total(List<OrderLine> lines) {
          Pricing quote = pricingClient.quote(lines);
          BigDecimal total = BigDecimal.ZERO;
          Validator.check(lines);
          return total;
        }
      }
      `,
      'java',
    );
    expect(names).not.toBeNull();
    expect(names).toContain('quote');
    expect(names).toContain('check');
    // 方法定义处不算调用
    expect(names).not.toContain('total');
  });

  it('无调用代码返回空数组（采信，不降级）', async () => {
    const names = await parseCallNames('const a = 1;\n', 'typescript');
    expect(names).toEqual([]);
  });

  it('未适配语言返回 null（由调用方降级）', async () => {
    expect(await parseCallNames('fun main() { foo() }', 'kotlin')).toBeNull();
  });
});
