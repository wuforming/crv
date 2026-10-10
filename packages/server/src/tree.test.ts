import { describe, expect, it } from 'vitest';
import { parseCallSites, parseRegions, treeLangOf } from './tree.js';

const TS_CODE = `import { x } from './x';

export function formatAmount(cents: number): string {
  const yuan = cents / 1000;
  return \`¥\${yuan.toFixed(3)}\`;
}

function helper(): void {
  // noop
}

export class OrderService {
  totalOf(lines: number[]): number {
    return lines.reduce((a, b) => a + b, 0);
  }

  refund(orderId: string): void {
    console.log(orderId);
  }
}
`;

const JAVA_CODE = `package service;

public class OrderService {

    private final PricingClient pricingClient;

    public OrderService(PricingClient pricingClient) {
        this.pricingClient = pricingClient;
    }

    public BigDecimal totalOf(List<OrderLine> lines) {
        BigDecimal total = BigDecimal.ZERO;
        return total;
    }
}
`;

describe('treeLangOf', () => {
  it('按扩展名映射', () => {
    expect(treeLangOf('a/b.ts')).toBe('typescript');
    expect(treeLangOf('a/b.tsx')).toBe('tsx');
    expect(treeLangOf('a/b.java')).toBe('java');
    expect(treeLangOf('a/b.kt')).toBeNull();
    expect(treeLangOf('a/b.md')).toBeNull();
  });
});

describe('parseRegions', () => {
  it('TS：函数与类方法边界及命名', async () => {
    const regions = await parseRegions(TS_CODE, 'typescript');
    const fns = regions.filter((r) => r.kind === 'function');
    const f = fns.find((r) => r.name === 'formatAmount');
    expect(f).toBeDefined();
    expect(f!.startLine).toBe(3);
    expect(f!.endLine).toBe(6);
    const helper = fns.find((r) => r.name === 'helper');
    expect(helper!.startLine).toBe(8);
    expect(helper!.endLine).toBe(10);
    // 类方法也是 function 区域
    const totalOf = fns.find((r) => r.name === 'totalOf');
    expect(totalOf).toBeDefined();
    const cls = regions.find((r) => r.kind === 'class' && r.name === 'OrderService');
    expect(cls).toBeDefined();
  });

  it('Java：方法与构造器边界', async () => {
    const regions = await parseRegions(JAVA_CODE, 'java');
    const ctor = regions.find((r) => r.name === 'OrderService' && r.kind === 'function');
    expect(ctor).toBeDefined();
    const total = regions.find((r) => r.name === 'totalOf');
    expect(total).toBeDefined();
    expect(total!.startLine).toBe(11);
    expect(total!.endLine).toBe(14);
    expect(regions.some((r) => r.kind === 'class')).toBe(true);
  });

  it('未适配语言返回空', async () => {
    expect(await parseRegions('fn main() {}', 'kotlin')).toEqual([]);
    expect(await parseRegions('x', 'plaintext')).toEqual([]);
  });
});

describe('parseCallSites', () => {
  it('TS：调用点带行号，import 与声明不算调用', async () => {
    const sites = await parseCallSites(
      [
        'import { formatAmount } from "./format";', // 1
        '', // 2
        'export function total(lines: string[]): string {', // 3
        '  const t = formatAmount(lines[0]);', // 4
        '  return t.trim();', // 5
        '}', // 6
      ].join('\n'),
      'typescript',
    );
    expect(sites).not.toBeNull();
    const fmt = sites!.find((s) => s.name === 'formatAmount');
    expect(fmt).toEqual({ name: 'formatAmount', line: 4 });
    const trim = sites!.find((s) => s.name === 'trim');
    expect(trim).toEqual({ name: 'trim', line: 5 });
    // import 语句和 total 声明不是调用
    expect(sites!.some((s) => s.name === 'total')).toBe(false);
  });

  it('Java：方法调用带行号', async () => {
    const sites = await parseCallSites(
      [
        'public class OrderService {', // 1
        '  public BigDecimal total(List<String> lines) {', // 2
        '    return pricingClient.quote(lines);', // 3
        '  }', // 4
        '}', // 5
      ].join('\n'),
      'java',
    );
    expect(sites).not.toBeNull();
    expect(sites!).toContainEqual({ name: 'quote', line: 3 });
  });

  it('未适配语言返回 null', async () => {
    expect(await parseCallSites('fun main() { foo() }', 'kotlin')).toBeNull();
  });
});
