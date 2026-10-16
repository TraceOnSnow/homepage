# Library 最小集成

## 媒体库（2026-10-15 更新）

前台导航和标题为“媒体库”（原“体验清单”），保留 `/library` 地址。卡片最多关联一篇文章：有已发布文章时，只在短感受位置显示一个蓝色链接，短感受留空则用文章标题；无文章或文章是草稿时，非空短感受仍是灰色文字。不再重复显示“相关文章”区域，也不把标题写入短感受。

右上角默认“最近体验”：取后台“体验记录”中最近的结束日期，未填结束日期则使用该次开始日期；完全没有体验日期时使用条目的添加时间。不会用作品发行日期或修改时间替代。日期按网站时区显示为“体验于／记录于”。另支持最近添加、最早体验、评分从高到低、标题排序。

“有感想”为暂定筛选名称，包含非空短感受或已关联文章，可与游戏／书籍等类型及计划中／已完成等状态组合。无需新增字段或迁移数据库，已有作品记录保持原样。

验证：Library 10 项单元检查通过；Astro 类型检查 0 errors、0 warnings、2 个原有 hints；修改文件 Biome 检查通过。真实 11 条公开记录的 1440px 和 390px 浏览器检查通过：默认与五种排序、个人日期、组合筛选、无横向溢出、无页面异常、访客无 Works API 请求。只读浏览器脚本 `tests/library/view.browser.mjs`，指定 `LIBRARY_VIEW_ORIGIN` 使用对应生产预览或线上地址。

发布器的首屏校验复用 `src/lib/library/view.ts` 的真实排序，避免超过 24 条记录时与旧 slug 顺序不一致；防抖仍保持 180 秒。仅更新前端代码时，可在部署目录执行 `python3 publish-library.py --refresh`，对未改变的已发布数据重建；若数据同时发生变化，仍遵守正常静默期。

入口为 `/library`，导航显示“媒体库”。页面复用 Koharu 的 Bangumi 卡片网格、类型切换、状态筛选和 24 条分页，没有增加复杂管理前端或独立作品详情页。

## 运行与更新

在根目录 `.env` 中配置：

```dotenv
PAYLOAD_URL=http://127.0.0.1:3000
```

这个地址只用于开发服务器和构建进程，不需要登录、API key 或 Provider 凭据。Payload 仍是作品数据唯一来源。

分别启动：

```sh
# 终端一
cd services/payload
npm run dev

# 终端二，在仓库根目录
pnpm dev
```

打开 http://localhost:4321/library。开发模式刷新页面会重新读取公开作品。静态发布时，先保存后台作品，再在根目录运行 `pnpm build`，随后发布新的 `dist/`。

构建自动读取所有公开 API 分页，只序列化展示字段。访客不请求 Works API；筛选与分页在浏览器内完成。已配置的后台读取失败会终止构建，不发布空数据。未设置 `PAYLOAD_URL` 时仍可独立构建 Koharu，Library 显示空列表；完整 Library 构建需要后台数据服务可访问。

卡片展示名称、封面、个人评分、状态、发行年份和简短感想。未评分时留空，0 分正常展示，不使用社区评分。上传封面优先于外部封面；卡片标题链接到资料来源。

上传与外部图片仍由对应媒体地址提供。部署时 Payload 的 `SERVER_URL` 应生成访客可访问的媒体 URL；构建用的地址可以与公开媒体地址不同。关闭后台不会影响已构建的文字/筛选，但其托管的图片可能不可用。

## 在 Payload 中关联文章

完成 [文章迁移与部署](posts-deployment.md) 并使用 `CONTENT_SOURCE=payload` 后，在 Works 中通过“关联文章”选择已有文章、原生抽屉新建或编辑文章。标题与 Markdown 正文在 Posts 中保存，文章页面仍由 Koharu 生成。草稿和下架文章不生成公开卡片链接，同语言翻译与回退沿用主题行为。

文章与作品共享发布队列，最后一次公开内容变化后静默 180 秒构建。修改短感受、改文章标题、发布或下架文章均通过后续构建生效。

## 原文件模式兼容

`CONTENT_SOURCE=files` 仍用于迁移前开发及回滚。在该模式下可保留旧 frontmatter 关联：

在文章 frontmatter 的 `works` 中填写 Payload Works 的 slug：

```yaml
---
title: 我的游戏体验
link: playing-tunic
date: 2026-10-13
works:
  - tunic
---
```

文章发布后，对应短感受成为文章链接，留空时显示文章标题。草稿不显示。多语言页面按 Koharu 原生文章翻译/回退规则生成链接。

切换 Payload 后只使用 Works 的单值关系，不再读取 `works` frontmatter；不要同时编辑两套文章来源或关联。

## 改样式的位置

- `src/components/library/LibraryCollection.tsx`：类型、状态与分页，按原 Bangumi 交互改造。
- `src/components/library/LibraryCard.tsx`：卡片展示与文章链接。
- `src/components/common/ArticleNote.tsx`：媒体库感想与首页项目开发文章共用的文字链接。
- `src/styles/components/bangumi.css`：沿用原样式；目前未改动此文件。
- `src/lib/library/data.ts`：公开 API 字段映射、分页和文章关联。

`data-work-slug`、`data-library-type`、`data-library-status` 可以作为后续定制样式的定位点。中文/英文 Library UI 已提供，其他语言沿用主题的默认文案回退。

## 检查

```sh
pnpm test:library
pnpm test
pnpm check
pnpm lint
# 需要已构建的独立 Payload、对应 Playwright Chromium
pnpm test:library:browser
```

浏览器回归使用临时真实 Payload 数据库，创建八类作品和上传封面，构建静态页面，验证筛选/分页/文章跳转/私密与草稿排除，以及后台停止后的阅读。测试会覆盖当前 `dist/`，结束后删除测试文章；正式发布前运行一次普通 `pnpm build`，恢复真实作品与内容的输出。

GitHub 自动部署、服务器 Nginx 路由、媒体托管和生产 Docker 验证留在部署阶段处理。
