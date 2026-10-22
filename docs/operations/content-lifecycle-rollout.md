# 内容回收站与Markdown生命周期升级

2026-10-22 UTC。此源码交付在现有Works/Post草稿版本机制上启用Payload原生Trash。实际生产结果记录在obsidian-workflow交接和部署evidence，不能由本文存在推断已迁移。

## 行为

- 原生Admin回收站和标准客户端软删除都保留记录ID、最新草稿及版本；普通永久DELETE拒绝。
- Work与Post恢复均回到draft；Work同时恢复private。恢复不授权重新发布。
- 公开Work筛选、Post构建端点、文章冻结快照与发布器排除deletedAt，异常快照拒绝构建。
- Markdown桥接通过标准分页API的`trash=true`观察明确deletedAt事件；文件缺失、远端404与重命名不推导删除。
- 软删bulk PATCH的预期updatedAt取最新草稿；普通发布／恢复按相应标准API基表版本核对。最新稿与基表均回读后才记录成功。

## 迁移与兼容

`20261022_050000_content_trash`只给works、cms_posts增加deleted_at，给_works_v、_cms_posts_v增加version_deleted_at及索引。迁移在SQLite显式事务中完成，不重建表、不回填／重写内容、不重建版本。down拒绝移除生命周期字段。

部署驱动同时检查migration ledger及物理列，拒绝切换或回退到无Trash语义的源码／镜像，否则旧应用可能重新公开回收站内容。先安装已审查的新驱动，再迁移及切换；已有草稿兼容检查继续保留。

## 检查与协调上线

1. 使用既有CI验证固定提交与不可变镜像；保留原服务配置和密钥，不执行setup/import/reset。
2. 完整一致备份SQLite、Media及运行配置，记录当时实际静态current、源码和镜像；对同镜像的私密数据库副本演练迁移、旧列逐行哈希、integrity/FK和原公开集合保持。
3. 暂停Markdown网站同步与原内容publisher timer，等待在途oneshot和共用发布锁；保持官方Obsidian Sync。升级窗口使用现有Nginx临时写门，保留静态网页可读。
4. 按既有草稿升级流程固定镜像，停旧Payload、运行独立迁移进程、启动并检查新Payload，然后部署同提交源码和publisher。不要先迁移后继续运行旧应用。
5. 标准API完整分页独立回读，除新增deletedAt:null外原业务字段保持，原公开集合保持；恢复原代理配置、publisher和Markdown网站同步timer，确认无pending。
6. 真实回收／恢复演练只在隔离数据库中进行，不为验收删除用户真实作品。保留迁移前备份与兼容回退镜像，不能通过删除migration记录绕过保护。

重点隔离检查在`services/payload/tests/integration/content-trash.test.ts`、`works-migration.test.ts`、标准／兼容客户端测试、前端冻结快照测试和`deploy/server/test-deploy-release.py`。库端冲突和生命周期回归在obsidian-workflow/tests。
