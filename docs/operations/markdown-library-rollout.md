# Markdown library / Works 草稿：交付与生产切换计划

2026-10-21。本文件是已审查源码的操作计划，**没有执行生产迁移、部署、重启、内容发布或生产写入**。已获准对只读一致备份的新私密副本完成迁移演练，原备份保持不变。本轮服务器开发目录 `/home/trace/projects/homepage-workflow-dev` 是现有 Homepage **同一个 Git 仓库**的 `codex/markdown-publishing` worktree，共用 `/home/trace/projects/homepage/.git`；不是另建的网站项目、数据库或长期运行入口。生产 checkout 仍为 `/home/trace/projects/homepage`。用户已有的生产 docs／skill 修改必须保留。

## 1. 固定本次发布版本及边界

本次需要作为一组交付：

- Works 原生 drafts／最多 30 版本，`20261021_034349_works_drafts.ts`、同名 schema JSON、迁移 registry 和生成类型。
- 原生 Admin、作品表格、统一客户端及兼容旧工具：普通保存只写草稿；显式发布／下架使用最新完整字段，保留数组 ID 和部分日期。
- 访客／构建读取：`draft=false`、public+published。发布器与前端同时使用该边界。
- 带 Works 草稿兼容保护的 `deploy/server/deploy-release.py`；迁移后不能自动回到旧版仅按 visibility 公开内容的 API。
- 外部 Markdown library 程序通过现有标准 API 操作；它的源码交付不等于真实 Vault 或生产同步已启用。网站不增加另一套内容库、模型服务或身份。

操作者从成功的 `main` CI release artifact 取得 **40 位 commit** 和不可变 GHCR digest，私下记录为 `RELEASE_COMMIT`、`RELEASE_IMAGE`。本文不捏造尚未产生的发布 SHA。合并／推送／真实上线是单独操作；准备 worktree 不切换生产分支。自动 Deploy 仍会拒绝未完成迁移，不能靠重复运行绕过。

```bash
# 以下全部命令仅供未来获准的生产操作者执行；先替换为已审查 artifact 的真实值。
# 分阶段写成 Bash 维护脚本，启用 set -euo pipefail；不要跳过失败继续下一段。
export RELEASE_COMMIT='<40-character-reviewed-main-commit>'
export RELEASE_IMAGE='ghcr.io/traceonsnow/homepage-payload@sha256:<64-character-reviewed-digest>'
export PROD_REPO=/home/trace/projects/homepage
export DEPLOY_DIR=/home/trace/projects/homepage-deployment
export ROLLOUT_ID="works-drafts-$(date -u +%Y%m%dT%H%M%SZ)"
export ROLLOUT_DIR="$DEPLOY_DIR/evidence/$ROLLOUT_ID"
umask 077
mkdir -m 700 "$ROLLOUT_DIR"
```

提交前清单：新增迁移 `.ts` **和** `.json`、registry、三个新增集成测试 `markdown-library.test.ts`／`works-drafts.test.ts`／`works-migration.test.ts`、受限副本演练脚本 `services/payload/scripts/rehearse-works-drafts.ts`、部署保护与测试、本计划均需入库。node_modules、临时 `.next`／test-results、截图 `.cache/workflow-evidence`、真实副本与哈希清单 `.cache/workflow-real-data`、数据库、配置、API keys 不能入库。源码分支交付由当前主任务统一提交，不在生产 checkout 提交或强制清理。

## 2. 已核对的实际布局与风险

只读核对的运行布局：`compose.yaml` + 私密 `runtime.env`，实际镜像覆盖为 `compose.release.yaml`；数据库 `data/database/payload.db`，媒体 `data/media/`；静态目录 `public/releases/` 和相对链接 `public/current`。内容任务 `homepage-library-publish.timer` 每分钟调用运行目录的 `publish-library.py`，工作目录和构建源码都指向生产 `homepage`，静默期 180 秒。与代码部署共用 `evidence/library-publication.lock`，已有 `evidence/deployment-blocked` 会阻止二者继续。

