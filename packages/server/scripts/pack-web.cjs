// 发布打包时把 packages/web/dist 拷进 server 包（npm pack/publish 的 prepack 钩子）
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '../../web/dist');
const dst = path.join(__dirname, '..', 'web-dist');

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('未找到 packages/web/dist，请先在仓库根目录执行 pnpm build');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`web dist → ${dst}`);
