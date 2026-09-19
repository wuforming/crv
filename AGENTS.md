# AGENTS.md

面对面 Code Review 会议工具：本地 Web 应用（单机投影、一人驾驶），选两个 git 分支对比过改动、行级评论、导出纪要、跳转定义。沟通与 UI 文案用中文。

## 常用命令

```bash
pnpm build                 # 全量构建（server tsc 产出 dist；web tsc --noEmit + vite build）——必须用显式 filter，勿用 -r（根包会自递归死循环）
pnpm test                  # server 单测（vitest，含真实 tree-sitter wasm 解析）
pnpm lint                  # Biome check
pnpm dev:server            # API 服务 :5175（tsx watch）
pnpm dev:web               # Vite :5173，/api 代理 5175
pnpm start -- /path/to/repo  # 起成品服务并自动开浏览器（端口占用自动 +1）
pnpm run pack              # 构建 + 打包 npm tarball（packages/server/crv-review-*.tgz）
./scripts/make-demo-repo.sh  # 重建演示仓库 /tmp/crv-demo（多分支，覆盖 M/A/D/R）
```

改动 server 后必须 `cd packages/server && npx tsc -p tsconfig.json` 再用 `pnpm start` 验证——start 跑的是 dist，不是 src。

## 发布（npm 包 crv-review，bin 命令 crv）

- 发布单元是 `packages/server`（名字 crv-review）；web 产物由 prepack 脚本拷入 `packages/server/web-dist`（gitignore，勿手动提交）
- 静态资源解析 `resolveWebDist()`：打包态 web-dist 优先，开发仓库回退 packages/web/dist——两处布局都要兼容
- pnpm 的 `pack` 不支持 `--filter`（报 Unknown option: 'recursive'），打 tarball 统一用 `pnpm --filter crv-review exec npm pack`

## 结构

- `packages/server`（Fastify + simple-git + web-tree-sitter）：
  - `diff.ts` 自研 unified diff 解析器（勿引入 parse-diff）+ jsdiff 词级配对
  - `git.ts` 全部 git 调用；diff 一律 `base...review` 三点 + `-M`
  - `tree.ts` 方法/类边界（Java/TS/TSX/JS；**Kotlin 无 wasm grammar，必须保持通用折叠降级，勿让解析失败阻塞 API**）
  - `defs.ts` 跳定义索引：git archive 快照到 tmp，按 **commit sha**（非分支名）缓存，LRU 上限 4
  - `store.ts` 会话存 `~/.code-review/<sha256(repo)前12位>/sessions/`，原子写；`refresh.ts` 评论按 contentHash 重锚定
  - `dialog.ts` 系统原生文件夹选择（macOS osascript）；测试桩 `CRV_ENABLE_PICK_STUB=<路径>` 仅测试用
  - `server.ts` 路由：会话类端点必须先 `validateRepo` 规范化仓库真实路径
- `packages/web`（React18 + zustand + react-virtual + dnd-kit + Shiki + Tailwind v4）：
  - `store.ts` 单一 zustand store，服务端交互集中在 `api.ts`
  - `lib/rows.ts` 渲染行模型（范围合并：hunk ±ctx / 方法区域 / expandAllMethods / gap 扩展 / 内联评论槽位交错），聚焦、方法视图、全文件三模式共用
  - 手写 diff 行组件（`DiffRowView` 等），**不引入现成 diff 视图库**；全文件模式虚拟滚动用 measureElement 动态测高（评论卡片变高），行 key 必须稳定（`rowKey`）
  - 评论卡片内联在锚定行后（跟随折叠）；右栏仅做导航 + 失效评论 CRUD（失效评论无行内槽位，其编辑在右栏渲染 Composer）

## 已知坑（改相关代码前必读）

- shiki 3.x `codeToTokens` 返回 `{ tokens }`（highlight.ts 已兼容多形态，勿简化回 `.lines`）
- macOS `/tmp` → `/private/tmp` 符号链接：任何以路径为键的存储/索引必须先 `rev-parse --show-toplevel` 规范化
- 定义索引缓存键必须用解析后的 sha；按分支名会让新 commit 命中旧索引
- pnpm 10 拦 esbuild/biome 安装脚本：根 package.json `pnpm.onlyBuiltDependencies` 已放行，新装带构建脚本的依赖要补
- 保存会话时 server 端补齐评论 `contentHash`（sha256(snippet)），刷新锚定依赖它，勿在客户端删掉该字段语义
- 测试里 vitest ESM 环境，禁止内联 `require()`，统一顶部 import

## 约定

- Server 传前端的 diff 行号一律在 hunk 解析时重算（`finalizeNumbers`），不信任文本偏移
- 新 API 路由放 `server.ts`，错误统一 `bad(reply, e)`（取首行，simple-git 报错多行）
- UI 纯展示增强（语法高亮失败、grammar 缺失、索引失败）都必须静默降级，不弹错
