# 自动检查与手动部署

日常流程：WSL 修改并验证 → 推送 `main` → GitHub Actions 检查、测试镜像并发布到 GHCR → 在 **Deploy production** 点击 **Run workflow**，输入成功的 CI run ID → 服务器更新。

本次只交付仓库内源码，不配置 GitHub Secrets、不连接服务器、不执行生产迁移。首次接通后仍需完成一次真实部署验收。

## 两条工作流

- `.github/workflows/ci.yml`：PR、`main` 推送和手动运行都会检查主题、写作室、后台、SQLite、发布器及部署逻辑，并执行后台和静态站浏览器流程。随后构建 `linux/amd64` Payload 镜像，在一次性 Docker 卷中验证迁移、账号登录、公开读取、匿名权限、上传图片及重启持久化。
- 只有 `main` 的可信运行会推送镜像。构建后测试、推送的是同一个镜像，不在服务器重新构建。镜像位于 `ghcr.io/traceonsnow/homepage-payload`，artifact `release-<commit>-<attempt>` 中的 `release.json` 记录提交、镜像摘要、run ID 和尝试次数，保留 30 天。没有可变的 `latest` 部署入口。
- `.github/workflows/deploy.yml`：只接受成功的本仓库 `main` CI run；拒绝 PR、失败运行、其他工作流、旧尝试的 artifact 和不匹配的镜像。生产部署串行运行，后来的请求不会取消执行中的部署。

真实数据库、Media、Provider 密钥和 `CONTENT_BUILD_TOKEN` 不传给 GitHub。CI 使用隔离数据；Astro 在服务器读取冻结的内容快照、构建静态文件并切换目录。写文章、添加作品仍由现有内容 timer 处理，不需要执行代码部署。

## 服务器首次接入：单独执行

以下步骤由服务器操作者检查并执行，不要在 WSL 或仓库的 `deploy/server/` 内直接运行生产脚本。

1. 核对生产 Git 状态、当前容器、CPU 架构和持久目录。第一版镜像支持 **Linux amd64**；其他架构会在切换前被拒绝。需要 Docker Compose v2（支持 `config --format json`、`up --wait --wait-timeout`）、Git、Python 3.12、`/usr/bin/node` 24 和 `/usr/bin/npm`；安装 pnpm 的命令沿用现有发布器，固定 `10.28.2`。确认服务器能访问 GitHub、GHCR 和依赖源。
2. 保留完整数据库、Media、配置与旧发布的备份，先完成 [Posts 首次部署交接](posts-deployment.md)。自动流程**不会迁移数据库、导入文章或切换文章来源**；没有完成已审查迁移时会拒绝上线。其他需要人工处理的迁移也采用相同边界。
3. 从审查过的提交将 `deploy-release.py`、`ssh-deploy.py`、`publish-library.py` 三个文件逐一安装到 `/home/trace/projects/homepage-deployment/`，保留服务器已有 `compose.yaml`、`runtime.env`、数据和 `web/`。`publish-library.py` 必须是包含部署阻断检查的新版，原内容 timer 和服务环境也应按 Posts 交接更新。不要整目录同步。完成备份并确认 checkout 版本后，安装命令为：

   ```sh
   cd /home/trace/projects/homepage
   install -m 600 deploy/server/deploy-release.py ../homepage-deployment/deploy-release.py
   install -m 600 deploy/server/ssh-deploy.py ../homepage-deployment/ssh-deploy.py
   install -m 600 deploy/server/publish-library.py ../homepage-deployment/publish-library.py
   ```
4. 给现有部署用户配置一把专用于 Actions 的 SSH 密钥。该用户应已能管理本项目 Docker 和静态发布目录。公钥在服务器 `authorized_keys` 中使用受限入口：

   ```text
   restrict,command="/usr/bin/python3 /home/trace/projects/homepage-deployment/ssh-deploy.py" ssh-ed25519 <PUBLIC_KEY> homepage-actions
   ```

   此入口只接收 `deploy <40位提交> <镜像摘要>`，禁用交互终端、端口及 Agent 转发。部署镜像仍具有应用对数据的正常访问权限，所以只部署自己审查过的代码。
