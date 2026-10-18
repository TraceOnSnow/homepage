# BGG / Bangumi 搜索失败：排查日志、案例与处理建议

记录日期：2026-10-18（Asia/Shanghai）。原始请求日志使用 UTC。

## 结论与可信度

两家目前表现为不同的故障，不能合并成一个已经确定的原因：

- **BGG：确定收到对方 Cloudflare 的拦截页面。** 出口 IP / 网络相关的安全规则是有同类案例支持的推测；具体规则和触发因素尚未取得对方日志，不能宣称已证实“封 IP”，也不能宣称 Key 有效或失效。
- **Bangumi：确定收到 Cloudflare 到其源站的 TCP 连接超时。** 最新结构化错误明确标记 `error_category: origin`，并要求网站运营者处理。尚不能判断是全局故障、区域路径问题，还是其源站的防火墙或其他配置。
- 没有找到本次表格部署修改请求实现或遗失凭据的证据；原来的旧镜像现在也失败。回滚不是当前证据支持的修复措施。
- **换 Key 不是优先措施；更换网络出口只能作为对照实验，不能提前保证能修复。** 两项凭据的有效性尚未独立验证成功。

## 用户事实与边界

用户明确确认本地 WSL 曾经成功。公网以前是否成功，用户后来表示不确定，因此不把它作为已确认前提，也不要求用户反复证明本地历史成功。

生产代码为 `/home/trace/projects/homepage`，本次仅检查；操作和证据放在独立部署目录。本次没有改动业务代码、数据库、上传文件、管理员、Key、DNS、HTTPS、Hermes 或系统网络，没有部署代理或新增常驻服务。

## 证据文件

本节的 `evidence/` 均相对于服务器运行目录 `/home/trace/projects/homepage-deployment/`。原始响应、访问日志、部署快照和散列清单只保留在服务器，不纳入 Git；仓库只归档本报告与不含凭据的采集工具。WSL 不需要复制这些运行证据。

- 新一轮完整请求记录：`evidence/metadata-network-20261017T203731Z/requests.jsonl`。每条包括开始/结束时间、方法、公开测试 URL/请求体、是否携带认证、超时设置、耗时、状态码、选定响应头、响应体文件。
- 原始响应：同目录下六个 `*-response.txt` 文件；本轮六份都未截断。保留 BGG 错误页和 Bangumi 结构化错误、公开详情响应；凭据内容不写入日志。
- 部署和访问历史：`evidence/metadata-network-20261017T203731Z/deployment-and-access-history.json`。包含当前版本、容器健康和现存 Nginx 元数据请求记录，移除用户地址、查询词、认证内容。
- 早期探测摘要：`evidence/metadata-sources-diagnostic.json`。包括旧镜像、IPv4、curl/HTTP2、较短超时等对照；这些早期试验没有全部原始响应，不伪装成完整原始日志。
- 可复用采集器：[collect-metadata-diagnostics.py](../../deploy/server/diagnostics/collect-metadata-diagnostics.py)，请求实现：[metadata-network-probe.mjs](../../deploy/server/diagnostics/metadata-network-probe.mjs)。均属于部署诊断文件，不进入生产代码或容器文件系统。

这里的“完整”指本轮全部六次请求及其完整响应和目前可取得的历史摘要。过去程序未记录的上游响应、已轮转日志无法事后补出。

## 排查经过

