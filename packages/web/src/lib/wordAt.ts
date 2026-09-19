/** 用浏览器 caret API 取坐标处的标识符词（跳转定义用）。 */
export function wordAtPoint(x: number, y: number): string | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let textNode: Text | null = null;
  let offset = 0;
  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    if (r && r.startContainer.nodeType === Node.TEXT_NODE) {
      textNode = r.startContainer as Text;
      offset = r.startOffset;
    }
  } else if (typeof doc.caretPositionFromPoint === 'function') {
    const p = doc.caretPositionFromPoint(x, y);
    if (p && p.offsetNode.nodeType === Node.TEXT_NODE) {
      textNode = p.offsetNode as Text;
      offset = p.offset;
    }
  }
  if (!textNode) return null;
  const data = textNode.data;
  const isId = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
  let s = offset;
  let e = offset;
  while (s > 0 && isId(data[s - 1])) s -= 1;
  while (e < data.length && isId(data[e])) e += 1;
  if (s === e) return null;
  const word = data.slice(s, e);
  return /^[A-Za-z_$]/.test(word) ? word : null;
}
