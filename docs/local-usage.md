# 本地试用

现在先验证浏览网站、添加作品和写博客。保留 Koharu 原生样式，批量迁移和上线随后处理。

## 启动三个入口

在仓库根目录打开三个终端，分别运行；现有依赖和本地数据库已准备好。

```sh
# 终端一：作品后台
cd services/payload
npm run dev
```

```sh
# 终端二：网站
pnpm dev
```

```sh
# 终端三：Markdown 写作台
pnpm cms
```

| 用途 | 地址 |
| --- | --- |
| 首页 | http://localhost:4321 |
| 作品库 | http://localhost:4321/library |
| 已迁入的文章 | http://localhost:4321/post/markdown-notes |
| 写文章 | http://localhost:4322 |
| 管理作品 | http://localhost:3000/admin |

## 添加作品

用原管理员账号登录作品后台，进入 Works，新建作品。选择类型，搜索、选择资料，补充自己的评分、状态、感想，再保存。设为 public 后，刷新开发站的 Library 查看结果。八个资料来源的凭据仅由后台读取。

## 写博客

在写作台点击 **New Post**，输入标题，创建后编辑正文，点击 **保存到博客**。默认新文章是草稿；返回 **posts** 列表，点击该文章的 **Publish** 按钮发布，再从首页打开。固定链接会自动生成。

写作台直接保存 `src/content/blog/` 中的 Markdown，刷新网站即可查看。现有文章也可从列表编辑。网站公开的 `/editor/` 是浏览器草稿工具；要直接写入仓库文件，使用上述本地写作台。

## 更新何时生效

本地开发时，保存文章或作品后刷新即可。正式静态网站需要运行 `pnpm build` 并发布新的 `dist/`；目前尚未部署，也未配置自动发布。生成完整 Library 时需先启动作品后台。

停止作品后台和写作台时，在各自终端按 Ctrl+C；Astro 开发服务器另用 `pnpm astro dev stop` 停止。YAML 配置修改后重启网站。