1. 查看仓库指令和 Git 状态，确认生产 checkout 干净，当前提交为 `31727e8966f53e1d38c159103d6a7f7cfc9ec0a7`。
2. 对照 `e97b11c`：metadata 目录、Payload 锁文件、Dockerfile、Compose 模板没有变化。对照初始提交 `0287494`：公共 HTTP 实现、BGG 和 Bangumi provider 文件没有变化。
3. 早期检查确认运行中的两个凭据存在，并与 runtime.env、`backups/content-tools-20261017T172853Z/private/runtime.env` 一致。只比较值是否相同，不打印或保存凭据。**未读取当前 WSL 凭据，不能声称已完成 WSL 与服务器的 Key 比对。**
4. 直接从实际生产容器调用官方端点。请求得到对方 Cloudflare 的响应和 Ray ID，因此并非仅由 Codex 终端自身网络隔离造成的假象。早期 `/cdn-cgi/trace` 观测出口为 `43.155.230.220`、Cloudflare 节点 `ICN`。
5. 将 Bangumi 的默认 8 秒诊断超时延长至 25 秒，拿到 522，而非仅看到本地超时；不改变生产的超时设置。
6. 对照带 Token / 不带 Token、强制 IPv4、标准 curl、较规范的应用 User-Agent。此前 IPv4 和 curl 未消除失败；BGG 用 curl HTTP/2 仍返回拦截页面。
7. 用保留的旧部署镜像、现有凭据和生产 Docker 网络做只读对照，不挂载生产卷、不映射端口，执行后自动移除。Node 同为 `v24.22.0`，Bangumi 约 8006 ms 后报错、BGG 约 36 ms 后报错。该结果不支持“新镜像独有故障”。
8. 检查历史访问记录与已有来源记录，随后根据用户澄清修正历史判断。
9. 本轮补做六次可复现请求，完整保存脱敏请求元信息和响应，并检索官方文档、官方仓库问题与官方论坛中的第一手报告。

## 本轮请求结果

时间窗口：2026-10-17 20:37:31–20:37:51 UTC，即北京时间 2026-10-18 04:37:31–04:37:51。

| 请求 | 认证 | 结果 | 耗时 | 补充信息 |
| --- | --- | --- | --- | --- |
| BGG 搜索 Catan | 现有 Token | 403 | 51 ms | HTML 拦截页面，4553 字节 |
| BGG 同样搜索 | 无 Token | 403 | 21 ms | 同样页面标题和拦截提示，4553 字节 |
| Bangumi 搜索 MyGO | 现有 Token | 522 | 19680 ms | 结构化错误，要求运营者处理 |
| Bangumi 同样搜索 | 无 Token | 522 | 19868 ms | 同类源站连接错误 |
| Bangumi 公开详情 `/v0/subjects/8` | 无 Token | 200 | 19818 ms | `CF-Cache-Status: STALE`，返回旧缓存 |
| 同一公开详情附唯一查询参数 | 无 Token | 522 | 19563 ms | 未取得正常详情响应 |

BGG 两次请求间隔超过 5 秒。本轮没有自动重试；Bangumi 返回 `Retry-After: 120` 后也没有继续重试。

代表性的 Ray ID：

- BGG 带 Token：`a4c21a082bd90bbb-ICN`；不带 Token：`a4c21a285d65c7b5-ICN`。
- Bangumi 带 Token 搜索：`a4c21a0848b08d31-ICN`；无 Token 搜索：`a4c21a085d7dea2b-ICN`。
- Bangumi 唯一查询参数详情：`a4c21a083ad1560a-ICN`。

Bangumi 的错误 JSON 还包括：`error_name: connection_timeout`、`error_category: origin`、`retryable: true`、`retry_after: 120`、`owner_action_required: true`。完整内容见原始响应文件。这些字段是对方返回的诊断信息，不是本项目生成。

## 为什么详情偶尔成功也不代表 Bangumi 正常

