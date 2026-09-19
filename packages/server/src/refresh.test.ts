import { describe, expect, it } from 'vitest';
import { matchAnchorLine, sha256Text } from './refresh.js';

const CODE = ['line-a', 'line-b', 'line-c', 'line-b', 'line-d'].join('\n');

describe('matchAnchorLine', () => {
  it('唯一匹配返回行号', () => {
    expect(matchAnchorLine(CODE, sha256Text('line-a'), 1)).toBe(1);
    expect(matchAnchorLine(CODE, sha256Text('line-c'), 3)).toBe(3);
  });

  it('多处匹配取最接近原行号者', () => {
    const h = sha256Text('line-b');
    expect(matchAnchorLine(CODE, h, 2)).toBe(2);
    expect(matchAnchorLine(CODE, h, 4)).toBe(4);
    expect(matchAnchorLine(CODE, h, 5)).toBe(4);
  });

  it('内容已修改返回 -1', () => {
    expect(matchAnchorLine(CODE, sha256Text('line-a-changed'), 1)).toBe(-1);
    expect(matchAnchorLine(CODE, sha256Text(''), 1)).toBe(-1);
  });
});