2026-10-21 读取的 `evidence/deployment.json` 记录代码提交 `bcedc1cbe64024d7ed3920cf8fa2cdfd270318ac`，镜像为 `ghcr.io/traceonsnow/homepage-payload@sha256:999ae196b8be45208b66d1314ed6fcaad8b164bb54e67e5e2695b5f057994d10`。该记录的 `site` 是代码发布时的 `releases/20261020T000415Z`，而核对时 `public/current` 已为 `releases/20261020T222157Z`：内容 timer 后续正常发布会改变链接。切换前必须重新记录**当时实际 current**，不能拿旧部署记录里的 site 回退新文章。该 evidence 不代替即时服务／数据库核对。

**不能先把新前端源码复制到生产 checkout。** 运行中的旧发布器会从该 checkout import `publicLibraryWork`；旧 API 没有 `_status`，新 sanitizer 会排除这些记录，可能生成并通过同一新 sanitizer 的“空媒体库”检查。即使没有部署新镜像，timer 也会读取被提前改掉的源码。单独先更新发布器同样不是受支持的切换顺序。

**不能在迁移后恢复 pre-drafts 应用。** 旧 API 只检查 visibility；新库可能已有 `visibility: public` 的未发布草稿，旧版会破坏发布边界。保留数据库但回退旧镜像仍有泄露风险。本次 deployer 同时检查 migration ledger 和物理 `_status`／`_works_v`：显式旧目标在启动前拒绝，自动旧版回退会保留阻断文件、恢复先前静态链接，保留已通过启动检查的新应用；启动未验证时停止该 Payload 服务，不重新启动旧版。已兼容草稿的上一版仍可正常回退。

生产 Git 当前若有用户自己的 docs／skill 改动，标准部署器会拒绝。先把这些改动单独归档／审查并纳入正确提交，形成可保留的干净生产状态；不得 `reset --hard`、`clean`、强行 checkout 或用本分支覆盖它们。这个检查是上线前置条件，不是删除用户改动的理由。

## 3. 先验证源码，再在私密真实副本演练

已经通过的开发证据：新库与旧库合成升级、旧表全字段／关系／数组身份保持、迁移中断事务回滚、重复迁移跳过、原生 API 隐私、Markdown library 本机 HTTP 往返、真实生产构建和两条 Admin 浏览器场景。部署兼容保护新增 6 个隔离回归，部署脚本共 17 项通过，使用临时 Git／SQLite，Docker 和构建均模拟。这些结果不等于真实库已升级。

如源码发生新的相关变更，再运行对应检查；无需因为交付文档整理重跑所有构建：

```bash
python3 deploy/server/test-deploy-release.py
python3 deploy/server/test-publish-library.py
# 后台相关源码改变时，在 services/payload：
node --import tsx --test tests/integration/works-migration.test.ts tests/integration/works-drafts.test.ts tests/integration/works-table.test.ts
```

**真实数据库副本演练已于 2026-10-21 完成。** 不变输入 `.cache/workflow-real-data/before-20261021T042814Z.db`（0600，SHA256 `4fc5eed048951b4604c5ab55df3bb08bae777b5675ae2ee90ea0715a636a5377`）再次复制到新的私密 `rehearsal-5ZVOm3/payload.db` 后，仅迁移该派生副本。报告为同目录 `report.json`，逐行哈希清单也仅保存在私密目录。585 Works、19 Posts；76 public 初始化 published，509 private 初始化 draft；新增 585 初始版本。25 张旧表的原列逐行哈希、全部旧数组／关系 ID 完全一致；integrity、外键、生成 schema、重复迁移全表无变化均通过。原备份 SHA 未变。

演练覆盖全部记录的 latest/base 字段、limit=100 分页、版本列表、单版本及原生 `draft=true` REST 列表，并核对匿名公开 ID 集合和私密／版本拒绝。REST 授权仅用内存合成身份，未读取或写入副本账户／认证字段；未登录、未读取生产配置／key，未启动监听或调用外部服务。隔离媒体目录为空，真实媒体未复制。首次演练发现新版本 texts 种子须使用 `version.aliases` 等路径；只修正本轮未上线迁移的**新增版本表**路径，旧 `works_texts` 原字段／ID 不变。合成回归同时验证 aliases、creators、platforms、tags 和数组 ID，避免 `findByID` 在相同时间戳回落基表掩盖分页缺失。

