# 元数据来源只读诊断

2026-10-18 归档的服务器诊断工具，用于记录 BGG / Bangumi 的真实上游响应。背景、结果和未解决事项见[排查报告](../../../docs/operations/metadata-investigation-2026-10-18.md)。这不是业务修复，不安装代理、不更换 Key，也不改变生产日志或重试行为。

## 使用范围

仅在可以访问真实生产 Docker 的服务器终端运行，不在 WSL 启动任何服务。已部署的工具位于 `/home/trace/projects/homepage-deployment/evidence/`：

```bash
python3 /home/trace/projects/homepage-deployment/evidence/collect-metadata-diagnostics.py
```

若后续要更新工具，只复制审查后的这两个文件至上述目录：

- `collect-metadata-diagnostics.py`
- `metadata-network-probe.mjs`

不要整体同步或删除 evidence 目录。脚本要求现有 `homepage-local-production-payload-1`、`homepage-web-nginx-1` 容器、生产 Git checkout 和运行 evidence 目录；没有这些对象时应停止，不为诊断初始化服务。脚本中的路径、容器名和对比 Git 提交是本次部署的已知值，其他部署应先审查调整。

## 记录与隐私

每次调用只运行一轮，在运行 evidence 目录创建新的 UTC 时间子目录。请求日志包含公开测试词 MyGO / Catan、是否携带认证、超时、耗时、状态、选定响应头和响应体文件。Token 直接使用现有容器环境，不通过命令行参数传入、不输出内容；响应中的这两个 Token 如出现也会替换为脱敏标记。不导出容器完整环境或 Cookie，不调用管理员数据或个人收藏 API。

记录同时包括部署版本、容器健康和历史 metadata 访问摘要，摘要移除用户地址、真实查询词及认证内容。原始错误页和响应只存服务器，不提交 Git；大响应有长度上限，并显式记录是否截断。新目录权限 0700，证据文件权限 0600。

请求由 `docker exec -i` 中的短时 Node 进程执行；不重启容器、不挂载新卷、不映射端口、不修改数据库或配置。BGG 两次请求间隔超过 5 秒；无自动重试、定时器或后台任务。上游返回 Retry-After 后应遵守等待期，不连续运行采集器。

## 验证与限制

本次实际运行记录了六次请求和六份未截断响应，采集/提取命令正常结束；归档文件通过 Python AST 和 Node 语法检查。没有为了语法验证重复查询上游。该工具不用于高频监控；异常退出可能只留下不完整目录，必须检查退出码、`requests.jsonl` 中的 complete 事件和实际请求数，不能把缺失数据解释为来源正常。
