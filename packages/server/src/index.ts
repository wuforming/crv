#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { buildServer, resolveWebDist } from './server.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let port = Number(process.env.PORT || 5175);
  let repoPath: string | undefined;
  let noOpen = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--port') port = Number(args[++i]);
    else if (a === '--no-open') noOpen = true;
    else if (a && !a.startsWith('--')) repoPath = a;
  }

  const app = await buildServer();

  let actualPort = 0;
  for (const p of [port, port + 1, port + 2, port + 3, port + 4]) {
    try {
      await app.listen({ port: p, host: '127.0.0.1' });
      actualPort = p;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'EADDRINUSE') continue;
      throw e;
    }
  }
  if (!actualPort) {
    console.error(`端口 ${port}~${port + 4} 均被占用，请用 --port 指定其他端口`);
    process.exit(1);
  }

  const url = `http://127.0.0.1:${actualPort}`;
  console.log(`Code Review 已启动: ${url}`);

  const webDist = resolveWebDist();
  if (!fs.existsSync(path.join(webDist, 'index.html'))) {
    console.warn('⚠ 未找到 web 构建产物（开发仓库请先 pnpm build；发布包应内置 web-dist）');
  }

  if (!noOpen) {
    try {
      const { default: open } = await import('open');
      const target = repoPath ? `${url}/?repo=${encodeURIComponent(path.resolve(repoPath))}` : url;
      await open(target);
    } catch {
      console.log(`请手动打开 ${url}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