可复现命令（仅在开发 worktree 后台目录；脚本拒绝生产 checkout、路径替换、非私密原始备份、继承数据库／认证环境和源哈希不符，每次创建新副本）：

```bash
cd /home/trace/projects/homepage-workflow-dev/services/payload
env -i PATH=/usr/bin:/bin /usr/bin/node --import tsx scripts/rehearse-works-drafts.ts \
  before-20261021T042814Z.db \
  4fc5eed048951b4604c5ab55df3bb08bae777b5675ae2ee90ea0715a636a5377
```

此证据验证冻结数据库与当前源码／依赖；不是生产升级，也不替代最终不可变 release image 验证。正式迁移前仍需操作者取得最新一致备份，并用**独立复制数据库和媒体**演练同一 release image，不挂载真实目录写入。副本放在 Git 外的私密新目录，例如 `$ROLLOUT_DIR/rehearsal/{database,media}`，原始备份另外保留只读。Rehearsal 用合成配置／secret，不复制生产 Provider key，不启用真实客户端；关闭外部元数据查询。镜像内保留原迁移 CLI，可以直接验证同一镜像的迁移，不需要安装另一个数据库服务。

```bash
# 仅示意经检查后的副本路径；原目录绝不能替换到这些挂载中。
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -e NODE_ENV=production -e PAYLOAD_SECRET=disposable-private-copy-rehearsal \
  -e PAYLOAD_IMPORT_TRANSACTION=0 \
  -e DATABASE_URL=file:/app/storage/database/payload.db -e MEDIA_DIR=/app/storage/media \
  -e SERVER_URL=http://127.0.0.1:3302 \
  --mount "type=bind,src=$ROLLOUT_DIR/rehearsal/database,dst=/app/storage/database" \
  --mount "type=bind,src=$ROLLOUT_DIR/rehearsal/media,dst=/app/storage/media,readonly" \
  "$RELEASE_IMAGE" node node_modules/payload/bin.js migrate
```

对照要求不是只看命令退出码：

1. 迁移前清单记录每个旧表的列、行数及全部原列内容哈希；迁移后以同一列清单逐表核对。仅允许 Works 新增 `_status`、新版本表、迁移记录及对应索引；原 Users、Posts、Media、Works、数组、texts、锁／关系 ID、评分、短感受、时间戳不能被改写。保护名单和哈希只放私密 evidence，不打印账号／正文／密码哈希。
2. 旧 public Work 初始化 published、旧 private Work 初始化 draft，原 visibility 不变；版本初值和 `_uuid` 与旧数组 ID 对齐，版本 texts 路径必须为 `version.aliases`／`version.creators`／`version.platforms`／`version.tags`。核对 limit=100 全分页、`findVersions`／`findVersionByID` 和 native REST `draft=true` 的数组及字段；不能仅凭 `findByID` 判定保持。`PRAGMA integrity_check` 为 ok，`PRAGMA foreign_key_check` 为空，生成 schema 与同名 migration JSON 无差异。
3. 临时 loopback-only 新版服务上，授权读最新草稿和公开基表、匿名读公开旧版；在副本测试保存 private 草稿不隐藏旧版、连续两次保存、发布最新值、下架保留最新稿、关系不泄露草稿、版本匿名不可读。修改仅进入副本。确认删除先下架，永久删除不作为本次演练默认动作。
4. 用副本冻结输入构建新前端，核对公开 slug、文章和合法空集合，确认私密／未发布哨兵不在 HTML。关闭临时服务后保留演练报告与原副本，不把结果覆盖回正式库。

演练任何旧值／ID 不一致、未知 migration、`batch=-1`、schema 与 ledger 不一致、外键异常，均停止切换。不要强行接受 CLI 的可能丢数据提示。

## 4. 生产维护窗口：暂停写入和发布，完整备份

先协调停止 Admin 用户写入、所有内容客户端、Markdown 同步执行器和后台自动写入。需可靠隔离时由操作者通过现有 Nginx 维护规则临时限制 Admin／写 API（保留旧静态站与媒体），验证外部不能写；不要只靠“当前没有人编辑”的推测。本文不自动安装代理规则。

