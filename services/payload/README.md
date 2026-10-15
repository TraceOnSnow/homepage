# Payload 作品管理后台

独立的 Next.js + Payload Admin/API。复用旧 `zhiheng-homepage` 的 Works、Media、Users、八个 Metadata Provider 和后台搜索组件，不提供博客或个人主页。

## 本地使用

本服务保留原 npm 锁文件与依赖版本，独立于根目录 Koharu/pnpm workspace。

```sh
cd services/payload
npm ci
npm run dev
```

打开 http://localhost:3000/admin。本次已复制旧数据库和私密配置到本服务的本地 `storage/`、`.env`，原账号仍可使用，源数据库不被后台访问。凭据、数据库和上传均不入 Git。

新机器从空库开始时，安装依赖后执行：

```sh
npm run setup
npm run db:migrate
npm run dev
```

也可从旧项目导入：

```sh
# 在尚无 .env、数据库和非空上传目录的新服务中执行
npm run import:legacy -- ../../legacy/zhiheng-homepage
npm run dev
```

导入通过 SQLite backup API 生成一致副本（含已提交 WAL），检查完整性、外键和已提交 schema；复制上传及原账号密钥。只在副本中把 dev-push 标记转换为已应用迁移，不重跑建表 SQL、不替换账号。已有目标数据时拒绝覆盖。

## 数据边界

- 只启用 `works`、`media`、`users` Collections；旧 Posts/Projects API 和旧公开页面已移除。
- Works 的 `relatedPosts` join 已移除；未来文章关联由 Markdown 管理。
- 评分、状态、感想、体验记录、来源 ID、上传封面和作品 ID 保持原结构。
- SQLite `push: false`，本地与生产统一使用已提交 migrations。沿用旧迁移以兼容旧库，旧文章/项目表保留但不作为新站内容源；生成未来 schema 迁移时审查删除操作。
- `storage/payload.db` 和 `storage/media/` 持久化。备份时同时保留 SQLite 一致快照、上传文件和恢复所需的本地密钥。
- Media 是公开图片素材；Works 可设置 private。所有登录账号都是管理员。

## API 与作品资料

公开只读入口：`GET /api/works` 和 `GET /api/works/:id`，只返回公开作品。登录后可通过原生 REST 写入；暂沿用 Payload JWT/登录认证，不增加 Agent 发布基础设施。

后台 `/admin/collections/works/create`：选择类型→搜索→选择资料→填写自己的评分/状态/感想→保存。来源仅补全事实资料，不覆盖自己填写的字段。

来源保留 IGDB、RAWG、Google Books、Open Library、微信读书、TMDB、Bangumi、BGG；配置项见 `.env.example`。凭据只留服务端。缺失凭据、限流和详情失败使用原有提示/降级，不保证所有来源的每个候选都有完整资料。

## 验证

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:providers:live  # 使用本地凭据，只搜索和读取公开资料
npm run build
npx playwright install chromium
E2E_PRODUCTION=1 npm run test:e2e
```

集成测试使用独立临时 SQLite 和上传。持久化测试在独立进程中创建→导入→重复重启，验证账号、ID、作品字段与图片；拒绝覆盖已有目标。浏览器测试只模拟外部资料结果，登录、表单、保存和 API 均使用真实生产应用。不要同时构建和运行开发浏览器测试，它们共用 `.next`。

## 部署预留

复用 `Dockerfile`、`compose.yaml` 和 `deploy/.env.production.example`，构建上下文仅为本服务。Compose 分别 bind mount database/media，应用只映射到宿主机 loopback；迁移使用 `--profile tools`。当前未部署服务器，Docker 运行验证以阶段记录为准。

原后台源码许可证保留在本目录 `LICENSE`。Koharu 和访客网站仍由根目录管理。
