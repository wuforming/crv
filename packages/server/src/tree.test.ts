import { describe, expect, it } from 'vitest';
import { parseRegions, treeLangOf } from './tree.js';

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
