import { describe, expect, it } from 'vitest';
import { pairWordDiffs, parseUnifiedDiff } from './diff.js';

const SAMPLE = `diff --git a/src/utils.ts b/src/utils.ts
index 111..222 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,5 @@
 export function formatAmount(cents: number): string {
-  const yuan = cents / 100;
+  const yuan = cents / 1000;
   return \`¥\${yuan.toFixed(2)}\`;
 }
 
@@ -10,0 +11,2 @@
+export function slug(s: string): string {
+  return s.trim().toLowerCase();
diff --git a/src/api.ts b/src/api.ts
new file mode 100644
index 000..333
--- /dev/null
+++ b/src/api.ts
@@ -0,0 +1,2 @@
+export const API = '/api';
+export const v = 1;
diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -2,3 +2,3 @@
 line
-changed old
+changed new
 tail
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 444..000
--- a/gone.txt
+++ /dev/null
@@ -1,1 +0,0 @@
-bye
`;

describe('parseUnifiedDiff', () => {
  const files = parseUnifiedDiff(SAMPLE);

  it('解析出全部文件', () => {
    expect(files.map((f) => f.path)).toEqual(['src/utils.ts', 'src/api.ts', 'new.ts', 'gone.txt']);
  });

  it('修改文件：hunk 数与行号', () => {
    const f = files[0];
    expect(f.hunks).toHaveLength(2);
    const h1 = f.hunks[0];
    expect(h1.oldStart).toBe(1);
    expect(h1.newStart).toBe(1);
    const del = h1.lines.find((l) => l.type === 'del');
    const add = h1.lines.find((l) => l.type === 'add');
    expect(del?.oldNumber).toBe(2);
    expect(add?.newNumber).toBe(2);
    const ctx = h1.lines[0];
    expect(ctx.type).toBe('context');
    expect(ctx.oldNumber).toBe(1);
    expect(ctx.newNumber).toBe(1);
    // 纯新增 hunk（oldStart=10, oldLines=0）
    const h2 = f.hunks[1];
    expect(h2.oldLines).toBe(0);
    expect(h2.lines.every((l) => l.type === 'add')).toBe(true);
    expect(h2.lines[0].newNumber).toBe(11);
  });

  it('新增/删除/重命名文件的状态标记', () => {
    expect(files[1].isNew).toBe(true);
    expect(files[1].oldPath).toBeUndefined();
    expect(files[3].isDeleted).toBe(true);
    expect(files[3].hunks[0].lines[0].type).toBe('del');
    expect(files[2].oldPath).toBe('old.ts');
    expect(files[2].path).toBe('new.ts');
  });
});

describe('pairWordDiffs', () => {
  it('配对的 del/add 行携带词级 token', () => {
    const files = parseUnifiedDiff(SAMPLE);
    pairWordDiffs(files.flatMap((f) => f.hunks));
    const h = files[0].hunks[0];
    const del = h.lines.find((l) => l.type === 'del');
    const add = h.lines.find((l) => l.type === 'add');
    expect(del?.words).toBeDefined();
    expect(add?.words).toBe(del?.words);
    const kinds = new Map(del?.words?.map((w) => [w.kind, w.value]));
    expect(kinds.get('del')).toBe('100');
    expect(kinds.get('add')).toBe('1000');
    expect(del?.words?.some((w) => w.kind === 'same' && w.value.includes('const yuan'))).toBe(true);
  });

  it('未配对（纯增）行不携带 words', () => {
    const files = parseUnifiedDiff(SAMPLE);
    pairWordDiffs(files.flatMap((f) => f.hunks));
    const pureAdd = files[1].hunks[0].lines[0];
    expect(pureAdd.words).toBeUndefined();
  });
});