检查当前 release、Compose 挂载、可用空间与既有阻断状态。已存在 `deployment-blocked` 必须先调查，不能覆盖。只用 `config --quiet` 校验，不打印展开后的 Compose／Env。镜像 SHA／revision／架构必须与已审查 artifact 一致。

```bash
cd "$DEPLOY_DIR"
docker compose --env-file runtime.env -f compose.yaml -f compose.release.yaml config --quiet
systemctl --user stop homepage-library-publish.timer
systemctl --user is-active homepage-library-publish.service
# 若仍 active，等待既有构建结束；不要中途杀构建。随后获取同一把发布锁。
```

维护脚本使用 `flock --exclusive --wait 300 "$DEPLOY_DIR/evidence/library-publication.lock" ...` 持锁执行本节备份及下一节迁移／新版启动。timer 停止不代表正在运行的 oneshot 已结束；文件锁是最终检查。锁内新建带本次 ROLLOUT_ID 的 `evidence/deployment-blocked`，并保持 Actions 部署暂停／受阻。数据库迁移期间旧 Payload 停止，外部写入口继续维护。

完整备份至少包括：

- Python `sqlite3.Connection.backup()` 得到新文件的一致数据库快照，核对 integrity／foreign_key；不能直接 `cp` 正在写入的主文件而漏掉 WAL。
- 全部 `data/media/`，以及保留权限的私密 `runtime.env`、`compose.yaml`、`compose.release.yaml`、已安装 deployer／publisher、publication/pending/deployment evidence。
- 实际 `readlink public/current`、当前 Git SHA、镜像 digest／本地 image ID、迁移列表、旧表哈希清单、媒体文件清单及备份 checksum。不要用部署记录里过时的 static site 代替实际链接。

本轮完整备份是**迁移前**回退证据；部署器自带的发布前数据库快照是在手动迁移之后取得，不能代替它。备份目录新建、权限 0700，配置及记录权限 0600，数据库和媒体保留原有生产目录／所有权。不运行 setup、不重建管理员、不导入旧文章，不更换 PAYLOAD_SECRET。

锁内停止旧 Payload 后的备份命令如下；原目录必须存在，所有目标为新建文件。停止服务不替代 SQLite backup 核对：

```bash
docker compose --env-file runtime.env -f compose.yaml -f compose.release.yaml stop payload
mkdir -m 700 "$ROLLOUT_DIR/before"
python3 - "$DEPLOY_DIR/data/database/payload.db" "$ROLLOUT_DIR/before/payload.db" <<'PY'
import os, sqlite3, sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
if not source.is_file() or target.exists():
    raise SystemExit('Existing source and a new backup target are required')
with sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True) as original:
    with sqlite3.connect(target) as backup:
        original.backup(backup)
        if backup.execute('PRAGMA integrity_check').fetchone() != ('ok',):
            raise SystemExit('Backup integrity check failed')
        if backup.execute('PRAGMA foreign_key_check').fetchall():
            raise SystemExit('Backup foreign-key check failed')
os.chmod(target, 0o600)
PY
tar -C "$DEPLOY_DIR/data" -cpf "$ROLLOUT_DIR/before/media.tar" media
cp -p "$DEPLOY_DIR/runtime.env" "$DEPLOY_DIR/compose.yaml" "$DEPLOY_DIR/compose.release.yaml" \
  "$DEPLOY_DIR/deploy-release.py" "$DEPLOY_DIR/publish-library.py" "$ROLLOUT_DIR/before/"
cp -p "$DEPLOY_DIR/evidence/deployment.json" "$DEPLOY_DIR/evidence/library-publication.json" "$ROLLOUT_DIR/before/"
# library-pending.json 存在时也复制；不存在时记录为不存在，不创建假状态。
readlink "$DEPLOY_DIR/public/current" > "$ROLLOUT_DIR/before/current-link.txt"
git -C "$PROD_REPO" rev-parse HEAD > "$ROLLOUT_DIR/before/source-commit.txt"
# 备份文件、旧表哈希／迁移清单和媒体 manifest 均写入同一私密 before 目录。
```

## 5. 专用迁移进程与首次新版启动

