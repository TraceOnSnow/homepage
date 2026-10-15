# 项目阶段与迁移边界

## 第一阶段：Koharu 基础

已导入 Koharu 7.7.4，配置 TraceOnSnow 域名、作者、头像、联系方式和 About。保留示例内容以验证 Markdown、搜索、RSS、分类、归档、多语言和编辑器。写作室已开启；Bangumi 示例账号已关闭，避免展示他人的收藏。两个旧项目移到 `legacy/`，移动前后 Git 状态一致。

验证结果见下方记录。已迁入一篇历史文章，尚未批量迁移或部署自动化；Payload 与 Library 状态见后续阶段，未修改线上服务。

## 第二阶段：独立 Payload（已迁移）

`services/payload/` 已建立独立 npm 应用，保留原锁文件、Payload 3.90.2、Next.js 16.3.7 和 React 19；根目录 Koharu 的 pnpm workspace 不包含它。服务单独开发、构建和部署。

已复用 Works、Media、Users、shared/slug 字段逻辑、全部 `src/lib/metadata/`、MetadataSearch 与 CSS、必要的 UI 字典及 Payload Admin/API 路由。八个 Provider 和后台搜索组件逐文件比较与旧项目一致。只启用 Works/Media/Users，移除 `relatedPosts` join、Posts/Projects Collections 和所有旧公开页面；后台根地址只重定向到 `/admin`。

### 旧数据和持久化

旧库通过 SQLite backup API 导入本服务 `storage/payload.db`，原始库与上传未修改。6 条作品、1 个管理员、0 条 Media、1 条旧文章和 5 条旧项目的数据均保留；旧文章/项目表作为历史数据存在，不提供对应 Collection/API。除迁移记录外，副本与旧库所有数据表逐行一致，原账号的密码数据、密钥和作品 ID 均保留。

复用旧提交 migrations，关闭 schema push。导入先检查 schema、完整性和外键，再仅在副本中把 dev-push 标记转换为已应用 baseline，防止 CREATE TABLE 重放。脚本拒绝覆盖已有数据库、配置或非空上传目录；未来 migration 需要审查删除操作，不自动清理历史表。

`storage/media` 与数据库分开持久化。Compose 为 database/media 设置独立 bind mounts，构建上下文仅本服务。Dockerfile/Compose 已复用并解析检查，当前没有 Docker 运行验证或服务器操作。

### 验证结果（2026-10-13）

- ESLint、TypeScript 通过，依赖安装与锁文件检查通过。
- 12 项 Provider/字段映射单元测试、3 项 SQLite 集成测试通过。集成覆盖公开/私密 CRUD、管理员登录、上传、评分和 URL 校验、可重复迁移，以及导入副本后跨进程重复启动的数据和图片保留。
- Next 生产构建通过，输出只包含后台、API、根重定向和 not-found；构建器提示 `Compiled with warnings`，未附具体 warning 明细。仍未配置邮件适配器。
- 开发与生产两种 Playwright 流程均通过：创建管理员、搜索/选择/补全/保存、八个来源的表单流程、中文后台、JWT API 更新、匿名拒写和私密拒读；仅外部资料返回结果模拟。
- 八个真实来源的搜索与详情均通过，凭据仅留本地，smoke 脚本不保存作品。不声称所有候选均能补全：BGG 的 Catan 第一条搜索结果是扩展条目，`thing?type=boardgame` 返回空项；选择精确匹配的 Catan 本体后详情通过，原有失败提示/降级保留。
- 已导入的旧库副本通过实际生产 API 读取：6 条公开作品，ID、slug、评分、状态和笔记与 SQLite 一致；Posts API 不存在，资料搜索需要认证。
- Payload 停止后，根目录 Koharu 独立构建通过：300 个静态页面、Pagefind 304 页，未增加后台运行依赖。

使用方法见 `services/payload/README.md`。Library 状态见第三阶段，上线尚未执行。

## 第三阶段：Library 最小集成（已实现）

`/library` 和对应语言页面已接入，导航显示作品库。复用 Bangumi 的网格、卡片视觉、类型/状态切换与 24 条分页；原 `bangumi.css` 逐字节未改动，没有重新设计复杂 UI 或作品详情页。

根目录 `PAYLOAD_URL` 仅用于开发/构建读取公开 `/api/works`，处理全部 API 分页。开发刷新读取最新数据；生产构建只序列化展示字段，浏览器不调用 Works API。已配置 API 读取失败时构建报错，未配置时可独立构建空 Library。代码、依赖与部署仍独立，构建完整作品页时需要数据 API 可访问。

作品支持八种类型，显示个人评分、状态、发行年份、简短感想和封面。上传缩略封面优先，0 分正常展示、未评分留空；不使用来源社区分数。标题链接到资料来源。图片仍依赖公开媒体地址，不承诺关闭其媒体服务后图片可用。

文章通过 frontmatter `works: [作品-slug]` 关联，卡片提供阅读链接；草稿不显示，语言链接采用 Koharu 原生翻译/回退规则。文章仍只存 Git Markdown，未增加 Payload Posts 或复杂后台关联选择器。

### 验证结果