早期详情为 `HIT`，本轮变成 `STALE`。Cloudflare 对 STALE 的定义是：源站联系失败时返回过期缓存。因此“详情 200、搜索失败”不支持搜索参数错误或只有搜索功能故障的结论；本轮详情本身也等待约 20 秒才取得旧缓存。[Cloudflare 缓存状态文档](https://developers.cloudflare.com/cache/concepts/cache-responses/)

522 表示 Cloudflare 联系源站超时。官方文档列出建立 TCP 连接前的约 19 秒等待等情形；本轮 19.5–19.9 秒的响应和错误 JSON 相互吻合。具体为什么源站无法连接，还需要其运营者日志；不能由此推断“整个 Bangumi 全球宕机”。[Cloudflare 522 文档](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/)

## 认证与 IP 的区别

BGG 文档要求已批准应用的 Bearer Token，使用不带 www 的 `boardgamegeek.com`；当前实现符合这两项形式要求。Bangumi 文档也使用 Access Token 认证。两份公开认证说明未列出固定出口 IP 绑定要求；“文档没有说明”不能证明平台永远没有其他安全规则。[BGG 认证说明](https://boardgamegeek.com/using_the_xml_api)、[Bangumi 认证说明](https://github.com/bangumi/api/blob/master/docs-raw/How-to-Auth.md)

认证判断与边缘安全判断是不同环节。当前 BGG 带与不带 Token 都得到相同种类的 Cloudflare 页面，支持先查安全拦截，但不构成 Token 有效的证明。Bangumi 的无认证公开详情也返回 522，说明存在不依赖该 Token 的连接失败。单纯更换 Key 的解释力较弱。

## 网上案例与本例对照

| 第一手来源 | 报告内容 | 对本例的价值与限制 |
| --- | --- | --- |
| [BGG：已批准 XML API 应用在 OVH 上被拦截，第二页](https://boardgamegeek.com/thread/3748876/cloudflare-challenge-blocking-approved-xml-api-app/page/2) | 有使用者报告，同一 Token 在住宅网络取得正常 XML，在云服务器取得 Cloudflare 拦截；有的访问后来恢复。 | 与本地成功、云服务器被拦截相似，支持出口相关假设。系用户自述，不能当作 BGG 官方确认，更不能推定腾讯云命中相同规则。 |
| [BGG：XML API 搜索出现 Cloudflare challenge](https://boardgamegeek.com/thread/3750018/cloudflare-challenge-on-xmlapi-endpoint) | 发帖者说明已注册应用并使用 Token，搜索仍返回 403 与防护页面，并提到云服务器环境。 | 说明仅重新申请 Token 未必针对实际故障；没有提供可保证有效的通用修复。 |
| [Bangumi API #284](https://github.com/bangumi/api/issues/284) | 报告中国大陆无法访问 API，讨论者归因于网络访问，问题后来关闭。 | 只能作为网络可达性问题的历史例子。我们的请求已到达 Cloudflare 并收到 522，不等同于用户到 Cloudflare 之间无法连接。 |
| [Bangumi API #290](https://github.com/bangumi/api/issues/290) | 报告连接 443 端口约 21 秒后失败，问题后来关闭，未提供明确技术修复。 | 同样不能拿来证明本例原因，或承诺使用代理一定成功。 |
| [Bangumi Server #642](https://github.com/bangumi/server/issues/642) | 2024 年有人报告多个 v0 API 不返回数据，issue 已关闭；本次读取页面未取得详细处置记录。 | 说明曾有 API 可用性报告，不证明当前正在发生同一事件。 |

检索说明：BGG 论坛正文由搜索索引返回；直接打开部分页面同样遭遇 403，因此没有声称完整阅读所有楼层或找到官方修复承诺。Bangumi issue 已读取正文及页面可见的讨论。搜索结果与 GitHub 页面状态存在缓存差异时，以打开的页面为准；不把历史报告当作当日故障公告。

Cloudflare 官方说明，带其品牌的 403 可以由多种安全机制产生。仅凭页面不能辨认具体规则；即使 `cf-mitigated` 为空，也不能据此排除安全拦截。[Cloudflare 403 文档](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-403/)

## 程序自身的日志缺口

读取现有代码后确认：

1. `http.ts` 的请求统一在 8000 ms 中止。HTTP 非成功时只抛出包含 status / retryAfter 的通用错误，未保存 Ray ID、耗时和缓存状态。
2. `search.ts` 将大部分异常归为 `error`，最终由界面显示“来源暂时不可用，请稍后重试”。这句话不等于“Key 未配置”。
3. 元数据搜索端点可以以 HTTP 200 返回 `providers[].state: error` 和空候选；Nginx 访问日志中的 200 并不代表上游成功。
4. 当前代码中没有针对这些失败的充分结构化日志。仅查看容器运行正常和 Nginx 200 无法识别本次问题。
5. 仅对 202 / 429 建立失败冷却；522 中的 Retry-After 虽被解析，但不会在 `recordFailure` 中建立冷却。生产的 8 秒中止还可能早于收到 522 响应。不是本次连接失败的原因，却是后续错误处理值得改进之处。

源文件：`services/payload/src/lib/metadata/http.ts` 第 11–20 行；`search.ts` 第 12、24–27、45–58 行；`endpoint.ts`；`src/lib/ui/dictionary.ts` 第 18–19 行。此处只是审查结果，本次没有修改生产代码。

## 历史记录能说明什么

最新提取到 51 条各类 metadata 访问记录，其中 anime 10 条、boardgame 7 条。早期摘要的 17 条是这两个类型合计，并非所有 metadata 请求数。

10 月 15 日的 anime 搜索/详情响应较大，已有 Bangumi 来源的 fetchedAt 与其中一次请求时间接近；这支持曾处理正常数据的判断，但访问日志没保存响应体，不能直接复原当时的 provider 状态。BGG 的旧小响应不能证明成功，也不能用不完整历史记录否定用户本地成功。

原先“公网此前正常”的表述过于确定，已修正。第一次把详情 200 当作上游正常也不充分，已根据 HIT / STALE 与未缓存请求结果修正。

## 后续处理顺序与验收条件

1. **优先改善可观测性，保留此次证据。** 后续在 WSL 源码中为每个来源记录 requestId、耗时、HTTP 状态、超时阶段、Ray ID、缓存状态和 Retry-After；不记录 Token、Cookie、完整搜索词或私人内容，不向浏览器暴露错误 HTML。结合已有 Docker 日志轮转，不新增日志服务。此项尚未实施。
2. **BGG：向对方提供时间、请求路径、出口 IP、Ray ID 以核查安全规则。** 同时，只有在已有可信第二出口可用时，才做一次保持 Key、UA、参数相同的对照。若第二出口成功而当前出口失败，才增强出口相关判断，并据此提出限定到 BGG 域名的配置。尚无第二出口验证结果，未发送反馈或修改网络。
3. **Bangumi：依照 Retry-After 做有限复测并保留结果；持续 522 时由其运营者排查源站可达性。** 另一出口也可帮助区分不同 Cloudflare 路径，但其作用需要验证，不能取代对方源站检查。本次没有设置后台重试任务。
4. **Key 轮换列为条件步骤。** 如得到明确认证错误，或通过平台确认现有 Token 已过期/撤销，再按平台规则生成新 Token。当前证据不支持直接批量换 Key。
5. **实际修复的验收：** 使用现有网页分别搜索，provider 状态为 ok 且有正确候选；选中候选后详情补全成功；在用户授权的测试条目上验证保存。仅“容器健康”“HTTP 200”或“错误不显示”均不算修复。本次尚未修复，也未创建测试作品。

## 如何重跑诊断

源码采集器见 [诊断工具说明](../../deploy/server/diagnostics/README.md)。服务器运行目录已保存本次使用的工具；在可访问真实主机 Docker 的终端执行一次：

```bash
python3 /home/trace/projects/homepage-deployment/evidence/collect-metadata-diagnostics.py
```

采集器使用现有容器的环境变量，不要求在命令行传 Key；只做公开资料读取和已存在日志/部署状态检查，不挂载新卷或映射新端口。它会创建新的 UTC 时间目录，保留请求记录、响应体、诊断脚本副本和部署状态。不要在上游要求的等待期内反复执行，也没有安装自动运行任务。

本轮响应最长约 8 KB，全部保存；脚本对后续异常大的响应设有上限并记录 `bodyTruncated`。记录目录为 0700，证据文件为 0600。既有更早期证据保持原样，报告对其不确定之处作出说明。
