import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { diffSummary, fileContent, fileDiff, listBranches, validateRepo } from './git.js';
import { readSession, updateSession, type SessionComment } from './store.js';
import { buildExportMarkdown } from './export.js';
import { treeRegions } from './tree.js';
import { refreshReview } from './refresh.js';
import { ensureDefIndex, findDefs, findRefs } from './defs.js';
import { buildReviewGraph } from './graph.js';
import { pickFolder } from './dialog.js';

/** 静态资源目录：发布包内的 web-dist 优先，开发仓库回退到 packages/web/dist。 */
export function resolveWebDist(): string {
  const packaged = path.join(__dirname, '..', 'web-dist');
  if (fs.existsSync(path.join(packaged, 'index.html'))) return packaged;
  return path.resolve(__dirname, '../../web/dist');
}

const errMessage = (e: unknown): string => {
  const msg = String((e as Error)?.message ?? e);
  return msg.split('\n').find(Boolean) ?? '未知错误';
};

const bad = (reply: FastifyReply, e: unknown) => reply.code(400).send({ error: errMessage(e) });

export async function buildServer() {
  const app = Fastify({ logger: false });

  app.get('/api/health', async () => ({ ok: true, name: 'crv-server' }));

  app.post('/api/repos/validate', async (req, reply) => {
    const body = (req.body ?? {}) as { path?: string };
    if (!body.path) return reply.code(400).send({ error: '缺少 path' });
    try {
      const root = await validateRepo(body.path);
      return { root, name: path.basename(root) };
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.post('/api/repos/pick', async () => {
    // 测试桩：显式开启环境变量时允许指定路径，便于无对话框环境验证端到端接线
    const stub = process.env.CRV_ENABLE_PICK_STUB;
    if (stub) return { path: stub, canceled: false };
    const r = await pickFolder();
    return { path: r.path, canceled: Boolean(r.canceled), error: r.error };
  });

  app.get('/api/branches', async (req, reply) => {
    const { repo } = req.query as Record<string, string>;
    if (!repo) return reply.code(400).send({ error: '缺少 repo' });
    try {
      return await listBranches(repo);
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.get('/api/review/summary', async (req, reply) => {
    const { repo, review, base } = req.query as Record<string, string>;
    if (!repo || !review || !base) return reply.code(400).send({ error: '缺少 repo/review/base' });
    try {
      return await diffSummary(repo, review, base);
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.get('/api/review/file-diff', async (req, reply) => {
    const { repo, review, base, path: p } = req.query as Record<string, string>;
    if (!repo || !review || !base || !p) return reply.code(400).send({ error: '缺少参数' });
    try {
      return await fileDiff(repo, review, base, p);
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.get('/api/review/file-content', async (req, reply) => {
    const { repo, rev, path: p } = req.query as Record<string, string>;
    if (!repo || !rev || !p) return reply.code(400).send({ error: '缺少参数' });
    try {
      return { content: await fileContent(repo, rev, p) };
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.get('/api/tree/regions', async (req) => {
    const { repo, rev, path: p } = req.query as Record<string, string>;
    try {
      return { regions: await treeRegions(repo, rev, p) };
    } catch {
      // 解析失败不阻塞 UI，退回通用折叠
      return { regions: [] };
    }
  });

  app.get('/api/tree/defs', async (req, reply) => {
    const { repo, rev, symbol } = req.query as Record<string, string>;
    if (!repo || !rev || !symbol) return reply.code(400).send({ error: '缺少参数' });
    try {
      const root = await validateRepo(repo);
      return { defs: await findDefs(root, rev, symbol) };
    } catch (e) {
      return bad(reply, e);
    }
  });

  // 反查调用方（定义上 ⌘点击）：与跳定义同档精度，纯导航增强
  app.get('/api/tree/refs', async (req, reply) => {
    const { repo, rev, symbol } = req.query as Record<string, string>;
    if (!repo || !rev || !symbol) return reply.code(400).send({ error: '缺少参数' });
    try {
      const root = await validateRepo(repo);
      return { refs: await findRefs(root, rev, symbol) };
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.post('/api/tree/index', async (req) => {
    const b = (req.body ?? {}) as { repo?: string; rev?: string };
    if (!b.repo || !b.rev) return { ok: false };
    try {
      const root = await validateRepo(b.repo);
      await ensureDefIndex(root, b.rev);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  // 改动文件间调用链：构建失败静默返回空图（纯导航增强，不阻塞 UI）
  app.get('/api/review/graph', async (req, reply) => {
    const { repo, review, base } = req.query as Record<string, string>;
    if (!repo || !review || !base) return reply.code(400).send({ error: '缺少 repo/review/base' });
    try {
      const root = await validateRepo(repo);
      return await buildReviewGraph(root, review, base);
    } catch (e) {
      console.warn('[graph] 构建失败:', (e as Error).message);
      return { edges: [], order: [] };
    }
  });

  app.post('/api/review/refresh', async (req, reply) => {    const b = (req.body ?? {}) as {
      repo?: string;
      review?: string;
      base?: string;
      comments?: SessionComment[];
    };
    if (!b.repo || !b.review || !b.base || !Array.isArray(b.comments))
      return reply.code(400).send({ error: '缺少参数' });
    try {
      const root = await validateRepo(b.repo);
      return await refreshReview(root, b.review, b.base, b.comments);
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.get('/api/session', async (req, reply) => {
    const { repo, review, base } = req.query as Record<string, string>;
    if (!repo || !review || !base) return reply.code(400).send({ error: '缺少 repo/review/base' });
    try {
      // 规范化到仓库真实根（macOS /tmp → /private/tmp 等），同一仓库只对应一份会话
      const root = await validateRepo(repo);
      return { session: readSession(root, review, base) };
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.put('/api/session/order', async (req, reply) => {
    const b = (req.body ?? {}) as {
      repo?: string;
      review?: string;
      base?: string;
      fileOrder?: unknown;
      baseCommit?: string;
      reviewCommit?: string;
    };
    if (!b.repo || !b.review || !b.base || !Array.isArray(b.fileOrder) || b.fileOrder.some((p) => typeof p !== 'string'))
      return reply.code(400).send({ error: '缺少参数或 fileOrder 非法' });
    try {
      const root = await validateRepo(b.repo);
      const session = updateSession(root, b.review, b.base, {
        fileOrder: b.fileOrder,
        baseCommit: b.baseCommit,
        reviewCommit: b.reviewCommit,
      });
      return { session };
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.put('/api/session/comments', async (req, reply) => {
    const b = (req.body ?? {}) as {
      repo?: string;
      review?: string;
      base?: string;
      comments?: unknown;
      baseCommit?: string;
      reviewCommit?: string;
    };
    if (!b.repo || !b.review || !b.base || !Array.isArray(b.comments))
      return reply.code(400).send({ error: '缺少参数' });
    const valid = b.comments.every((raw) => {
      const c = raw as Partial<SessionComment>;
      return (
        typeof c.id === 'string' &&
        typeof c.file === 'string' &&
        (c.side === 'new' || c.side === 'old') &&
        typeof c.line === 'number' &&
        typeof c.snippet === 'string' &&
        typeof c.text === 'string' &&
        typeof c.createdAt === 'string' &&
        typeof c.updatedAt === 'string'
      );
    });
    if (!valid) return reply.code(400).send({ error: 'comments 含非法项' });
    // contentHash 由服务端补齐（客户端不计算），供后续刷新时智能保留评论
    const comments = (b.comments as SessionComment[]).map((c) => ({
      ...c,
      contentHash: c.contentHash || crypto.createHash('sha256').update(c.snippet).digest('hex'),
    }));
    try {
      const root = await validateRepo(b.repo);
      const session = updateSession(root, b.review, b.base, {
        comments,
        baseCommit: b.baseCommit,
        reviewCommit: b.reviewCommit,
      });
      return { session };
    } catch (e) {
      return bad(reply, e);
    }
  });

  app.get('/api/session/export', async (req, reply) => {
    const { repo, review, base } = req.query as Record<string, string>;
    if (!repo || !review || !base) return reply.code(400).send({ error: '缺少 repo/review/base' });
    try {
      const root = await validateRepo(repo);
      const summary = await diffSummary(root, review, base);
      const session = readSession(root, review, base);
      const md = buildExportMarkdown({
        repoName: path.basename(root),
        repoPath: root,
        review,
        base,
        baseSha: summary.baseSha,
        reviewSha: summary.reviewSha,
        files: summary.files,
        session,
      });
      const fname = `code-review-${review}-${base}-${new Date().toISOString().slice(0, 10)}`.replace(
        /[^A-Za-z0-9._-]+/g,
        '_',
      );
      return reply
        .header('content-type', 'text/markdown; charset=utf-8')
        .header('content-disposition', `attachment; filename="${fname}.md"`)
        .send(md);
    } catch (e) {
      return bad(reply, e);
    }
  });

  const webDist = resolveWebDist();
  if (fs.existsSync(path.join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
