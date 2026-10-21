# Homepage 开发与部署交接

## 当前交付：同一仓库的 Markdown library / Works 草稿支持（2026-10-21）

用户本轮明确允许在服务器继续开发。`/home/trace/projects/homepage-workflow-dev` 是**现有 Homepage 同一个 Git 仓库**的 `codex/markdown-publishing` worktree，与 `/home/trace/projects/homepage` 共用 Git 元数据；不是另建网站项目或另一套生产数据库。独立工作目录用于保留生产 checkout 中用户已有的 docs／skill 改动，避免运行中的内容 timer 读到尚未迁移的混合源码。下面 WSL 优先、旧字段和“下一版本”等记录保留为历史；本节及用户最新授权优先。

当前源码已实现 Works 原生草稿／版本、显式发布和下架；作品表格、统一客户端和保留的旧工具都以保存草稿为默认行为。公开旧版本在编辑期间继续展示；发布／下架携带最新完整字段并保留数组 ID、部分日期、评分与关联。访客与冻结构建输入仅接受 `draft=false`、public+published，Markdown 工作区的 Works 正文不因此成为网站公开字段。网站仍独立使用 Payload、SQLite 和 Admin；Markdown library 普通程序使用现有标准 API，不增加模型服务或另一套网站存储。

迁移 `20261021_034349_works_drafts` 和同名 schema JSON 已实现；需要无外层事务的专用迁移进程（`PAYLOAD_IMPORT_TRANSACTION=0`）。旧表原字段、关系和数组 ID 保留；旧公开作品初始化 published、私密作品初始化 draft。down 拒绝删除历史，仅允许使用 draft-compatible release 回退应用。后端、客户端、本机 HTTP 往返、生产构建及两条真实 Admin 浏览器场景已通过。新增部署保护另有 17 项临时 Git／SQLite 回归通过，防止迁移后旧 API 回退暴露草稿；没有因此执行生产迁移。

已在只读一致备份的新私密副本上完成真实数据演练：585 Works、19 Posts，76 public→published、509 private→draft、585 初始版本；25 张旧表全部旧列逐行哈希及数组／关系 ID 不变，integrity／FK／schema／重复迁移通过。完整 latest/base、limit=100 分页、版本及原生 REST 草稿列表一致；匿名公开集合和私密／版本权限通过。发现并修正本轮新增迁移的版本 texts 路径为 `version.*`，未改旧文本表；补了四种文本数组、分页和单版本回归。原 before 备份 SHA 保持不变，报告在忽略的 `.cache/workflow-real-data/rehearsal-5ZVOm3/report.json`；可复现命令见上线计划。仅使用合成配置／内存身份与空隔离媒体，没有读取生产凭据、登录或监听服务。最终 release image 及上线时新备份仍需复核。

源码、迁移、前端与运行目录 publisher 必须协调切换。运行中的旧 publisher 会 import 生产 checkout 的前端 sanitizer，提前拷贝新前端可能把旧 API 无 `_status` 的全部作品排除并构建成空媒体库；不得为了“放回原项目”先改生产源码。迁移后也不能仅保留新 schema 却回退旧 visibility-only API。部署失败时保留最后静态站，保留兼容的新应用／数据或进入维护状态；使用兼容 release 修复，不能 fresh/reset/down、恢复空库或覆盖期间的新编辑。

完整的固定版本、备份／真实副本演练、维护锁、迁移／应用／publisher／前端切换及保留 schema 的回退步骤见 [Markdown library 上线计划](operations/markdown-library-rollout.md)。实际 `public/current` 可能因内容 timer 更新而晚于 `evidence/deployment.json.site`，必须在维护开始时现场捕获。已有生产 checkout 修改需先保留、审查；当前交付不覆盖它们。

**当前状态是已验证源码交付，尚未生产部署。** 真实库／媒体／凭据／原管理员未改，未重启正式服务、未执行真实内容同步，也未接入用户的真实 Vault。生产镜像和静态站实际状态以当前运行 evidence 及现场只读核对为准；源码 worktree 的存在和测试通过不代表已上线。

## 当前可体验入口

已补齐回环8767的示例后台和匿名公开效果验收页，含3条示例作品、2篇示例文章。浏览器已实测保存草稿保持旧公开版、明确发布更新、下架与再次发布；正式库、原8766网页及真实Markdown内容未改变。入口、步骤与停止／重启方式见 [体验与验收](operations/workflow-acceptance.md)。

## 工作边界

分工：Agent 负责本地开发、测试和交付；用户负责服务器操作。需要服务器复测或上线时，提供已验证的改动、结果及操作说明，由用户执行。Agent 不主动连接服务器，也不请求服务器凭据、SSH 身份或连接信息。

本地数据库和上传文件用于开发／测试，服务器数据库和上传文件用于正式内容，两边独立维护。Git 只传递源码和已审查的迁移脚本；数据搬运、密钥配置和生产迁移分别处理，数据搬运须有明确请求。

在用户电脑的 WSL 中开发、验证、提交并推送；腾讯云服务器运行已审查的代码、管理内容并部署。新增字段、迁移和业务规则应先提供具体方案，经批准后实施。不得自动覆盖评分、短感受、状态和体验日期。

生产 checkout 和仓库外部署运行目录保持独立；参考 `deploy/server/README.md`。模板不能直接在仓库中运行，也不能整体覆盖真实部署目录、配置或数据。

## 统一内容工具后续交接

