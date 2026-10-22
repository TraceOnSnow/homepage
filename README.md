# TraceOnSnow

我的个人主页，记录技术学习、软件项目、作品体验和生活随笔。

**[访问网站 → traceonsnow.com](https://traceonsnow.com)** · [关于我](https://traceonsnow.com/about) · [GitHub](https://github.com/TraceOnSnow)

## 网站里有什么

- **文章**：技术笔记、学习记录和个人随笔，使用 Markdown 写作。
- **项目**：自己做过的软件和工具，以及相关的开发记录。
- **体验清单（Library）**：记录游戏、书籍、电影、剧集、动画、漫画和桌游的体验状态、个人评分与体验日期。
- **感想与长评**：作品卡片可以展示短感受，也可以关联一篇文章，继续展开记录。
- **站内搜索**：通过 Pagefind 搜索已发布的内容。

## 技术与内容管理

网站基于 [Astro Koharu](https://github.com/cosZone/astro-koharu)，由 Astro 构建静态页面，Nginx 托管。Payload 提供统一的文章、作品和媒体后台，SQLite 数据库与上传文件独立持久化。

文章在 Payload Posts 中保存原始 Markdown，支持草稿、发布和编辑，继续由 Astro 渲染。Library 在构建时读取公开作品，默认按个人体验结束时间排序，未填写时按添加时间排序。资料来源只用于补充作品的事实信息，个人评分、感想和体验日期由自己记录。

AI 和普通脚本共用标准 Payload API，通过同一套 [homepage-content skill](skills/homepage-content/SKILL.md) 和 [内容客户端](docs/content-tools.md) 管理文章与作品，包括批量收录、补空白资料、文章发布和作品关联。工具使用专用内容身份，写入默认只预览，确认执行时才加 `--apply`；凭据单独配置，不随仓库分发。

```sh
node scripts/content-client.mjs --help
node scripts/content-client.mjs works list --query "TUNIC"
node scripts/content-client.mjs posts list --locale zh
```

## 本地运行

要求 Node.js ≥22.20.0、pnpm 10.28.2，以 [package.json](package.json) 为准。

先按 [本地使用指南](docs/local-usage.md) 和 [Payload 后台说明](services/payload/README.md) 准备本机环境变量、开发数据库与上传目录，再安装依赖并构建：

```sh
pnpm install --frozen-lockfile
npm ci --prefix services/payload
pnpm preview:prepare
```

在 VS Code 的 WSL 窗口打开仓库，选择 **Homepage：全部服务（生产试用）**，按 **F5**：

| 用途 | 本机地址 |
| --- | --- |
| 网站 | http://localhost:4321 |
| 内容后台 | http://localhost:3000/admin |
| 作品表格 | http://localhost:3000/admin/works-table |

日常试用运行已构建的网站与生产模式后台。保存内容后执行 `pnpm preview:refresh`，再刷新前台；修改源码后停止服务，重新执行 `pnpm preview:prepare`。需要热更新时，另选开发模式。

本地开发数据与服务器正式数据独立维护。Git 同步源码和已审查的迁移脚本；数据库、上传文件、密钥和个人导入清单不提交 Git。原 `src/content/blog/` 中的文章保留为备份，当前正式站使用 Payload Posts 作为唯一文章来源。

## 开发与部署

在 WSL 开发并验证，服务器负责部署。主要检查命令：

```sh
pnpm check
pnpm lint
pnpm test
pnpm test:editor
pnpm --dir cms build
pnpm build
```

源码推送到 `main` 后，现有 GitHub Actions 执行检查、构建和镜像验收，成功后自动部署同一提交及镜像。内容编辑通过另一条发布流程处理：公开文章或作品变化后，等待最后一次变化后的 180 秒静默期，再构建和发布静态页面；失败保留旧站。

部署不会自动执行数据库迁移、重新导入内容或用本地数据覆盖正式数据。完整流程见 [CI/CD](docs/ci-cd.md) 和 [服务器部署](deploy/server/README.md)。

## 目录与文档

| 位置 | 用途 |
| --- | --- |
| `config/site.yaml` | 网站信息、导航和功能配置 |
| `src/pages/`、`src/components/` | 页面与组件 |
| `src/pages/about.md` | 个人介绍 |
| `src/data/projects.ts` | 首页项目资料 |
| `services/payload/` | 文章、作品与媒体后台，使用独立 npm 锁文件 |
| `skills/homepage-content/` | 统一内容管理 Skill 和标准 API 客户端 |
| `cms/` | 上游原生 Markdown 工具，用于文件模式；不编辑当前 Payload 文章 |
| `deploy/server/` | 部署模板，正式配置、数据和证书在独立部署目录维护 |

- [Library 使用](docs/library.md)与[作品表格](docs/works-table.md)
- [内容工具与 API](docs/content-tools.md)
- [本地使用](docs/local-usage.md)
- [开发交接](docs/development-handoff.md)与[阶段记录](docs/project-status.md)
- [项目展示](docs/projects.md)

## 来源与许可

感谢 [Astro Koharu](https://github.com/cosZone/astro-koharu) 提供的网站主题。本仓库保留上游署名与 [AGPL-3.0 许可证](LICENSE)。

上游资料见 [原始 README](docs/upstream/README.md)、[快速开始](GETTING-STARTED.md)和[上游版本与修改边界](docs/upstream-source.md)。
