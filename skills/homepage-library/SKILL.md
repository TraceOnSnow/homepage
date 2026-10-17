---
name: homepage-library
description: Add, find, edit or delete homepage media-library Works and search their metadata through the restricted Payload Agent API. Use for media records and experience notes, not article authoring or server administration.
---

# Homepage 媒体库

在仓库根目录使用 `node scripts/library-agent.mjs`。凭据从私有 `.env.agent.local` 或已有进程环境读取；后端需要同一 `LIBRARY_AGENT_TOKEN`。不要读取、打印或传递管理员密码、`PAYLOAD_SECRET`、Provider Key；不要直接编辑 SQLite。

## 操作

- `list --query "名称"`、`list --slug "slug"`、`list --provider bangumi --external-id 428735`：查重和查找；分页使用 `--page N --limit 100`。
- `get ID`：读取完整作品，包括当前 `updatedAt`。
- `metadata-search anime "名称"`；用返回候选的来源与 ID 调用 `metadata-details anime "名称" bangumi ID`。保留部分失败提示，不编造搜索结果。
- 把新作品或修改字段写入私有 JSON 文件；`create FILE`、`update ID FILE` 默认仅预览，确认已有任务授权后加 `--apply`。
- `delete ID` 默认预览；仅在用户明确要求删除对应作品或清理本次测试记录时使用 `delete ID --apply`。不批量删除。

类型：`game`、`anime`、`book`、`movie`、`tv`、`manga`、`comic`、`boardgame`。状态：`planned`、`in-progress`、`completed`、`on-hold`、`dropped`；未知状态写 `null`。新作品默认私密，用户要求公开时才明确设置 `visibility: "public"`。个人评分为 0–10，未知留空。

## 内容规则

先按来源 ID、slug 和标题检查已有作品。资料补全只补空事实字段；不把社区评分当个人评分，不覆盖已有感想、评分、状态、封面或体验日期。修改仅发送必要字段；更新数组前读取原数组并保留每个原项及其 `id`。涉及不同作品、版本或同名条目时保留歧义，不强行合并。

年／月记录不能伪造为 1 月 1 日。现有日期字段要求具体日期；不精确体验原文可保存在 `experiences[].note`，日期字段留空。不根据一句“想看”之外的模糊回忆推断完成状态。

更新／删除自动携带刚读到的 `updatedAt`；审阅后再应用可指定 `--expected-updated-at TIMESTAMP`。遇到冲突或写入超时，先重新读取核实，不盲目重试创建或删除。接口只提供 Works 与八个既有来源的检索，不具备账号、文章、上传或部署权限。

完成后重新查询核对，说明创建／更新／跳过数量和未解决项。静态网站更新需要重新构建或等待已部署的内容发布流程；API 保存成功不等于线上页面已更新。