用户已批准把作品与文章放在同一个普通客户端和 skill 中，通过 Payload 标准 API 操作。当前源码提供 `pnpm content:client`、`skills/homepage-content` 及 `content-clients` 原生 API-key-only 身份；账号／上传／部署权限不授予该身份。旧 Works Agent 路径只保留兼容，不作为文章接口扩展。迁移、配置与使用见 [网站内容工具](content-tools.md)，生产是否启用以正式迁移和部署记录为准。

## 服务器最新状态（2026-10-18）

经用户批准，服务器已完成 Posts 正式迁移、18 篇个人文章导入、`CONTENT_SOURCE=payload` 切换和文章／作品统一自动发布。原管理员和服务器原有 11 条作品保留，未用 WSL 的 36 条作品覆盖服务器数据。正式生产构建 156 页、Pagefind 160 页；备份、实际检查和权限边界见 [部署执行记录](posts-deployment.md)。下面“上一版本／下一版本”及“服务器仍需执行”等文字是本地交接时的历史描述。

GitHub 远程生产部署随后按用户授权接通，流程见 [自动检查与部署](ci-cd.md)：`main` 的 push CI 成功后自动部署，仍可手动选择成功 CI 重试或回退。数据库迁移继续单独审查。Works Agent 专用令牌、skill 安装和文章 MCP 仍属于后续范围。

## 已上线的上一版本

- Astro 静态站、Nginx HTTPS 和证书自动续期。
- Payload Works、Media、Users；原管理员和数据已保留，公网 `/admin` 可管理作品。
- 体验清单的体验日期、添加时间回退、五种排序和感想筛选。
- Works 公开数据变化后静默 180 秒构建并原子发布，失败保留旧站。
- 文章仍来自 Git Markdown。上述描述不代表本轮新 Posts 已部署。

## 已批准并在 WSL 实现的下一版本

具体方案见 `docs/posts-implementation-plan.md`，服务器执行任务见 `docs/posts-deployment.md`。

- 普通 Markdown Posts，使用独立 `cms_posts` 表，保留历史富文本 `posts` 表。正文保存原文，标题、固定链接、日期、语言和主题选项映射到原生 Astro 内容集合；未增加另一套 CMS 或文章页面。
- 每个作品只选一篇文章，复用 Payload 原生选择器及新建/编辑抽屉。短感受有内容就显示其内容，留空时动态显示文章标题；占位文字不写数据库。无公开文章时显示灰色短感受，有文章时显示一个蓝色链接，最多三行，不再重复列出相关文章。
- `CONTENT_SOURCE=files|payload` 只选一个文章来源。当前 WSL 已经备份、导入 18 篇旧文并切换为 payload；服务器仍需执行迁移交接。Payload 模式不读取 Git 文章或 `works` 关系，生成文件仅是忽略的构建输入，原 Markdown 留作备份不再编辑。
- 密码文章和加密块的正文拒绝匿名 API 访问；仅认证管理员和携带 `CONTENT_BUILD_TOKEN` 的只读构建接口可读取。令牌不能写入任何内容，不能进入浏览器或 Git。
- 同一个发布器观察文章和作品，包括未关联文章、下架与合法空集合；共用锁和防抖，冻结输入后构建，失败保留旧站。需要按交接部署新源码及配置，运行中的旧发布器不会自动获得这些能力。

本地日常 F5 已改为 **Homepage：全部服务（生产试用）**：轻量静态预览＋`next start`，不再默认运行开发编译器。构建与内容刷新使用独立任务，具体入口及边界见 [本地试用](local-usage.md)。服务器部署方式未改变。

## 数据迁移

根目录 `pnpm content:plan` 生成私有导入计划，后台 `npm run import:markdown` 先 dry-run，再由明确 `--apply` 执行事务导入。不覆盖已有文章；多篇关联冲突、缺失作品、MDX 或相对图片依赖需要先处理，不擅自选择或丢弃。

原始 Markdown 和数据库/媒体保留备份。正式部署前先在副本演练、备份真实运行数据，再执行迁移/导入/配置切换；不要用新空库冒充生产数据。

## 后续范围

作品字段简化与批量表格的实现说明见 [作品表格](works-table.md)：日期沿用现有 SQLite 文本列，兼容年／月／日和旧时间戳；无数据库迁移。新作品默认已完成，待体验入口显式设为计划中；关联笔记复用原生 Posts 选择与编辑抽屉。实现和本地验证不代表已部署，生产以部署执行结果为准。

- 顶栏已收敛为首页、文章、媒体库、关于、友链。“媒体库”沿用 `/library`；暂时隐藏周刊推荐、歌单入口和 BGM，不开展动态功能。
- 首页项目区复用媒体库卡片样式和文章链接组件，初始资料沿用旧博客 5 个项目；当前由 `src/data/projects.ts` 管理，未增加后台字段或迁移，见 `docs/projects.md`。

- 在线预览尚未接入真正的 Astro 渲染；当前先复用普通文章页验证效果。
- 本地已提供受限 Works Agent API、JSON CLI 和仓库 skill，见 [媒体库 Agent](library-agent.md)。独立专用令牌仅用于作品 CRUD 和现有元数据查询，不访问 Users、Posts 或 Media，不直接操作 SQLite；skill 尚未安装到自动发现目录。尚无 MCP 服务或 Posts AI 角色，所有登录用户仍为管理员；不要把管理员凭据交给 AI 工具。
- 仓库已提供推送 CI、测试镜像发布和手动生产部署工作流，见 `docs/ci-cd.md`；服务器入口安装、GitHub 环境/密钥配置、首次迁移及真实部署验收尚未执行。完整灾备恢复仍需单独任务。
