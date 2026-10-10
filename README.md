# Code Review

团队面对面 code review 工具：一台机器投影大屏、一人驾驶，选两个分支快速过改动。

## 功能（M1 + M2 + M3 + M4）

- 运行时选择本地 git 仓库，选择 review 分支 + 对比分支
- 改动文件列表（新增/修改/删除/重命名、±行数、每文件评论数）
- **拖拽排序**（dnd-kit，鼠标/键盘均可），按 仓库+分支对 持久化，重开自动恢复
- 三模式 diff 展示（单栏 unified + 行内词级高亮）：
  - **聚焦改动**：只显示 hunk ±3 行上下文；**展开整个方法**（tree-sitter 语法级边界，Java/TS/TSX/JS，其余语言退化为 ±50 行通用展开）；hunk 头显示所在方法名
  - **方法视图**：所有改动行所在的方法整体自动展开，逐方法过改动逻辑
  - **全文件**：虚拟滚动全量渲染，↑/↓ 或按钮逐个跳转改动项（含 3/12 计数与闪烁定位）
- **行级评论（内联）**：点击代码行号，composer 与评论卡片直接出现在该行代码下方，随代码滚动、折叠（折叠区里的评论由右栏导航/全文件模式兜底）；右栏瘦身为评论导航 + 失效评论收纳；代码行尾与文件列表均有 💬 徽标
- **刷新 + 评论智能保留**：分支有新提交后点"刷新"重拉 diff；评论按行内容哈希自动跟随移动的代码，内容已改/已删的标"已失效"待人工确认；通知条显示统计（保留/移动/失效/文件增减）
- **导出纪要**：一键导出 Markdown 会议纪要（按拖拽后的文件顺序分节，评论带侧别行号 + 代码快照）
- **跳转定义（IDEA 风格）**：⌘点击 符号 / 选中符号后 ⌘B → 跨文件跳到函数/类/方法定义（全仓库 tree-sitter 索引，review 开始时后台预热）；多定义弹选择器；**定义行上 ⌘点击 反查调用方**（多个弹选择器，直接落到调用行）；**任意文件只读浏览器**（语法高亮 + 定位闪烁 + 可继续跳转）；⌘[ / ⌘] 或 Ctrl+Alt+←/→ 回退/前进，Esc 返回
- **调用链树（侧栏树模式）**：改动文件间调用关系建树（tree-sitter 提取调用点，Kotlin 等无 grammar 语言降级为标识符扫描），入口文件为根逐层下探，共享文件在每个调用者下重复出现并标已读（✓）；可一键把调用链拓扑序回填文件列表，导出纪要同步此顺序。定位是导航提示：动态分发/同名符号按名字解析可能误连，构建失败静默降级为平铺

## 数据存储

会话存于 `~/.code-review/<仓库哈希>/sessions/<review>__<base>.json`（原子写、与仓库目录完全分离），包含文件顺序、评论（含 contentHash，供后续刷新智能保留）、基准 commit。

## 使用

已发布到 npm 时（推荐团队安装方式）：

```bash
pnpm add -g crv-review             # 或 npm i -g crv-review
crv /path/to/repo                  # 起服务并自动开浏览器
crv                                # 不带参数则进首页，点"选择仓库文件夹"选择
pnpm dlx crv-review /path/to/repo  # 不想全局安装可用一次性执行
```

从源码运行：

```bash
pnpm install
pnpm build
pnpm start                          # 起服务并打开首页 → 点"选择仓库文件夹"（系统原生对话框）
pnpm start -- /path/to/repo         # 也可带路径直开指定仓库
```

开发模式：

```bash
pnpm dev:server                    # API 服务 :5175（tsx watch）
pnpm dev:web                       # Vite 开发服 :5173，/api 代理到 5175
pnpm test                          # 单元测试（diff 解析/会话存储/导出）
```

## 发布到 npm

```bash
pnpm run pack                      # 构建 + prepack 拷贝 web 产物 + 产出 packages/server/crv-review-x.y.z.tgz
npm whoami                         # 未登录先 npm login
cd packages/server && npm publish  # 正式发布（发 npm 公网，包内容公开可见）
```

- 包名在 `packages/server/package.json` 的 `name`（现为 `crv-review`，改名前用 `npm view <名字>` 确认可用），命令固定为 `crv`
- `files` 只含 `dist`（编译后 server）与 `web-dist`（前端产物，prepack 自动从 packages/web/dist 拷入）
- 不想公开代码的替代方案：GitHub Packages（`npm publish --registry=https://npm.pkg.github.com`，配 `.npmrc` 认证）、自建 verdaccio 私服、或直接把 `pnpm run pack` 产出的 tgz 发给同事 `npm i -g ./crv-review-x.y.z.tgz`

## 结构

```
packages/server   Fastify + simple-git + web-tree-sitter(Wasm)：分支列表、diff 解析（自研 unified 解析器 + jsdiff 词级配对）、方法边界解析、定义索引（git archive 快照 + 扫描，按 commit sha 缓存）、会话存储、刷新重锚定、Markdown 导出、静态托管
packages/web      React + zustand + @tanstack/react-virtual + dnd-kit + Shiki + Tailwind v4
```

注：Kotlin grammar 的 npm 包未随包发布 wasm（最高 0.3.8），Kotlin 文件暂走通用折叠与无符号跳转。
