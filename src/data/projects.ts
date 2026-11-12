/** Initial project copy comes from the old blog; edits belong here, never in legacy/. */
export interface Project {
  slug: string;
  title: string;
  description: string;
  url: string;
  cover?: string;
  /** Published article permalink (Posts' fixed link), without /post/. */
  article?: string;
}

export const projects: Project[] = [
  {
    slug: 'steamguess',
    title: 'SteamGuess',
    description: '十次机会猜出一款 Steam 游戏，按价格、在线峰值、评测与标签逐项反馈；支持每日挑战、自由练习和 2–8 人房间。',
    url: 'https://steamguess.traceonsnow.com',
    cover: '/img/projects/steamguess.png',
  },
  {
    slug: 'hearthstone-card-generator',
    title: 'HearthstoneCardGenerator',
    description: '将知识图谱、LLM 与 Stable Diffusion 串联起来生成炉石传说卡牌的课程原型。',
    url: 'https://github.com/TraceOnSnow/HearthstoneCardGenerator',
  },
  {
    slug: 'hayaku-shelf',
    title: 'hayaku-shelf',
    description: '基于 Next.js、SQLite 与 Drizzle 构建的个人收藏整理项目。',
    url: 'https://github.com/TraceOnSnow/hayaku-shelf',
  },
  {
    slug: 'manboard',
    title: 'manboard',
    description: '面向本地工作流的任务看板，采用 Python API 与前端界面组织和跟踪任务。',
    url: 'https://github.com/TraceOnSnow/manboard',
  },
  {
    slug: 'manbo-agent',
    title: 'manbo-agent',
    description: '围绕 RSS 和信息流收集、处理与筛选的 Python Agent，使用 FastAPI、SQLite 与 LLM。',
    url: 'https://github.com/TraceOnSnow/manbo-agent',
  },
];
