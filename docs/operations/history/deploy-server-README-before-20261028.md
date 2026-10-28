> 历史快照：2026-10-28清理前入口原文，不作为当前运行指令。

# 现有服务器部署源码

这里保存已运行的 Homepage 部署脚本与配置，供 WSL 开发、代码审查和后续部署使用。运行目录仍是仓库外的 `/home/trace/projects/homepage-deployment/`，本次归档不会移动服务、数据或更改正在运行的定时器。

## 目录约定

```text
/home/trace/projects/
  homepage/                    # Git checkout; Astro 与 Payload 源码
  homepage-deployment/         # 本目录源码部署后的运行位置
    runtime.env                # 私密运行配置，只在服务器保存
    compose.yaml               # Payload 生产容器，仅绑定 127.0.0.1:3000
    data/database/payload.db   # 原管理员、作品等持久数据
    data/media/                # 公开上传图片
    public/releases/           # 版本化静态产物
    public/current             # 当前产物的相对符号链接
    web/                       # Nginx、证书和只读媒体入口
    evidence/                  # 本地构建日志及发布状态，不提交 Git
```

配置包含现有域名和服务器路径，不能直接在 `homepage/deploy/server/` 中运行生产发布器。`compose.yaml` 的相邻仓库路径、`publish-library.py` 的 `BASE.parent / 'homepage'`、`systemd/` 模板都按上述布局设计。不要把 WSL 当作生产环境启用这些 timer。

## 已运行能力

- `web/compose.yaml`：Nginx 与工具 profile 中的 Certbot，使用固定镜像摘要。80 重定向到 HTTPS，ACME 验证路径除外。
- HTTPS `/admin`、`/_next/`、`/api/` 经 Docker 私网转发到 Payload。认证使用现有账号；匿名不能写作品或读取管理员数据。
- `/api/media/file/` 只读挂载上传目录，允许 GET/HEAD；上传仍通过认证 API。
- `publish-library.py`：文件模式观察公开 Works；Payload 模式同时观察所有已发布文章（包括未关联文章）。最后一次变化后静默 180 秒才构建，文章与作品共用冻结输入及一把锁；构建中数据变化重新等待，成功后原子切换静态版本，失败保留旧站。
- `systemd/homepage-library-publish.*`：每分钟观察数据，不代表每分钟构建。
- `systemd/homepage-cert-renew.*` 与 `web/renew-cert.sh`：每日检查证书续期并热加载本项目 Nginx。

`runtime.env.example` 只有示例和空凭据。真实密钥、数据库、媒体、归档、证书、ACME 账户、日志和静态产物均不在 Git 中。保留现有 PAYLOAD_SECRET，不运行 `setup` 替代原数据，不把本目录样例覆盖到生产 `runtime.env`。

## 开发与部署

后续在 WSL 修改、检查、提交并推送。服务器仅在明确部署任务中拉取已提交版本、检查影响范围、备份和部署。部署配置也在 WSL 修改，再把审查过的具体源文件同步到仓库外运行目录；不要整体同步或删除运行目录。

部署发布器源码前可在 WSL 运行：

```bash
python3 deploy/server/test-publish-library.py
bash -n deploy/server/preflight.sh
bash -n deploy/server/web/renew-cert.sh
```

真实数据检查脚本：`preflight.sh`。本地原 Payload 一致导出：`export-payload.py`。导出/导入必须使用新目标并保留源数据；不要把压缩包或 `source.env` 提交到仓库。

仅在真实服务器运行目录执行的命令：

```bash
cd /home/trace/projects/homepage-deployment
docker compose --env-file runtime.env ps
docker compose -f web/compose.yaml ps
systemctl --user status homepage-library-publish.timer --no-pager
systemctl --user status homepage-cert-renew.timer --no-pager
```

前端代码更新而公开数据未变化时，`python3 publish-library.py --refresh` 可显式构建发布；同时有新数据时仍遵守静默期。仓库已提供 [CI 与手动部署](../../docs/ci-cd.md)，尚需单独安装服务器入口、配置 GitHub 环境并验收，推送不会直接上线。在线文章管理需要按 [文章部署交接](../../docs/posts-deployment.md) 完成迁移及来源切换。首次迁移、证书申请和恢复操作需按当次实际状态单独制定步骤，不要盲目重跑初始化。

`deploy-release.py` 与内容发布器共用锁，使用指定提交及 GHCR 镜像摘要，拒绝待执行的数据库迁移；失败尝试回退应用和静态站，保留数据。`ssh-deploy.py` 是专用 SSH 公钥的受限入口。日常部署只更新已审查的发布器源码，不覆盖生产 Compose、systemd、Nginx 或私密配置。`compose.release.yaml` 是部署器生成的私有镜像覆盖配置；手动管理容器时使用 `docker compose --env-file runtime.env -f compose.yaml -f compose.release.yaml ...`，不要无意切回旧的本地镜像。

Works 草稿迁移后只允许兼容 release 回退；旧 visibility-only API 不能服务新草稿 schema。新版驱动在这类不安全自动回退时保留数据和兼容候选，恢复旧静态链接并留下 deployment-blocked；候选启动未验证则停止该服务。首次升级前需单独安装已审查的新驱动，不能只更新 publisher。完整维护锁、备份、副本演练和协同切换见 [Markdown library rollout](../../docs/operations/markdown-library-rollout.md)；不要先修改生产 checkout，内容 timer 会直接读取其中的前端源码。

## 已知边界

- BGG / Bangumi 上游故障排查、脱敏采集工具和实际证据边界见 [诊断工具说明](diagnostics/README.md) 与 [2026-10-18 排查报告](../../docs/operations/metadata-investigation-2026-10-18.md)。原始响应和运行日志仍留在仓库外的 evidence 目录；这些工具不会自动修复或更改网络。

- 合法空清单可以发布，API 失败不会清空网站；长时间构建失败后从结束时开始退避。对应发布器已于 2026-10-18 同步到实际运行目录，文章和作品使用同一发布队列；见 [正式执行记录](../../docs/posts-deployment.md)。
- 全面备份恢复、所有上传路径及公网账号真实写入流程尚未做完整验收；运行状态不能当作这些检查已完成。

产品讨论及下一阶段开发范围见 [开发交接](../../docs/development-handoff.md)。
