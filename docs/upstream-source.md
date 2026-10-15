# Koharu 上游来源

- 仓库：https://github.com/cosZone/astro-koharu
- 导入分支：`main`
- 固定提交：`329ce55513a8057708c93c11c5b8c096680ad83c`
- 提交日期：2026-10-10
- 主题版本：7.7.4；Astro：7.1.3；pnpm：10.28.2。
- 许可证：AGPL-3.0，保留根目录 LICENSE 和原始版权信息。

本项目复制该提交的 Git 跟踪文件，建立独立本地历史，保留 `upstream` remote。尚未在 GitHub 创建 fork 或 template 仓库。

第一阶段仅个人化配置、头像和 About，隔离本地 legacy 目录，并编写项目文档；另将写作台浏览器测试的 macOS 截图路径改为系统临时目录。博客功能、样式、写作室和 CMS 保留上游实现。CLI 额外修复 GNU tar 对 `manifest.json` / `./manifest.json` 的兼容，增加对应归档读取回归测试。上游说明和 Agent 指引保存在 `docs/upstream/`。主题更新前先备份与审查差异，尤其是 workspace、legacy 排除项、配置与后续 Payload 服务；当前未验证 Koharu 自动更新 CLI 对本项目结构的兼容性。

GitHub 新仓库地址待确定。正式部署前补充实际公开源码地址；站点保留主题署名及许可证，并提供对应源码入口。

## 后续项目扩展

独立 Payload 置于 `services/payload/`，Library 页面和公开字段转换置于 `src/components/library/`、`src/lib/library/`；根目录保留 Koharu 路由和配置结构。Library 复用原 Bangumi CSS，不修改其样式。文章 frontmatter 新增可选 `works` slug 数组，原生编辑器继续保留 Markdown。

CMS 新建文章额外修复：自动写入固定 `link`，防止原生迁移检查阻止启动/构建；标题、分类和标签使用兼容 YAML 的字符串转义。对应回归测试为 `cms/src/api/create.test.ts`。
