/**
 * Project page content. Featured entries render as detailed cards; the rest stay in the compact poster grid.
 * Facts come from each repository's README/docs and the owner's own notes; edits belong here, never in legacy/.
 */
export interface ProjectLink {
  label: string;
  url: string;
}

export interface Project {
  slug: string;
  title: string;
  /** One or two sentences: what it is. Shown on every card. */
  description: string;
  /** Primary destination of the cover link. */
  url: string;
  cover?: string;
  coverAlt?: string;
  /** Featured projects show the details below as a full-width card. */
  featured?: boolean;
  /** Free text such as "个人项目 · 2026.11 起". */
  meta?: string;
  /** What was built, one item per line. */
  built?: string[];
  /** The hardest problem and how it was handled. */
  challenge?: { title: string; body: string };
  stack?: string[];
  links?: ProjectLink[];
  /** Published article permalink (Posts' fixed link), without /post/. */
  article?: string;
}

export const projects: Project[] = [
  {
    slug: 'nanoparty',
    title: 'NanoParty',
    featured: true,
    meta: '个人项目 · 2026.11 起',
    description:
      '自部署的网页聚会游戏房间：2–8 位朋友一边语音，一边在网页上答题、投票；右侧是共享群聊、AI 主持和积分榜。目前有 25 款规则自定的小游戏，不配置模型也能完整游玩。',
    url: 'https://github.com/TraceOnSnow/NanoParty',
    cover: '/img/projects/nanoparty.webp',
    coverAlt: 'NanoParty 本地测试房间的选题界面：左侧是游戏主面板，右侧是派对积分和群聊',
    built: [
      '房间平台：邀请加入、群聊、断线重连和服务重启后恢复；游戏内成绩和派对积分分两本账，由房主确认入账。',
      '25 款游戏模块：每款是一组纯函数状态机（setup / apply / view），规则不调用模型。',
      'AI 主持与裁判：主持通过受控工具在主面板发起推荐、投票和出题；海龟汤由单独的 AI 裁判判定，判错可以标记、重判。',
      '测试工具：一个人开多人测试房间、走真实 HTTP + WebSocket 的场景脚本、多浏览器验收和真实模型评测。',
    ],
    challenge: {
      title: '让 AI 参与游戏，但不让它改规则或泄露秘密',
      body: '规则全部由确定性程序执行。每位玩家只收到 view(state, playerId) 生成的个人视图；AI 主持只看得到不含谜底、秘密词和手牌的公开摘要，需要秘密的判定交给独立裁判，并且只返回经 schema 校验的小结构。房间的每次变更串行执行、先写库再广播，命令带 cmdId，重发不会重复生效。',
    },
    stack: [
      'TypeScript',
      'React',
      'Vite',
      'Node.js',
      'Colyseus',
      'PostgreSQL',
      'Drizzle ORM',
      'Anthropic SDK',
      'Vitest',
      'Docker',
    ],
    links: [
      { label: 'GitHub', url: 'https://github.com/TraceOnSnow/NanoParty' },
      { label: '线上实例（需邀请）', url: 'https://nanoparty.traceonsnow.com' },
    ],
  },
  {
    slug: 'steamguess',
    title: 'SteamGuess',
    featured: true,
    meta: '个人项目 · 2026.01 起',
    description:
      '十次机会猜出一款 Steam 游戏。每猜一次，按价格、单日峰值、评测数、好评率、发行时间、开发商和标签逐项比较，颜色表示接近程度，箭头指出方向。支持每日挑战、自由练习和 2–8 人房间。',
    url: 'https://steamguess.traceonsnow.com',
    cover: '/img/projects/steamguess.webp',
    coverAlt: 'SteamGuess 首页：每日挑战、自由练习、多人房间三个入口和反馈颜色示例',
    built: [
      '数据管线：Python 脚本从 SteamSpy、Steam Storefront API 和商店页抓取约 2,000 款游戏的中英文名、国区与美区价格、评测和标签，生成冻结快照；抓取可断点续跑。',
      '题库分档：1,000 款可作答案的游戏分为入门、简单、普通、困难、地狱五档，另有 TGA 提名、MC 80+ 和自定义题库。',
      '多人房间：Socket.IO 同题竞速，选题、比较和结算都在服务端完成；Redis 保存进行中的房间，SQLite 记录完赛结果。',
      '部署：GitHub Actions 构建 Docker 镜像，自动部署到个人服务器并检查健康接口。',
    ],
    challenge: {
      title: '热度排序不等于中文玩家的熟悉程度',
      body: '按评测数和在线人数算出的热度分，会把 Rust、DayZ 排进前列，黑暗之魂 III 却只进普通档。先后试过标注工具加回归脚本、IGDB 热度公式和大模型逐款评分，事后对照发现大模型同样把 Rust、DayZ 判成简单。最后用热度分做冷启动，前 100 款由 AI 按中文社区印象起草、我逐项改档；地狱档的长尾题让玩家点“合适 / 太冷门”，再按统计手动调整。',
    },
    stack: ['React', 'TypeScript', 'Vite', 'Node.js', 'Socket.IO', 'Redis', 'SQLite', 'Python', 'Docker', 'GitHub Actions'],
    links: [
      { label: '在线游玩', url: 'https://steamguess.traceonsnow.com' },
      { label: 'GitHub', url: 'https://github.com/TraceOnSnow/SteamGuess' },
    ],
  },
  {
    slug: 'traceflow',
    title: 'TraceFlow：个人内容系统',
    featured: true,
    meta: '个人项目 · 2026.10 起',
    description:
      '这个网站背后的内容系统。日常在 Obsidian 写笔记、记录作品，决定公开的内容再同步到网站。由三个仓库组成：chatgpt-pipeline 把历史聊天整理成笔记，obsidian-workflow 管理 Markdown 库和同步，homepage 用 Payload 管理文章与作品、Astro 生成静态站。',
    url: 'https://github.com/TraceOnSnow/obsidian-workflow',
    cover: '/img/projects/traceflow-library.webp',
    coverAlt: '本站媒体库页面：按类型和状态筛选的作品卡片',
    built: [
      '内容库 CLI：每条笔记有稳定 ID、哈希和历史，新建、修改、恢复、删除都输出 JSON，人和 Agent 共用；同一实现也提供 MCP 和 Skill。',
      '作品库：500 多部游戏、书籍、影视在一张 Markdown 总表里维护评分、进度和体验日期，同步到网站的媒体库。',
      '发表流程：私人笔记和发表稿分开保存；publish-article 接收固定 JSON 请求，一次完成发表稿、同步和 API 回读，不再需要 Agent 每次临时写脚本。',
      '网站：在 Astro Koharu 主题上扩展媒体库、作品与文章关联和 Payload 后台；GitHub Actions 构建镜像后部署到服务器。',
    ],
    challenge: {
      title: '两端都能编辑时，不能静默覆盖',
      body: 'Obsidian 和 Payload 后台都能改同一条内容。同步时用当前文件哈希、共同基线和远端版本判断哪一端改过：两端都改就保留冲突等人处理；写入后回读成功才推进基线，超时先对账再重试；扫描时找不到文件也不推断为删除。聊天整理管线也按同样思路分工：模型只写正文，编号、来源关系和一致性校验交给程序。',
    },
    stack: ['Python', 'TypeScript', 'Astro', 'Payload CMS', 'SQLite', 'MCP', 'Obsidian', 'Docker', 'Nginx'],
    links: [
      { label: '媒体库', url: '/library' },
      { label: 'obsidian-workflow', url: 'https://github.com/TraceOnSnow/obsidian-workflow' },
      { label: 'chatgpt-pipeline', url: 'https://github.com/TraceOnSnow/chatgpt-pipeline' },
      { label: 'homepage', url: 'https://github.com/TraceOnSnow/homepage' },
    ],
  },
  {
    slug: 'hearthstone-card-generator',
    title: 'HearthGen',
    featured: true,
    meta: '课程小组项目 · 2026 春',
    description:
      '输入一句 DIY 卡牌想法，生成炉石风格的卡牌设计、原画和合成卡面。官方卡牌数据先整理成结构化语义和知识图谱，用来检索参考卡牌，再由 LoRA 微调的 Stable Diffusion 生成原画。',
    url: 'https://github.com/TraceOnSnow/HearthstoneCardGenerator',
    cover: '/img/projects/hearthgen.webp',
    coverAlt: 'HearthGen 用 LoRA 和知识图谱参考卡生成的 Iron Rager 卡牌原画',
    built: [
      '从官方卡牌 JSON 生成结构化语义（职业、类型、关键字、机制等），可选用 LLM 补全隐式信息，再构建语义知识图谱。',
      '文字和原画解耦：扩散模型只生成中间的原画，边框、费用、身材和描述由模板拼回卡面。',
      '对比实验：参考卡检索比较 TF-IDF、CLIP 和知识图谱；生成比较 SD 基座与 LoRA、纯文本与参考图条件。',
      '封装成 hs-cardgen 命令行，一次输出卡牌设计、原画提示词、原画和合成卡面。',
    ],
    challenge: {
      title: '没有现成 benchmark，怎么判断有没有用',
      body: 'PSNR、MSE 需要标准答案图，不适用于生成任务。最后用 CLIP 分别衡量提示词对齐，以及与真实炉石原画的风格相似度。10 条提示词的小规模对比里，LoRA 把风格相似度从 0.786 提到 0.863，提示词对齐基本不变；知识图谱检索的 Top-5 综合指标高于 TF-IDF（0.81 对 0.68），但用作参考图后，生成指标没有更好，这一点在报告里写成“尚未得到支持”。',
    },
    stack: ['Python', 'Stable Diffusion 1.5', 'LoRA', 'CLIP', 'LLM', '知识图谱'],
    links: [{ label: 'GitHub', url: 'https://github.com/TraceOnSnow/HearthstoneCardGenerator' }],
  },
  {
    slug: 'hayaku-shelf',
    title: 'hayaku-shelf',
    description:
      '自部署的作品记录与个人展柜，分开保存作品资料和个人体验，接入 TMDB、Bangumi、IGDB 等资料源（Next.js、SQLite、Drizzle）。逐条搜索添加太繁琐，作品记录后来改到 Markdown 里维护，由本站媒体库承接。',
    url: 'https://github.com/TraceOnSnow/hayaku-shelf',
  },
  {
    slug: 'manboard',
    title: 'manboard',
    description:
      '本地优先的个人任务看板（React + FastAPI），用可拖动、可缩放的 Box 组织任务，提供 API 和 MCP 接口。用了一段时间发现任务量不需要专门维护一个看板，已停用。',
    url: 'https://github.com/TraceOnSnow/manboard',
  },
  {
    slug: 'manbo-agent',
    title: 'manbo-agent',
    description:
      '个人信息流 Agent：从 RSS 和网页收集文章，经正文解析、过滤和 LLM 分析，生成 Markdown 笔记与日报（Python、SQLite）。',
    url: 'https://github.com/TraceOnSnow/manbo-agent',
  },
];