- 6 项 Library 单元测试通过，覆盖八类/五状态、私密排除、个人评分、上传封面优先、URL 校验、公共字段白名单、API 分页/失败及文章关联。
- 完整主题测试 359 项全部通过；类型检查无错误/警告，保留原有 2 hints；lint 通过，保留上游 6 infos。
- 隔离真实 Payload 数据库创建 33 条公开作品、1 条私密作品和上传封面，实际生成静态 Library；1440px 与 390px 浏览器均通过筛选/分页/八种类型、评分 0 与未评分、封面、Markdown 跳转、多语言和无横向溢出检查。
- 私密作品与草稿标记不出现在 Library HTML；后台停止后卡片文字与文章链接可用，关闭浏览器 JavaScript 后静态卡片仍可见；访客 Works API 请求数为 0。
- 测试文章和临时数据库已清理；正式输出重新构建为真实 6 条公开作品，304 个静态页面、Pagefind 308 页。关闭实际后台后的桌面/手机预览均显示这 6 条作品，Works API 请求数为 0；五张现有外部封面已验证加载。

使用和改样式入口见 `docs/library.md`。

### 本地可用优先

按最新约定，仅迁入《个人 Markdown 语法备忘录》及其配图；正文保持原样，转换主题 frontmatter 并置顶，未批量迁移。先试用访客前台、添加作品和写作保存，内容与卡片样式等体验反馈后再调整。使用入口见 `docs/local-usage.md`。

修复原生 CMS 新建文章缺少 `link`、导致后续开发启动/构建被迁移检查阻止的问题。新文章自动记录与文件路径一致的固定链接，同时正确转义标题、分类、标签中的 YAML 标点。新增回归验证直接调用原生迁移规划器，确保新建内容无待迁移项目；写作逻辑测试共 129 项通过。

2026-10-14 本地使用验收：真实浏览器在写作台 New Post → 保存到博客 → Publish → 前台读取 → 重新编辑均通过，临时验收文章已删除；迁入的文章可阅读并可在写作台打开。Astro 检测文件更新需要短暂等待，刷新后读取新内容。生产版 Payload 的八来源表单、保存与权限流程再次通过，测试使用隔离数据库；实际本地 API 保留原 6 条公开作品。类型检查 0 errors、0 warnings、2 原有 hints；lint 无错误/警告，6 原有 infos。尚未部署，三个本地入口见使用指南。

正式构建通过：312 个静态页面、Pagefind 316 页。输出包含迁入文章及配图，Library 卡片 slug 与实际数据库的 6 条公开作品一致，未残留临时验收文章。

最终静态浏览器检查通过：桌面与 390px 手机作品库、文章正文、实际配图均可用，无页面异常和访客 Works API 请求；三个本地开发入口返回成功。用于验收的静态预览已关闭，开发网站、作品后台和写作台保留运行供试用。

## 第四阶段：部署与自动化

Nginx 托管 Astro 的 `dist/`；Payload 独立 Compose 服务，SQLite 与 Media 持久化。先验证备份、恢复和公开访问，再做 Git Push 构建部署和 Agent 的认证写入。作品改动在下一次成功构建发布后生效。图片若仍在 Payload 或外部来源托管，可用性仍取决于对应媒体服务。

## 验证记录

2026-10-13，Koharu 固定提交 `329ce55513a8057708c93c11c5b8c096680ad83c`：

- `pnpm install --frozen-lockfile`：主站与 CMS 依赖安装成功，锁文件与上游相同。pnpm 提示若干依赖构建脚本被阻止；实际 Astro/CMS 构建与编辑流程已成功，未为无关依赖开放额外脚本权限。
- `pnpm check`：630 个文件，0 errors、0 warnings、2 hints；提示为上游剪贴板兼容逻辑和浏览器测试中的 deprecated `execCommand`。
- `pnpm lint`：通过，6 条上游 info，无 errors/warnings。
- `pnpm build`：通过，300 个静态页面，Pagefind 索引 304 个页面；存在上游大 chunk 提示和示例 Infographic 的 Shiki plaintext 回退提示。
- `pnpm --dir cms build`：通过；保留上游 bundle size 与 Node 模块 browser externalization 提示。
- `pnpm test`：修复后完整测试链通过，共 353 项、0 失败。CLI 备份/恢复此前有 12 项失败：GNU tar 创建目录归档时记录 `./manifest.json`，上游读取代码只接受 `manifest.json`。现已兼容两种精确路径，并增加真实 tar 归档的回归测试；`pnpm test:migrate` 共 68 项全部通过。原有路径、类型、manifest 一致性和恢复回滚检查继续有效；验证使用临时目录，不操作旧库或真实备份。
- 默认测试包含 `test:moments`、`test:motion`、`test:index`，本轮完整执行通过；独立 `pnpm test:editor` 的 128 项测试在第一阶段已通过。
- 原生 `tests/editor/workbench.browser.mjs`：公开写作室和本地 CMS 的桌面、390/320 宽度流程通过；覆盖原文复制/下载、CRLF/BOM、草稿重载、写盘、外部修改冲突与删除。截图路径已改为系统临时目录以支持 Linux。
- 生产 Chromium 浏览器检查：桌面和 Android 尺寸下，首页、个人介绍、文章、静态搜索、主题切换与持久化、写作室通过；页面无未捕获异常、首页无横向溢出。RSS、canonical、sitemap、robots 与头像请求正常。未验证真机 Safari/iOS。
- 两个 `legacy/` 项目的 Git 状态与移动前逐字节一致；许可证与锁文件保持上游内容，测试文章已清理。

为绕过本次工具沙箱对子进程、IPC 和监听端口的限制，部分检查在正常本地权限下运行；浏览器及 pnpm 下载缓存使用临时目录。未修改系统配置或全局工具。

静态 Nginx 部署仍未执行。Nginx 写作室的新链接卡片实时抓取需要 Koharu 文档中说明的独立预览服务；当前保留原生写作能力，不承诺所有外部依赖离线可用。
