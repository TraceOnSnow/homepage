# TraceOnSnow

现有线上部署源码见 [服务器部署](deploy/server/README.md)，推送检查与手动上线见 [CI/CD](docs/ci-cd.md)；后续在 WSL 开发、服务器仅部署，已实现与待办范围见 [开发交接](docs/development-handoff.md)。

以 [Astro Koharu](https://github.com/cosZone/astro-koharu) 为基础的个人网站，统一域名为 `https://traceonsnow.com`。

## 本地运行

要求 Node.js ≥22.20.0、pnpm 10.28.2（以 `package.json` 为准）。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

访问 http://localhost:4321。另开终端运行 `pnpm cms`，在 http://localhost:4322 管理 Markdown 文件。公开 `/editor/` 保存浏览器草稿；从本地 CMS 打开文章才可保存到文件。提交 Git 和部署仍是后续操作。

第一次试用先看 [本地使用指南](docs/local-usage.md)，分别启动网站、写作台和作品后台。

```sh
pnpm check
pnpm lint
pnpm test
pnpm test:editor
pnpm --dir cms build
pnpm build
pnpm preview
```

生产构建生成 `dist/`，可由 Nginx 静态托管。配置修改后重启开发服务器或重新构建。

## 内容与目录

- `config/site.yaml`：域名、作者、头像、导航和可选功能。
- `src/content/blog/`：当前文件模式的文章；切换到 Payload 模式后作为历史备份，停止编辑。已迁入一篇个人文章，其余为主题示例。
- `src/pages/about.md`：个人介绍。
- `cms/`：Koharu 原生本地 Markdown 管理工具。
- `services/payload/`：已迁移的独立作品管理后台，使用自己的 npm 锁文件；[使用说明](services/payload/README.md)。
- `legacy/`：两个旧项目的完整本地参考，保留原 Git 历史与未提交修改；不入新仓库，不参与检查、构建或部署。

Payload 管理作品、媒体、管理员和 Markdown 文章。八个元数据 Provider 为作品补全事实资料，评分、状态和感想由自己填写。Library 在构建时读取公开作品；每个作品可选择一篇文章，短感受留空时显示文章标题，已有短感受不被覆盖。详见 [Library 使用](docs/library.md)。

文章来源由 `CONTENT_SOURCE=files|payload` 选择，默认保留文件模式。启用 Payload 模式需要先备份、导入、验证，再配置构建只读令牌；操作顺序见 [文章迁移与部署交接](docs/posts-deployment.md)。原生写作室保留为 Markdown 工具，Payload 模式下应在 `/admin` 编辑文章。

顶栏为首页、文章、媒体库、关于、友链。首页项目卡片资料见 `src/data/projects.ts`，截图及开发文章关联说明见 [项目展示](docs/projects.md)。周刊推荐、歌单入口和背景音乐暂时隐藏，动态功能继续关闭。

## 作品后台

```sh
cd services/payload
npm ci
npm run dev
```

访问 http://localhost:3000/admin，使用原管理员账号。当前本地数据库是旧项目的一致副本；旧库保留原样。新机器初始化和导入步骤见后台 README。Koharu 与 Payload 的代码、依赖和部署独立；构建完整 Library 时需要访问后台公开 API，访客不会请求作品 API。未配置数据地址时可单独构建 Koharu 的空 Library。

## Library 数据地址

根目录 `.env` 中设置 `PAYLOAD_URL=http://127.0.0.1:3000`。后台启动后，打开 `/library` 查看作品；开发时保存作品后刷新页面，线上静态站则需要重新构建并发布。文章可通过 `works: [作品-slug]` 关联卡片，详见 Library 使用说明。

## 来源与进度

- [上游版本与修改边界](docs/upstream-source.md)
- [阶段状态与后续迁移](docs/project-status.md)
- [Koharu 原生快速开始](GETTING-STARTED.md)
- [上游 README](docs/upstream/README.md)
- [写作室说明](docs/features/editor.md)

保留 Koharu 的 [AGPL-3.0 许可证](LICENSE) 和原有署名。源码通过官方仓库导入，公开仓库为 [TraceOnSnow/homepage](https://github.com/TraceOnSnow/homepage)，保留用于跟踪主题的 `upstream` remote。网站已部署腾讯云；本轮文章功能在 WSL 开发，服务器切换需按部署交接执行。
