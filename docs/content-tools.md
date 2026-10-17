# 网站内容工具

作品与 Markdown 文章使用同一个 Payload、一个标准 REST 客户端和一个 [homepage-content skill](../skills/homepage-content/SKILL.md)。`node scripts/content-client.mjs` 可由人或程序直接使用；skill 只约定 AI 的操作方式，不增加另一套 CRUD API、内容数据库或 MCP 服务。

## 认证和权限

Payload 新增 `content-clients` 原生 API Key 身份，标准请求头为 `Authorization: content-clients API-Key <KEY>`。它能管理 Works、Posts（含草稿、发布、版本读取和关联），以及调用现有元数据查询；不能进入 Admin、管理 Users 或内容客户端、上传／修改／删除 Media，也不能使用文章构建接口。原管理员和密码不变。所有 Collection 使用服务端 access control，客户端说明不承担权限隔离。

管理员可在后台「内容客户端」创建、生成、更换或撤销 API Key。密钥保存后不再通过读取 API 返回；需要时生成新密钥。开发运维也可在已迁移数据库的 Payload 镜像内运行：

```sh
node --import tsx scripts/create-content-client.ts "Personal content tools" /private/new-client.env https://traceonsnow.com
```

这是一次性运维入口，不给 AI 使用。输出文件须为新文件，父目录须存在；输出权限 `0600`，只报告 ID 和文件路径，不输出密钥。重名身份或已有文件会停止，不能盲目重跑。

客户端通过私有进程环境、当前目录 `.env.content.local` 或 `~/.config/homepage-content/client.env` 读取 `HOMEPAGE_URL`、`HOMEPAGE_API_KEY`；`HOMEPAGE_CONTENT_ENV` 可指定其他文件。参考 [配置示例](../.env.content.example)。凭据文件权限必须 `0600`，不进入 Git、聊天或命令参数。把同一密钥复制到另一台机器是人工选择，不随 Git 同步。

普通 Python 程序也可以直接调用相同接口：

```python
import json, os, urllib.request
request = urllib.request.Request(
    os.environ['HOMEPAGE_URL'] + '/api/posts?draft=true',
    data=json.dumps({'title': '新文章', 'link': 'note/new-post',
                     'markdown': '## 原始 Markdown', '_status': 'draft'}).encode(),
    headers={'Authorization': 'content-clients API-Key ' + os.environ['HOMEPAGE_API_KEY'],
             'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(request) as response:
    created_id = json.load(response)['doc']['id']
```

## 一个客户端管理两类内容

```sh
node scripts/content-client.mjs --help
node scripts/content-client.mjs works list --query "TUNIC"
node scripts/content-client.mjs metadata search game "TUNIC"
node scripts/content-client.mjs works create /private/work.json
node scripts/content-client.mjs works update 12 /private/work-patch.json --apply
node scripts/content-client.mjs posts list --locale zh
node scripts/content-client.mjs posts create /private/article.json --markdown /private/body.md --apply
node scripts/content-client.mjs posts update 34 /private/post-patch.json --apply
node scripts/content-client.mjs posts publish 34 --apply
node scripts/content-client.mjs works link 12 34 --apply
node scripts/content-client.mjs posts unpublish 34 --apply
```

所有写命令默认只预览，`--apply` 才写入。新作品要求稳定 slug，默认私密、状态已完成；待体验显式设置 `status: "planned"`，未说明是否体验过时先核对或设 `null`。新文章要求稳定 link，默认保存草稿。文章 JSON 可设置 title、markdown、link、locale、publishedAt、description、tags、cover、categories、frontmatter；`--markdown` 从 UTF-8 文件读取正文，不转富文本。发布状态使用独立 publish/unpublish 命令。

体验时间沿用 `experiences[].startedOn/endedOn`，支持 `YYYY`、`YYYY-MM`、`YYYY-MM-DD` 或空；旧 ISO 时间戳保持兼容。通常只填写结束时间。进度、通关次数或备注统一写作品 `note`；旧体验记录的状态、平台、进度、备注不自动搬入公开短感受。更新数组时保留其他行、ID 和未修改的原始日期。后台批量整理入口为 `/admin/works-table`，见 [作品表格](works-table.md)。

读取文章默认包含最新草稿。修改公开文章保存为新草稿，旧正文继续公开；publish 会发送最新草稿正文和原有设置，避免仅改发布状态而漏掉最新编辑。unpublish 下架，delete 删除；删除关联文章后 Payload 的现有外键把作品关联置空，原短感受保留。

更新可附 `--expected-updated-at`，按审阅时的版本执行；客户端复查，标准批量 PATCH/DELETE 用 ID 和更新时间筛选并检查恰好一条成功。草稿与公开文档时间不同，因此发布／删除使用公开基表的筛选，同时复查最新草稿。这里不是跨管理员编辑的原子 CAS，发生冲突须读取核对；写入超时不得盲目重试创建。部分更新不发送未改字段；数组修改应保留原行 ID。

已发布内容继续通过原发布器静默 180 秒后构建。写内容不提交 Git，也不触发代码部署；图片上传和 MCP 协议适配不在本轮范围。

## 部署与兼容

新迁移 `20261017_171808_content_clients` 仅新增身份表、索引及 Payload 内部关系表的可空关系列；不改 Users、Works 或 Posts 数据，不重新导入。自动部署仍拒绝未执行迁移，需先在生产副本验证和备份后手动迁移。down 拒绝删除身份，代码回退可保留新增表。

旧 `library-agent.mjs`、旧专用接口和清单导入脚本保留兼容，但不再扩展为文章接口；旧 Bearer 令牌不能用于新客户端。唯一推荐 skill 是 homepage-content。安装时将该 skill 文件夹放入 AI 工具的技能目录，或在 Codex 中链接到 `~/.codex/skills/homepage-content`；skill 内的客户端不依赖仓库 node_modules，只需 Node。WSL 通过 Git 获取源文件，凭据单独安全配置。
