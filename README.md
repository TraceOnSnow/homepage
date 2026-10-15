# TraceOnSnow

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
- `src/content/blog/`：Markdown / MDX 文章的唯一权威来源。已迁入《个人 Markdown 语法备忘录》，其余暂保留上游示例，内容随后调整。
- `src/pages/about.md`：个人介绍。
- `cms/`：Koharu 原生本地 Markdown 管理工具。
- `services/payload/`：已迁移的独立作品管理后台，使用自己的 npm 锁文件；[使用说明](services/payload/README.md)。
- `legacy/`：两个旧项目的完整本地参考，保留原 Git 历史与未提交修改；不入新仓库，不参与检查、构建或部署。

Payload 只管理作品、媒体和管理员。八个元数据 Provider 为作品补全事实资料，评分、状态和感想由自己填写。Library 已在构建时读取 Payload 的公开作品，修改后通过重建发布生效；[Library 使用与文章关联](docs/library.md)。

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

保留 Koharu 的 [AGPL-3.0 许可证](LICENSE) 和原有署名。源码通过官方仓库导入，公开仓库为 [TraceOnSnow/homepage](https://github.com/TraceOnSnow/homepage)，保留用于跟踪主题的 `upstream` remote。尚未部署或修改线上服务。