5. 确保服务器能拉取 GHCR 包。CI 使用自带 `GITHUB_TOKEN` 推送；首次包的可见性需在 GitHub Packages 检查。可将公开源码构建的包设为 public；若保留 private，在服务器单独配置有 `read:packages` 权限的账号登录 GHCR，不把登录凭据放进运行配置、仓库或聊天。
6. 不自动升级生产部署驱动或 Compose/systemd 配置。后续修改这些文件时，先审查并单独更新服务器安装副本；日常部署仅同步新提交的 `publish-library.py`。服务器 checkout 可以由部署器切换为 detached HEAD，不在其中开发或提交。

## GitHub 一次性配置

在仓库 **Settings → Environments** 创建 `production`，限制部署分支为 `main`。如账号支持，可额外启用 required reviewers；手动工作流按钮本身已经是第一版发布入口，不依赖该功能。

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Environment variable | `DEPLOY_HOST` | 服务器域名或 IPv4，不含协议和路径 |
| Environment variable | `DEPLOY_USER` | 上述部署用户 |
| Environment variable | `DEPLOY_PORT` | SSH 端口，默认 `22` |
| Environment secret | `DEPLOY_SSH_KEY` | 专用私钥完整文本 |
| Environment secret | `DEPLOY_KNOWN_HOSTS` | 已核对指纹的 SSH 主机公钥行 |

通过服务器控制台或已有可信 SSH 连接核对主机指纹，再保存 known_hosts。非默认端口的条目使用 `[host]:port` 格式；工作流不临时信任 `ssh-keyscan` 输出。服务器安全组需允许 GitHub 托管 runner 到 SSH 的连接；不要为了尝试部署直接放宽现有访问限制。

只在 CI 的镜像发布 job 授予 `packages: write`。不要把部署密钥放进 PR 检查或设置 `pull_request_target` 来执行 PR 代码。镜像推送、服务器登录和环境配置尚需首次真实验收。

## 部署和失败处理

部署器持有现有 `library-publication.lock`，检查 Git 未提交内容、镜像来源/架构、当前容器挂载、SQLite 完整性及迁移记录。存在未执行、未知或被改写的迁移时，在切换前退出。`.cache/og-data.json` 是唯一允许重置的已跟踪生成文件；其他本地修改不丢弃。

通过预检后，在私有 `evidence/deployments/<时间>/` 保存 SQLite 一致快照、上一版配置/状态及 `release.json`。这是代码发布的数据库快照，**不等同于数据库与 Media 的完整灾备备份**。自动流程不清理历史镜像、快照或静态版本，需按磁盘使用情况人工维护。

之后切换到指定 Git 提交、按锁文件安装前端依赖，写入仅含镜像引用的私有 `compose.release.yaml`，启动镜像并等待健康检查。沿用原发布器等待内容静默后构建，验证 Library 和搜索索引，成功才原子替换静态目录。发布锁串行执行任务，后台内容编辑仍可继续；持续编辑超过等待上限会使本次代码发布失败。

正常失败会尝试恢复之前的应用镜像、Git 提交、依赖、发布器及静态目录，**不恢复数据库或 Media，不撤销部署期间的新内容**。恢复失败或进程被强制中断时保留 `evidence/deployment-blocked`，新版内容发布器暂停发布；依据私有发布记录检查服务、代码、配置和站点一致后，再由操作者移除阻断文件。不要仅删除文件来掩盖故障。

成功记录在 `evidence/deployment.json`。需要主动撤回一个成功版本时，可重新手动部署其仍有可用 artifact 的成功 CI run；超过保留期时需人工选择保存的镜像与发布记录。数据库不兼容的旧版本会被迁移预检拒绝，转入单独恢复流程。

首次验收需检查 Actions 全流程、线上 `/admin` 登录/写入、媒体、文章/作品更新后的内容发布、静态页面和一次失败回退。仓库测试不能替代线上网络、权限与持久化验收。

## 本地验证

```sh
python3 deploy/server/test-publish-library.py
python3 deploy/server/test-deploy-release.py
python3 deploy/ci/test-release.py
actionlint .github/workflows/ci.yml .github/workflows/deploy.yml
# 有 Docker Engine 时，先构建再验证临时卷，不挂载真实数据：
docker build --platform linux/amd64 -t homepage-payload:ci services/payload
python3 deploy/ci/smoke-image.py homepage-payload:ci
```

参考：[GitHub 镜像发布](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)、[手动工作流](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。
