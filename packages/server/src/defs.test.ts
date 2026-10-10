import { execSync } from 'node:child_process';
import fsSync from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureDefIndex, findDefs, findRefs } from './defs.js';

let repoDir: string | null = null;

afterEach(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  repoDir = null;
});

function makeRepo(): string {
  repoDir = mkdtempSync(join(tmpdir(), 'crv-defs-'));
  const g = (cmd: string) => execSync(`git -C ${repoDir} ${cmd}`, { stdio: 'pipe' });
  execSync(`git init -q -b main ${repoDir}`);
  execSync(`git -C ${repoDir} config user.email t@t`);
  execSync(`git -C ${repoDir} config user.name t`);
  fsSync.mkdirSync(join(repoDir, 'src'), { recursive: true });
  fsSync.writeFileSync(
    join(repoDir, 'src', 'utils.ts'),
    ['export function formatAmount(c: number): string {', '  return String(c);', '}', ''].join('\n'),
  );
  fsSync.writeFileSync(
    join(repoDir, 'src', 'order.ts'),
    [
      'import { formatAmount } from "./utils";',
      'export class Order {',
      '  total(): number {',
      '    return 1;',
      '  }',
      '}',
      'const x = formatAmount(1);',
      '',
    ].join('\n'),
  );
  // 应被跳过的目录
  fsSync.mkdirSync(join(repoDir, 'node_modules', 'pkg'), { recursive: true });
  fsSync.writeFileSync(join(repoDir, 'node_modules', 'pkg', 'junk.ts'), 'export function formatAmount() {}\n');
  g('add -A');
  g('commit -qm init');
  return repoDir;
}

describe('def index', () => {
  it('跨文件找定义、跳过 node_modules、命中缓存', async () => {
    const repo = makeRepo();
    const defs1 = await ensureDefIndex(repo, 'main');
    expect(defs1.get('formatAmount')).toHaveLength(1);
    const defs2 = await ensureDefIndex(repo, 'main'); // 第二次走缓存
    expect(defs2.get('formatAmount')![0].file).toBe('src/utils.ts');
    expect(defs2.get('formatAmount')![0].line).toBe(1);

    const order = defs2.get('Order');
    expect(order?.[0]).toMatchObject({ file: 'src/order.ts', line: 2, kind: 'class' });

    const total = defs2.get('total');
    expect(total?.[0]).toMatchObject({ file: 'src/order.ts', line: 3, kind: 'function' });
  });

  it('findDefs 对非法符号返回空', async () => {
    const repo = makeRepo();
    expect(await findDefs(repo, 'main', 'a b')).toEqual([]);
    expect(await findDefs(repo, 'main', '../etc')).toEqual([]);
  });

  it('findRefs 反查调用方：import 与定义行不算调用', async () => {
    const repo = makeRepo();
    const refs = await findRefs(repo, 'main', 'formatAmount');
    // order.ts 第 1 行是 import（非调用），第 7 行才是真实调用；utils.ts 第 1 行是定义
    expect(refs).toEqual([{ file: 'src/order.ts', line: 7 }]);
    expect(await findRefs(repo, 'main', 'a b')).toEqual([]);
  });

  it('findRefs：同类内方法调用', async () => {
    const repo = makeRepo();
    const refs = await findRefs(repo, 'main', 'total');
    expect(refs).toEqual([]);
    // total 定义于 order.ts:3 且无人调用
    const defs = await ensureDefIndex(repo, 'main');
    expect(defs.get('total')?.[0]).toMatchObject({ file: 'src/order.ts', line: 3 });
  });
});
