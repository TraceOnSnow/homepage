---
name: homepage-content
description: Manage homepage Works and Markdown Posts through one standard Payload API client. Use for adding or updating media-library entries, writing drafts, publishing articles, and linking an article to a work.
---

# Homepage 内容管理

使用本 skill 同目录的 `scripts/content-client.mjs`；仓库内也可执行 `node scripts/content-client.mjs`。这是普通 Payload REST 客户端，Python 等程序可以调用相同 API，不依赖 AI、MCP 或服务器 SSH。

运行环境需要 Node 22.20 或以上。`HOMEPAGE_URL` 为网站地址，`HOMEPAGE_API_KEY` 为 Payload「内容客户端」的原生 API Key。通过私有进程环境、权限 `0600` 的 `.env.content.local`，或 `~/.config/homepage-content/client.env` 提供；可用 `HOMEPAGE_CONTENT_ENV` 指定配置文件。不要读取、输出管理员密码、PAYLOAD_SECRET、构建令牌或 API Key。工具没有账号、上传、部署权限。

## 共同操作

`--help` 不需要凭据。以下命令中的客户端路径按 skill 所在位置解析：

```sh
node scripts/content-client.mjs works list --query "作品名"
node scripts/content-client.mjs posts list --query "文章名"
node scripts/content-client.mjs works get 12
node scripts/content-client.mjs posts get 34
```

创建、修改、关联、发布、下架和删除默认只预览；用户已授权相应任务时加 `--apply` 执行，无需对同一授权重复确认。执行后重新读取核对。写入超时先查实际结果，不能盲目重试创建。删除须有针对该条目的明确授权。

修改前读取当前内容，只发送所需字段；保留其他评分、感想、状态、体验日期、正文和文章设置。审阅后执行时使用返回的 `updatedAt` 作为 `--expected-updated-at`。冲突时重新读取，保留用户修改；这属于乐观检查，不保证跨管理员操作的绝对事务锁。

## 作品

- 按标题、`--slug` 或 `--provider NAME --external-id ID` 查重。不同版本、同名作品有歧义时先核对。
- `metadata search TYPE "名称"`，再使用候选来源与 ID 调用 `metadata details TYPE "名称" PROVIDER ID`。不编造检索结果或把社区评分当个人评分。
- 创建资料写入私有 JSON，执行 `works create FILE [--apply]`；需要 `title`、`type`、稳定 `slug`。新作品默认私密、未知状态为空；用户要求公开时设置 `visibility: "public"`。
- 更新用 `works update ID FILE [--apply]`。只补空事实字段；数组更新保留原项和 `id`。年月记录不伪造具体日期，可保留在体验笔记。
- 类型：game、anime、book、movie、tv、manga、comic、boardgame；个人评分 0–10，未知留空。

## 文章

```sh
node scripts/content-client.mjs posts create /private/article.json --markdown /private/body.md --apply
node scripts/content-client.mjs posts update 34 /private/patch.json --apply
node scripts/content-client.mjs posts publish 34 --apply
node scripts/content-client.mjs works link 12 34 --apply
```

创建 JSON 至少包含 `title` 和稳定 `link`（例如 `note/game-review`），语言默认 zh；可包含 Markdown、摘要、分类、标签、封面 ID、发布日期和其他主题选项。正文可直接读取 UTF-8 Markdown 文件，保留原语法，不转换为富文本。

创建及修改默认保存草稿。只有用户要求发布时执行 `posts publish ID`，它会发布最新草稿，而非旧公开正文。`posts unpublish ID` 是下架，`posts delete ID` 是删除，两者不同。修改标题不擅自修改固定链接、发布日期、语言和其他设置。

作品关联文章用 `works link WORK_ID POST_ID`，不改写原短感受；短感受为空时前台自动使用文章标题。当前工具可引用已有封面 ID，不能上传图片。

已发布内容仍经过网站现有的 180 秒静默期和生产构建；保存成功不代表页面立即更新。GitHub 部署用于代码更新，不用于日常写文章。需要配置、字段与权限详情时读取仓库 `docs/content-tools.md`。