**先单独安装本次已审查 deployer 保护，尚不替换 publisher／前端。** 例如从目标 commit 导出 `deploy/server/deploy-release.py` 到私密 ROLLOUT_DIR 核对 checksum，再 `install -m 600` 到运行目录。日常部署不会自动更新这个驱动；旧安装副本没有本次回退保护。不要整体 rsync 部署目录、复制 runtime.env.example，或在生产 checkout 先切分支。

拉取并核对固定镜像。发布锁内停止旧 payload，备份现有 `compose.release.yaml`，用只包含 payload/migrate 两个 image 字段的 JSON/YAML **原子替换**该覆盖文件，二者都指向 `RELEASE_IMAGE`，不改 volumes／Env／其他服务。接下来所有命令必须带 base 和 release 两个 `-f`，避免意外启动旧的 local-acceptance image。

```bash
# 已从 CI 核对的镜像；只输出 revision，不输出镜像 Env 或真实运行配置。
docker pull "$RELEASE_IMAGE"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$RELEASE_IMAGE")" = "$RELEASE_COMMIT"
test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$RELEASE_IMAGE")" = https://github.com/TraceOnSnow/homepage
test "$(docker image inspect --format '{{.Os}}' "$RELEASE_IMAGE")" = linux
test "$(docker image inspect --format '{{.Architecture}}' "$RELEASE_IMAGE")" = "$(docker version --format '{{.Server.Arch}}')"
python3 - "$DEPLOY_DIR/compose.release.yaml" "$RELEASE_IMAGE" <<'PY'
import json, os, re, sys
from pathlib import Path
destination, image = Path(sys.argv[1]), sys.argv[2]
if not re.fullmatch(r'ghcr\.io/traceonsnow/homepage-payload@sha256:[0-9a-f]{64}', image):
    raise SystemExit('Reviewed immutable image digest required')
if not destination.is_file():
    raise SystemExit('Expected existing release override; inspect before changing')
temporary = destination.with_name(destination.name + '.works-drafts-next')
with temporary.open('x') as output:
    os.chmod(temporary, 0o600)
    json.dump({'services': {'payload': {'image': image}, 'migrate': {'image': image}}}, output)
    output.write('\n')
os.replace(temporary, destination)
PY
```

```bash
cd "$DEPLOY_DIR"
docker compose --env-file runtime.env -f compose.yaml -f compose.release.yaml \
  run --rm --no-deps -e PAYLOAD_IMPORT_TRANSACTION=0 migrate \
  node node_modules/payload/bin.js migrate:status
docker compose --env-file runtime.env -f compose.yaml -f compose.release.yaml \
  run --rm --no-deps -e PAYLOAD_IMPORT_TRANSACTION=0 migrate
```

迁移的技术限制：`PRAGMA foreign_keys=OFF` 只能在**无已有事务**的专用连接生效。配置 `PAYLOAD_IMPORT_TRANSACTION=1` 会开启外层事务，迁移会在改变既有数据前明确拒绝；不能用 import 环境运行，也不能删除这个检查。迁移自己在一个 transaction 中替换 Works／sources 表、复制旧数据、初始化版本并检查 foreign keys，最后恢复 foreign_keys。历史 migration 文件不能改写。

Payload 在 `up()` 返回后另记 migration ledger；当前专用进程模式下，数据／schema transaction 与这条 ledger 写入不是同一个事务。若进程恰在二者之间中断，可能留下完整新 schema 但没有 migration 记录。此时保留现场与备份，核对版本表、全部旧数据和 ledger，由操作者按审查结果恢复迁移记账；不要盲目重跑 CREATE TABLE、运行 fresh/reset/down 或恢复空库。本次 deployer 物理 schema 检查仍会阻止旧 API 回退。

迁移成功后、原账户登录或其他验收写入之前，立刻按演练要求核对全量旧字段哈希、初始版本、实际迁移列表与 integrity／foreign_key。后续登录可能更新认证元数据，应单独记录，不能借此放宽评分、短感受、正文或关联等内容字段的保持要求。任何不一致都保持维护与阻断，不启动旧 app。仅当数据库检查通过时启动**同一**新版镜像：

```bash
docker compose --env-file runtime.env -f compose.yaml -f compose.release.yaml \
  up -d --no-build --pull never --wait --wait-timeout 180 payload
```

