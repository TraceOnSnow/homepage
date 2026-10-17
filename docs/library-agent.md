# 媒体库 Agent 使用

新的统一入口为 [homepage-content skill](../skills/homepage-content/SKILL.md) 和 `pnpm content:client`，作品、文章共用 Payload 原生 API Key 及标准 REST API，详见 [网站内容工具](content-tools.md)。旧 homepage-library skill 已由统一 skill 替代。

以下保留旧 `pnpm library:agent` 客户端与清单导入脚本的兼容用法。旧接口和独立 Bearer 令牌不扩展文章能力，不是新工具的认证方式；生产环境未配置旧令牌。

## 认证与运行

后台 `services/payload/.env` 配置独立的 `LIBRARY_AGENT_TOKEN`（至少 32 字符，建议随机 32 字节）。客户端复制 `.env.agent.example` 为忽略的 `.env.agent.local`，设置相同令牌和后台地址，文件权限 `0600`。凭据不放进命令参数、聊天、Git 或浏览器。空令牌禁用接口；管理员 Cookie/JWT 和文章构建令牌不能代替。

`POST /api/library-agent` 只接受专用 Bearer；仅能读写 Works 和查询现有八个元数据来源，不能修改 Users、Posts、Media、原始 SQL 或部署配置。新作品默认私密、未知状态为空。该令牌也能读取私密作品，须只交给受信任 Agent；撤销或更换后台令牌后重启后台即可失效。远程客户端要求 HTTPS，本地支持 loopback HTTP。

## 常用命令

```sh
pnpm library:agent --help
pnpm library:agent list --query "作品名"
pnpm library:agent get 12
pnpm library:agent metadata-search anime "葬送的芙莉莲"
pnpm library:agent create /private/work.json
pnpm library:agent create /private/work.json --apply
pnpm library:agent update 12 /private/patch.json
pnpm library:agent delete 12
```

创建、修改、删除默认只预览；经任务授权加 `--apply` 才写入。创建需稳定 slug；按来源 ID、slug、名称查重后再创建。修改只发送需要变化的字段，数组应保留原项目及 `id`。更新／删除附带 `expectedUpdatedAt`，冲突返回 409；审阅后应用可传 `--expected-updated-at TIMESTAMP`。这是乐观检查和同进程 Agent 串行写入，不承诺跨管理员进程的绝对事务锁。

## 旧清单导入

```sh
node --import tsx scripts/import-works-log.ts /path/works-log.md /private/new-report.json
node --import tsx scripts/import-works-log.ts /path/works-log.md /private/new-apply-report.json --apply
```

先备份数据库和上传文件，再预览。报告必须是新文件且权限 `0600`；记录每次成功操作，失败立即停止。批次不具备跨 HTTP 事务，失败后先核对完成清单和现库，不能盲目重跑或覆盖原库。

仅整理明确作品，忽略“待整理想法”。音乐不在当前八类中；来源冲突留待核对。已有作品只补空事实字段，保留个人评分、状态、感想、上传封面和体验。只知道发行年份时不伪造发行日期；年月体验原文写入体验笔记，具体日期留空。保存到 API 后，静态前台仍需重新构建或等待已部署的发布队列。
