# Markdown Posts 部署交接

## 当前边界

源码已实现 Posts、单篇关联、Koharu 渲染与文章/作品统一发布。默认 `CONTENT_SOURCE=files` 保留原站；新迁移、新表和导入均须先在副本验证。WSL 实现不代表线上已切换。

Posts 使用 `cms_posts` 和 `_cms_posts_v`，保留原来的富文本 `posts`、Projects、账号、评分、感想、状态和体验记录。迁移只新增表、索引、可空关联列。`down` 明确拒绝删除文章数据；回滚优先恢复应用代码，真正撤销数据操作使用完整备份。

## 给服务器的执行任务

1. 检查 Git 工作区和实际运行目录，仅拉取已审查提交。备份原代码提交、`runtime.env`、SQLite 一致快照、Media、发布状态及 `public/current` 指向，记录恢复路径。停止正在运行的发布任务；切换期间也暂停 timer 和 Payload 写入，避免备份/导入中产生变更。不要把仓库目录整体同步到部署目录。
2. 在仓库根目录生成私有导入计划（目录必须已存在，输出必须是新文件）：

   ```sh
   pnpm content:plan src/content/blog /private/incoming/new-markdown-plan.json
   ```

   计划可能包含受保护正文，权限为 `0600`，只通过私有通道传输。不提交 Git。MDX、相对 Markdown 图片、重复链接会停止预检；本次 38 篇现有 `.md` 已在隔离库验证。原文件只读保留，导入后不再编辑它们。
3. 使用**副本**数据库和 Media 演练新镜像、迁移、导入及构建。先运行 `payload migrate`，再在同一新镜像中运行 `node --import tsx scripts/import-markdown.ts /private/plan.json` 做 dry-run，确认后加 `--apply`。容器需要把计划只读挂载到对应路径；沿用现有真实 `PAYLOAD_SECRET` 和持久卷，不能初始化空库替代原数据。
4. 导入默认拒绝同语言同链接的现有文章、缺失作品、已有关系及一个作品多篇候选。事务包含全部新文章与关系；失败全部回滚，不覆盖旧文章。不要直接重复 `--apply`；有冲突先检查清单。
5. 副本演练通过后，对已备份的正式库按相同顺序执行迁移、dry-run 和导入。设置新 `CONTENT_BUILD_TOKEN`（`openssl rand -hex 32`），在 Payload 和发布器使用同一私密值，保留原 `PAYLOAD_SECRET`。配置 `CONTENT_SOURCE=payload`。不要在聊天、Git、命令参数或构建日志中输出令牌。
6. 审查后仅同步本次变更的 `publish-library.py` 和 `systemd/homepage-library-publish.service` 到仓库外运行目录。后者新增 `EnvironmentFile`，需要用户级 daemon-reload；沿用原 timer，不增加服务。重新创建后台容器，使新代码和令牌生效。
7. 在真实运行目录执行发布器 `--refresh`。来源切换会改变内容指纹，仍遵守 180 秒静默期；成功前保留旧静态发布。验证文章、体验清单、搜索、RSS、分类、归档及加密文章。恢复原 timer，检查首次自动发布和服务重启后数据保留。

现有部署的镜像构建上下文仅为 `services/payload/`，镜像现已包含 `scripts/`，不需要把 Astro 源码放入后台镜像。导入计划由根目录生成，后台独立消费 JSON。

## 日常使用与权限

- `/admin/collections/posts`：标题、Markdown 正文，其他设置包含固定链接、语言、日期、标签和分类；使用原生保存草稿与发布操作。新文章首次保存生成固定链接，修改标题不自动改链接。
- Works 的“关联文章”：原生选择、新建、编辑；“短感受”的标题占位不会写入数据库。没有公开文章时短感受灰色显示；有文章时只显示一个蓝色链接，空短感受使用文章标题。
- Payload 模式只从 Posts 生成 `.cache/payload-posts/content`，不合并 Git 文章。构建前同步，开发模式下编辑后重启 Astro 重新同步；静态站沿用现有发布队列。
- 匿名 `/api/posts` 只能读取公开、非受保护的已发布文章；草稿、历史版本、密码文章与加密块正文拒绝匿名读取。
- `/api/content/posts` 仅提供 GET，使用 `Authorization: Bearer <CONTENT_BUILD_TOKEN>` 获取已发布构建快照；不能据此写文章或作品。令牌只存在于服务器进程，不进入浏览器或静态产物。
- 发布器冻结文章与作品输入，再进行一次构建；构建后如公开内容已变化，继续等待静默期。合法空清单也可发布；接口失败不清空网站。失败后的退避从失败结束时计算。

## 回滚

构建失败时 `public/current` 保持不变。需要撤回已发布页面时恢复记录的旧发布链接，并暂停自动发布以免再次切换。需要应用回退时恢复旧代码和原运行配置，保留新增表及原数据；确需撤销导入则停止写入、恢复已验证的数据库和 Media 备份。旧文件模式可由 `CONTENT_SOURCE=files` 恢复，但不能同时继续编辑两份内容。

尚未实现真正的 Astro 在线预览、AI/MCP 或受限 AI 角色。没有执行此交接前，不宣称服务器已具备新文章管理功能。
