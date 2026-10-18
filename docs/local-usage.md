# 本地试用

本地 SQLite 和上传文件作为独立的开发／测试数据保留，服务器保存正式内容。两边数据独立维护；Git 同步源码和迁移脚本，数据库、上传文件与密钥留在各自环境。数据导入／导出按单独任务执行，不自动用一边覆盖另一边。代码更新后仍需在相应环境执行已审查的结构迁移，这不等于同步内容。测试客户端显式使用本地地址和本地凭据，避免读取其他环境的默认配置。

当前本地已启用 `CONTENT_SOURCE=payload`：在 `/admin/collections/posts` 管理文章，网站只读取 Payload Posts。旧 `src/content/blog/` 和 `legacy/trace-blog/` 作为备份，不再编辑；忽略的 `.cache/payload-posts/` 是构建输入，也不要手动修改。新机器／服务器切换仍须按 [迁移说明](posts-deployment.md) 准备数据和认证。

2026-10-16，本地公开文章已替换为旧博客的 18 篇个人文章，37 篇示例归档至 `_examples/`，不被站点收录。媒体库现有 36 条作品；当前已构建这些内容，可先运行 `pnpm preview` 查看静态成果，无需同时启动三个开发服务。Agent 录入与认证见 [媒体库 Agent](library-agent.md)。这些数据尚未迁移到服务器。

## VS Code 一键启动

用 VS Code 的 WSL 窗口打开 `homepage` 根目录。在“运行和调试”（`Ctrl+Shift+D`）选择 **Homepage：全部服务（生产试用）**，按 **F5**。网站与 Payload 就绪后自动打开页面；停止组合会一起停止服务。

默认运行已构建的程序：前台通过现有 Vite 的静态预览提供 `dist/`（跳过 Astro 配置与内容集成），后台 `next start` 使用生产构建。不启动实时编译、热更新或 Markdown 写作室。与服务器采用相同的“静态前台＋生产后台”模式；本地未使用 Docker/Nginx，系统、代理及容器开销不完全相同。

### 准备与更新

首次使用先安装根目录和后台依赖，并准备有效的后台 `.env`、已有数据库与上传目录；参考 [后台说明](../services/payload/README.md)。随后运行任务 **Homepage：准备生产试用**，或：

```sh
pnpm preview:prepare
```

准备前停止网站与 Payload。脚本先用临时数据库和临时密钥构建后台，再临时启动生产后台读取真实本地内容，最后构建静态网站并退出后台。两个构建顺序执行，编译进程的 Node 堆限制为 2 GiB；可用内存低于 768 MiB 时停止本次构建并保留日志。该保护不能保证系统永远不会内存不足。正常 F5 仅检查产物，缺失时提示准备，不自动编译。

- **只浏览或操作后台**：直接 F5；单独启动网站不需要后台运行。
- **保存文章／作品后更新前台**：保持后台运行，执行任务 **Homepage：更新静态页面** 或 `pnpm preview:refresh`，完成后刷新浏览器。构建期间前台可能短暂不可访问。
- **修改代码／配置后**：停止试用服务，重新运行 `pnpm preview:prepare`，然后 F5。启动检查不判断构建是否过期。

F5 不执行数据库迁移、导入或密钥替换。本地已有 18 篇已发布文章、36 条作品和原管理员，私有备份在后台忽略的 `storage/backups/`，请勿提交或公开分享。

需要修改源码并实时预览时，再选 **Homepage：开发热更新（高内存）**；该模式会运行两个开发编译器，不用于日常试用。Markdown 写作室保留单独入口，只管理 Git 文件，不写当前 Payload Posts。

启动命令通过 `zsh -lc` 使用登录 Shell 的 Node/pnpm 环境。共享配置位于 `.vscode/launch.json` 和 `.vscode/tasks.json`，无需额外调试扩展。任务菜单另有“检查网站”。

## 启动日志与内存排查

