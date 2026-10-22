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
node scripts/content-client.mjs works publish 12 --apply
node scripts/content-client.mjs works unpublish 12 --apply
node scripts/content-client.mjs posts unpublish 34 --apply
```

所有写命令默认只预览，`--apply` 才写入。新作品要求稳定 slug，默认私密草稿、状态已完成；待体验显式设置 `status: "planned"`，未说明是否体验过时先核对或设 `null`。新文章要求稳定 link，默认保存草稿。文章 JSON 可设置 title、markdown、link、locale、publishedAt、description、tags、cover、categories、frontmatter；`--markdown` 从 UTF-8 文件读取正文，不转富文本。发布状态使用独立 publish/unpublish 命令。

体验时间沿用 `experiences[].startedOn/endedOn`，支持 `YYYY`、`YYYY-MM`、`YYYY-MM-DD` 或空；旧 ISO 时间戳保持兼容。通常只填写结束时间。进度、通关次数或备注统一写作品 `note`；旧体验记录的状态、平台、进度、备注不自动搬入公开短感受。更新数组时保留其他行、ID 和未修改的原始日期。后台批量整理入口为 `/admin/works-table`，见 [作品表格](works-table.md)。

作品和文章的 list/get 默认读取最新草稿。create/import/update/enrich/link 保存草稿，不自动发布；公开旧版本在编辑期间继续展示。两类内容均使用独立 publish/unpublish：publish 发送最新草稿的全部可编辑字段及原有设置；unpublish 下架并保留最新未发布修改，delete 移入原生回收站并保留版本；恢复后保持草稿，重新公开需要明确发布。作品的 visibility 与发布状态独立：只有 `_status: published` 且 `visibility: public` 才公开。publish 保留所选可见性，私密作品即使发布也不会展示；修改 visibility 后保存草稿不会改变公开旧版本。关联文章移入回收站后保留原关联 ID 和短感受，公开读取不展示已删除文章；恢复沿用原身份。

更新可附 `--expected-updated-at`，按审阅时的版本执行；客户端复查，标准批量 PATCH/DELETE 用 ID 和更新时间筛选并检查恰好一条成功。草稿与公开文档时间不同，因此发布／删除使用公开基表的筛选，同时复查最新草稿。这里不是跨管理员编辑的原子 CAS，发生冲突须读取核对；写入超时不得盲目重试创建。部分更新不发送未改字段；数组修改应保留原行 ID。

已发布内容继续通过原发布器静默 180 秒后构建。写内容不提交 Git，也不触发代码部署；图片上传和 MCP 协议适配不在本轮范围。

## 批量收录作品

同一个客户端支持 `works import FILE [--apply]`，输入为 1–500 个已审阅作品对象组成的 JSON 数组，字段与单条 `works create` 相同：

```json
[
  { "title": "示例作品", "slug": "example-work", "type": "movie", "experiences": [{ "endedOn": "2024" }] }
]
```

```sh
node scripts/content-client.mjs works import /private/works.json
node scripts/content-client.mjs works import /private/works.json --apply
```

预览读取全部分页并列出 create/existing/review，实际写入逐条 POST 后 GET 核对。默认 completed/private/draft，显式未知状态 `null` 保留；评分、体验日期与短感受只来自用户资料。slug 先按 CMS 相同规则规范化并默认固定，避免大小写或标点造成误判。来源 ID 优先，标题／别名辅助查重；同名而来源不同、来源冲突或无关 slug 占用交给人工检查，不把它们误报为确定的同一作品。清单内部重复也会跳过。已有作品不会被 PATCH、发布或删除。

它不解析自然语言、不自动挑选元数据候选、不调用模型。Agent 先整理一次名单、检索并审阅身份，再由普通程序执行创建和核对，避免每条作品反复经过模型。书名明确但外部资料不可靠时可以只建基础记录；系列和作者名称仍留待确认。

写入异常后刷新记录，报告对应 IDs 并继续独立条目；若无法核实已有内容则停止，不重发 POST。结果在 `summary` 和逐项 `results` 中；检查 review 项，不把命令结束视为全部成功。工具不提供跨用户操作的数据库事务或来源唯一性约束，同时有人收录相同作品时仍需复查。它不自动重试、自动合并旧记录或修改数据库结构。源清单和结果可能包含私人内容，保存到权限受限、Git 忽略的目录。

## 联网查资料后补空字段

Agent 可以直接用自己的联网工具寻找正版页面、作者、ISBN 和封面，不必等某个元数据 API 命中，也不需要给 Payload 接入模型。核对作品和版本，检查封面在无 Referer 下可加载，再将事实整理为 JSON：

```json
{
  "coverUrl": "https://publisher.example/cover.jpg",
  "creators": ["作者"],
  "description": "简短的事实简介",
  "sources": [{
    "provider": "web",
    "externalId": "https://publisher.example/book/123",
    "url": "https://publisher.example/book/123",
    "fetchedAt": "2026-10-20T00:00:00.000Z"
  }]
}
```

```sh
node scripts/content-client.mjs works get 12
node scripts/content-client.mjs works enrich 12 /private/facts.json --expected-updated-at TIMESTAMP
node scripts/content-client.mjs works enrich 12 /private/facts.json --expected-updated-at TIMESTAMP --apply
```

`enrich` 将补充结果保存为待发布草稿，公开旧版本不变。它只补空的 coverUrl、description、releaseDate、creators、aliases、platforms，不能修改身份、个人记录、文章关联或可见性；数组字段只在整个数组为空时填入，已有上传封面时跳过外部封面。至少一个带时间的 HTTPS 资料来源为必填；来源追加去重并保留旧行 ID。默认预览，写前复查版本并在 PATCH 后回读，重复运行没有新事实便不发 PATCH。原有值有误时仍用普通 update，有明确依据后更正。

这是客户端辅助命令，联网、候选判断和图片检查由当前 Agent 完成。客户端不代替联网工具，不调用模型、不抓取任意 URL，不向资料站发送网站凭据；服务端继续只提供标准 CRUD。尚未核实的元数据留空，社区评分和作品发布日期不能替代个人评分与体验日期。外链可用性取决于源站，上传托管仍通过原后台完成。

## 部署与兼容

新迁移 `20261017_171808_content_clients` 仅新增身份表、索引及 Payload 内部关系表的可空关系列；不改 Users、Works 或 Posts 数据，不重新导入。自动部署仍拒绝未执行迁移，需先在生产副本验证和备份后手动迁移。down 拒绝删除身份，代码回退可保留新增表。

旧 `library-agent.mjs`、旧专用接口和清单导入脚本保留兼容，但不再扩展为文章接口；旧接口的作品读取改为最新草稿，新增／修改保存草稿，选择公开可见性也不会绕过发布动作。Markdown 导入脚本关联 Works 时同样只保存作品草稿。旧 Bearer 令牌不能用于新客户端。唯一推荐 skill 是 homepage-content。安装时将该 skill 文件夹放入 AI 工具的技能目录，或在 Codex 中链接到 `~/.codex/skills/homepage-content`；skill 内的客户端不依赖仓库 node_modules，只需 Node。WSL 通过 Git 获取源文件，凭据单独安全配置。


## Works 原生草稿迁移（仅开发验证，尚未上线）

`20261021_034349_works_drafts` 为 Works 开启与 Posts 相同的原生草稿／历史，每条最多 30 个版本；匿名版本接口拒绝访问。旧公开作品回填为 published，旧私密作品回填为 draft，原可见性与全部个人字段、ID、来源／体验行和文章关联保留。迁移创建初始版本与数组身份映射；必填字段的物理列放宽为可空以支持原生不完整草稿。

本次迁移已在一次性合成旧库核对所有原表原字段值及关联，实际生产库未执行。迁移先检查专用连接可关闭外键级联，再把表替换、数据复制与版本初始化置于同一数据库事务中，完成后重新启用外键并核对完整性。若在已有事务中执行会在改变既有数据前拒绝，应使用普通迁移环境而非 `PAYLOAD_IMPORT_TRANSACTION=1` 的导入环境。down 拒绝删除用户草稿和历史。

上线前仍需既有备份／真实副本复核和显式部署步骤；不要单独先替换发布器模板。静态 Works 构建读取显式 `draft=false` 并检查 public+published，文章关系沿用公开版本权限，避免草稿进入快照。源代码交付不代表既有服务已重启、生产迁移已执行或内容已发布。
