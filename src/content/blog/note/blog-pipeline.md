---
title: Obsidian + WSL + Next.js 博客的工作流与踩坑实录
tags:
  - dev
  - project
  - troubleshooting
  - wsl
  - obsidian
  - next-js
draft: false
description: ""
link: blog-pipeline
date: 2026-02-26T00:00:00+08:00
categories:
  - 工程
---

花了几天时间研究和捣鼓了一下个人博客网站：

- **前端框架**：Tailwind Nextjs Starter Blog
- **部署平台**：Vercel
- **开发环境**：Windows 11 下的 WSL (Ubuntu) + VS Code
- **写作工具**：Obsidian

部署过程极度丝滑。但是当我在 Windows 的 Obsidian 里写文章，写完用 Git 一推，Vercel 自动上线。

## 踩坑实录：一根筋变成两头堵

### 一：Windows 本地的Obsidian管理WSL中的Vault

起初，我的想法很直接：直接用 Windows 上的 Obsidian，通过网络路径 `\\wsl.localhost\Ubuntu\home\...\my-homepage` 把 WSL 里的博客项目作为 Vault（仓库）打开。

**结果**：Obsidian疯狂报错：

`Error: EISDIR: illegal operation on a directory, watch...`

我发现这是自2020年就有人在Obsidian论坛反馈过[这个问题](https://forum.obsidian.md/t/support-for-vaults-in-windows-subsystem-for-linux-wsl/8580)，不过直到目前发布时间仍然没有修复。

### 二：WSL中安装Obsidian

在WSL中安装Linux版的Obsidian，可以用[wslg](https://github.com/microsoft/wslg)运行GUI。不过我懒得折腾，没有去尝试。

### 三：把前端项目从WSL移到 Windows 本地

既然网络路径不行，那把整个 Next.js 项目挪到 Windows 盘符下（比如 `C盘`），然后让 WSL 通过 `/mnt/c/` 反向访问它总行了吧？

**结果**：Obsidian 管理写博客丝滑了，但每次在 WSL 里运行 `npm install` 或者 `npm run dev` 时，会有明确卡顿

## 最终选择：单向数据流水线 (One-way Data Pipeline)

放弃“让两个软件读取同一个物理文件夹”的幻想，让它们各自待在最舒服的地方：

- **Windows (Obsidian)**：作为文章和图片的“真理之源 (Source of Truth)”，绝对的主人。
- **WSL (Next.js)**：作为纯粹的编译和发布引擎。

我们只需要在它们之间架设一条毫秒级的单向流水线。

## 终极配置指南

### Step 1: 打造纯净的写作端 (Windows)

为了数据安全和配置隔离，强烈建议为博客**单独建一个 Obsidian Vault**，不要和日常私人笔记混在一起。

1. 在 Windows 本地（如 D 盘）新建文件夹 `MyBlogSite`，用 Obsidian 作为一个全新的 Vault 打开。
2. 在 Vault 根目录建立两个文件夹：
   - `blogs/`：存放所有的 `.md` 文章。
   - `static/images/`：存放所有的文章配图（这个结构是为了完美兼容 Next.js 的路由）。

3. **核心配置（极其重要）**：打开 Obsidian 设置 -> **Files & Links**：
   - **Default location for new attachments**：选择我们刚建的 `static/images`。
   - **Use [[Wikilinks]]**：**关闭**（必须使用标准的 Markdown 链接）。

_配置完成后，你在 Obsidian 里粘贴的任何图片，都会自动存入 `static/images/`，并且在 Markdown 里生成 `![img](/static/images/pic.png)`。这个路径，Next.js 网页端原生完美识别，无需任何正则替换！_

### Step 2: 给引擎室注入同步脚本 (WSL)

打开 WSL 终端，进入你的 Next.js 项目根目录。打开 `package.json`，在 `"scripts"` 块中加入这几行极客代码（注意把 `/mnt/d/MyBlogSite/...` 替换为你实际的 Windows 盘符路径）：

JSON

```
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "sync-blog": "rsync -av --delete /mnt/d/MyBlogSite/blogs/ ./data/blog/",
    "sync-images": "rsync -av --delete /mnt/d/MyBlogSite/static/images/ ./public/static/images/",
    "sync": "npm run sync-blog && npm run sync-images"
  }
```

**为什么用 rsync？**

这里的 `--delete` 参数是灵魂。它不仅能实现毫秒级的增量同步，还能做到**镜像级删除**。你在 Obsidian 里删掉的废稿和废图，运行脚本后，WSL 里的对应文件也会被自动抹除，永远保持纯净。

### Step 3: 享受极致的工作流

从今天起，工作流变得极其清爽：

1. **专注创作**：打开 Windows 上的 Obsidian，专注写作、插图。不需要开终端，不需要起服务。
2. **一键同步**：文章写完想发布了，打开 WSL 终端，敲入：

   Bash

   ```
   npm run sync
   ```

   _魔法发生：文章和图片瞬间飞入 WSL 的 `data/blog/` 和 `public/static/images/` 里。_

3. **丝滑上线**：

   Bash

   ```
   git add .
   git commit -m "feat: add new post"
   git push
   ```

   Vercel 自动拉取最新的物理文件，构建发布。

## 结语

这套工作流完美地解决了 Obsidian 的跨系统监听 bug，彻底告别了路径映射的烦恼，同时又保证了 Next.js 在 Linux 原生文件系统下的极致编译性能。哪怕哪天 WSL 崩溃重装，你宝贵的图文数据依然安全地躺在 Windows 的独立 Vault 里。

少一点系统底层的无谓消耗，多一点专注输出的心流时间。希望这篇踩坑记录能帮到同样在折腾博客的你！