F5 的各服务及 API 等待任务通过 `scripts/dev-service.mjs` 启动。终端照常显示输出，同时将每次运行的记录保存在 `.cache/dev-logs/<时间>-<服务>-<PID>/`，不会覆盖前一次日志。`latest-site.txt`、`latest-payload.txt`、`latest-cms.txt`、`latest-wait.txt` 分别指向最近一次记录目录。

- `service.log`：带时间的标准输出和错误输出，包含编译及运行错误。
- `events.jsonl`：进程启动、退出码／信号、停止请求及端口占用。`SIGKILL`／137 说明进程遭强制终止，仍需结合内核记录确定是否为内存不足。
- `memory.jsonl`：每 5 秒记录系统可用内存、Swap、服务进程组的 RSS 和占用最多的进程；数值单位为 KiB，RSS 合计包含共享内存，不能当作独占内存。

日志目录仅当前用户可访问，已被 Git 忽略；不记录环境变量或完整进程参数，但服务自身输出仍可能含私密内容。WSL 整体停止或启动器被强制杀死时，可能没有退出记录，可检查最后的内存采样。普通停止会转发给服务进程组，清理残留子进程；端口已被占用时拒绝重复启动，不终止原服务。

终端手动启动也可以使用 `node scripts/dev-service.mjs payload`、`site` 或 `cms`（均在仓库根目录运行）。启动日志测试：`pnpm test:dev`。隔离副本上的完整生产试用验收：`pnpm test:preview:browser`（需已有构建、真实本地数据及空闲端口；会重新构建静态页面）。F5 关闭自动附加全部子进程的调试功能，以减少日常启动的开销。

排查系统内存压力时，结合最后一次采样及内核中的 `page allocation failure`、`Out of memory`、`Killed process` 记录判断。服务日志突然中断本身不能确定是内存不足；首次筛选的本机内核证据保存在忽略的 `.cache/dev-logs/initial-kernel-memory.log`。

## 手动启动

准备完成后，在仓库根目录打开两个终端，分别运行：

```sh
# 终端一：生产模式后台
node scripts/dev-service.mjs payload
```

```sh
# 终端二：静态网站
node scripts/dev-service.mjs site
```

Markdown 写作室仍可单独用 `pnpm cms` 启动，但它只编辑备份文件，不影响当前 Payload 文章，不用于日常写作。

| 用途 | 地址 |
| --- | --- |
| 首页 | http://localhost:4321 |
| 媒体库 | http://localhost:4321/library |
| 已迁入的文章 | http://localhost:4321/post/markdown-notes |
| 写文章 | http://localhost:3000/admin/collections/posts |
| 管理作品 | http://localhost:3000/admin |

## 添加作品

用原管理员账号登录作品后台，进入 Works，新建作品。选择类型，搜索、选择资料，补充自己的评分、状态、感想，再保存。设为 public 后执行 `pnpm preview:refresh`，再刷新 Library 查看结果。八个资料来源的凭据仅由后台读取。

## 写博客

在 Payload 后台进入 Posts，新建文章，填写标题和 Markdown 正文，保存草稿或发布。标题首次保存生成固定链接，之后改标题不会自动改链接。已有 18 篇旧文可直接编辑；仅已发布文章进入站点。

保存后，在后台仍运行时执行 `pnpm preview:refresh`，再刷新网站查看。仅刷新浏览器不会重新同步数据；不需要重新编译 Payload。原生 `/editor/` 的浏览器草稿与 Markdown 写作室不会写入 Payload Posts。

## 更新何时生效

生产试用中的文章与媒体库都来自最近一次静态构建；更新后台内容后手动构建一次即可。正式站的内容发布及代码部署另见 [服务器说明](../deploy/server/README.md) 和 [CI/CD](ci-cd.md)，本地试用不会部署服务器。

手动前台启动的服务分别在对应终端按 Ctrl+C 停止。VS Code 组合启动使用调试工具栏停止。代码或 YAML 配置修改后重新准备生产试用。
