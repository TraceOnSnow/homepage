# 作品「云」标记（2026-11-21）

`works.cloud` 是独立于状态的布尔标记：看别人的实况、解说体验的作品设为 true，卡片封面右上角显示圆形云朵角标。默认 false，任何类型都可以加；电影、桌游没有状态条，但仍可以显示云朵。

## 数据与迁移

- 迁移 `20261121_040935_cloud_flag` 只做加法：`works.cloud` 和 `_works_v.version_cloud`，都是 `integer DEFAULT false`。不重建表，不改写内容、版本、发布状态或时间戳。迁移在一个事务内执行，执行后检查外键；`down` 拒绝删列。
- JSON 快照与前一个快照相比只多这两列。迁移后再运行 `migrate:create`，报告「No schema changes」。
- 现在运行的旧版应用可以直接读写迁移后的库：Payload 只读写自己认识的列，新插入的行用默认值 false。
- 旧库导入脚本 `import-legacy.py` 以前按「迁移名 ≤ 匹配到的 schema 基线」标记已执行的迁移。现在最新基线排在评分迁移之后，纯数据的评分迁移会被误标为已执行。已改为数据迁移一律不按 schema 推断，集成测试覆盖了这种情况。
- deployer 增加了保护：库里有 `cloud` 列或这条迁移记录时，拒绝部署或回退到不含这条迁移的版本，因为旧版本会把新草稿的「云」重置为 false。

## 生产切换顺序

自动部署不会执行迁移，而 deployer 要求库里已执行的迁移和待部署版本完全一致。所以要先迁移数据库，再合并代码：

1. PR 的 CI 通过后，暂停 `markdown-website-sync.timer` 和 `homepage-library-publish.timer`，等正在运行的同名服务结束。
2. 停止 Payload 容器（这段时间后台不可用，公开静态页不受影响）。用 SQLite backup API 把库一致备份到 `homepage-deployment/evidence/cloud-migration-<时间>/`，备份做完整性检查。
3. 在开发 worktree 用同一份迁移源码对正式库执行 `payload migrate`（`PAYLOAD_IMPORT_TRANSACTION=0`，使用一次性的测试密钥，不读取 runtime.env）。
4. 核对：两列存在、全部为 false、迁移记录末尾是本迁移、`integrity_check` 与外键检查通过，并用 deployer 的 `check_migrations` 对 PR 版本放行。
5. 启动原容器，确认健康后恢复两个定时器。
6. 合并 PR。自动部署的迁移检查通过，应用和静态站一起切换。上线后核对 `/library` 与后台作品表格。

## 验证（开发阶段）

- 一次性空库从头迁移，结果正确。
- 生产库一致副本演练：652 部作品；30 张表除新增列外逐行哈希不变；`cloud`/`version_cloud` 全部为 0；完整性与外键检查通过。deployer 对迁移后的副本放行，对未迁移的副本拒绝。
- Payload：类型检查、50 项单元测试、ESLint 通过，表格补充了「云」的修改与发布判断测试。
- 站点：25 项 library 单元测试与 Biome 通过，补充了公开映射测试（true 才输出）；deployer 回归通过。浏览器测试补充了「电影带云朵、无状态条」，交给 CI 运行。