此时仍不开放写入、不启用同步执行器；核对原账户可读、旧公开内容完整、匿名仅 public+published、版本不可匿名访问。新镜像未健康就停在维护状态，旧静态网站仍提供内容。不能启动旧 image 应急服务迁移后的数据库。

## 6. 协调源码／发布器／静态前端切换

新版 API 健康后才允许部署器切换生产 checkout 和安装新版 publisher。生产 Git 必须已保留用户修改且通过干净检查；目标 commit 已在审查后的 origin/main，镜像来源和 revision 可验证。

发布 timer 继续停止、外部写入继续维护；完成前述核对后，释放手动持有的锁。只有确认 `deployment-blocked` 是本次维护脚本写入、没有遗留故障且日志已经归档，才由操作者清除此维护标记，立即调用新部署器，由它重新持有同一把锁。不要在仍持有外部 flock 时调用 `main()`，否则会互相等待。

```bash
cd "$DEPLOY_DIR"
python3 deploy-release.py "$RELEASE_COMMIT" "$RELEASE_IMAGE"
```

新版 API 已经在前一步启动，因此这个很短的锁交接期间，即使有人工只读构建也不会出现“新前端读旧无状态 API”的混合。deployer 检查精确 migration 列表与旧 migration 源码，保留数据一致快照，切换到指定源码、按锁文件安装依赖、安装同提交的 publisher、确认同镜像健康，冻结内容并构建／核对 Library＋搜索，最后原子替换 current。它不运行数据库迁移，也不恢复数据库。不要绕过它手动拷贝 dist 或先改生产源码。

成功后核对 `evidence/deployment.json` 中目标 SHA、image、site，以及实际 current、匿名 API／Admin、静态文章和作品 slug。再恢复 Admin／内容客户端访问、移除临时维护规则，恢复 `homepage-library-publish.timer`。Markdown 同步先只读 plan/reconcile，确认真实 Vault、目标身份和成功观察基线后才单独启用写入；不批量重导入文章／Works，不默认启动新常驻服务。

## 7. 失败与回退：保留 schema、草稿和新编辑

- **迁移前失败**：数据库未改变时可保持原应用和旧静态网站；核对本次维护标记并归档原因，按情况恢复原服务／timer。若数据库是否变化不明，按下一条处理。
- **迁移失败／ledger 不明**：旧内容备份与原目录保留，不做 fresh/reset/down。检查 transaction 是否回滚及是否出现物理草稿 schema。继续维护，修复／完成迁移后只启动已兼容草稿的 image。
- **迁移后首次新版部署失败**：即使没有用户新增草稿，deployer 也保守拒绝恢复 pre-drafts release。旧静态链接恢复，已健康的新 app/source 保留；新 app 启动未验证则停止该 Payload 服务。`deployment-blocked` 保留，阻止 timer／后续部署。依据私密 `evidence/deployments/<stamp>/release.json`、本次迁移前完整备份及实际容器状态修复，再以同一或新审查的兼容版本 roll forward。
- **后续兼容版本回退**：只有目标仍包含已审查 Works 草稿 migration 且通过所有 migration/source/image 检查，才允许回退应用／源码／publisher。数据库和媒体不恢复，部署期间新文章、草稿和版本继续保留。手动 workflow 选择旧 CI artifact 也不能绕过此检查。
- **灾备恢复**：仅在另行批准、明确接受停机／编辑取舍后，先保存当前数据库和媒体，再成组恢复已验证的数据库＋媒体＋配置＋匹配代码。不是本次自动失败路径，不以迁移前快照覆盖期间新编辑。`down` 明确拒绝删除草稿历史；保留 schema 是常规回退前提。

确认阻断原因已解决、应用／源码／publisher／数据库与静态链接一致后才移除 deployment-blocked。保留历史 release／image／备份；不做全局清理。全过程不改 DNS、证书、Hermes 或飞书。

## 8. 当前尚需的生产前置条件

尚未生成并批准的正式 commit/image、用户生产 checkout 改动的保留方案、上线时最新一致备份及该镜像的副本复核、可执行的维护写入隔离、生产迁移和协同切换，仍然是上线前置条件。上述冻结数据库副本演练已经完成；本文不把未来生产步骤标成已完成。源码交付可以继续自主整理；生产数据和运行服务保持当前状态。
