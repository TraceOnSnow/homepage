export type Language = 'zh' | 'en'
export const languageCookie = 'trace-ui-language'
export const dictionaries = {
  zh: {
    posts: '文章', works: '作品记录', projects: '项目', credits: '资料来源', admin: '管理', navigation: '主导航',
    recentPosts: '最近文章', allPosts: '全部文章 →', allWorks: '全部记录 →', allProjects: '全部项目 →',
    emptyPosts: '暂无已发布文章。', emptyWorks: '暂无作品记录。', emptyProjects: '暂无项目。',
    pagination: '分页', previous: '← 上一页', next: '下一页 →', filters: '作品分类', all: '全部',
    relatedWorks: '相关作品', relatedPosts: '相关文章', emptyRelatedPosts: '暂无相关文章。',
    releaseDate: '发行日期', creators: '创作者', platforms: '平台', sources: '资料来源：', note: '感想', experiences: '体验记录',
    visit: '访问项目 ↗', sourceCode: '源码 ↗', notFound: '页面不存在', home: '返回首页', postMissing: '文章不存在', workMissing: '作品不存在',
    game: '游戏', anime: '动画', book: '书籍', movie: '电影', tv: '电视剧', manga: '漫画', comic: '美漫', boardgame: '桌游',
    planned: '计划中', 'in-progress': '进行中', completed: '已完成', 'on-hold': '暂停', dropped: '已放弃',
    web: '网页', mobile: '移动应用', desktop: '桌面应用', other: '其他',
    searchGames: '搜索游戏', metadataSearch: '作品资料搜索', searchWorks: '搜索作品', detailFailed: '详情暂时不可用，已填入搜索结果中的基础资料。', upgradeRequired: '来源 API 需要升级，请更新适配器后重试。', search: '搜索', searching: '处理中…', choose: '选择',
    searchHint: '填充基础资料；个人评分、状态、笔记和上传封面保持不变。',
    expired: '登录已过期，请重新登录。', searchFailed: '搜索失败，请稍后重试。', noResults: '没有搜索结果。',
    applied: '已填入作品资料，请检查后保存：', unavailable: '服务端尚未配置凭据。',
    providerError: '来源暂时不可用，请稍后重试。', rateLimited: '请求过于频繁，请稍后重试。',
  },
  en: {
    posts: 'Posts', works: 'Works', projects: 'Projects', credits: 'Credits', admin: 'Admin', navigation: 'Main navigation',
    recentPosts: 'Recent posts', allPosts: 'All posts →', allWorks: 'All works →', allProjects: 'All projects →',
    emptyPosts: 'No published posts yet.', emptyWorks: 'No works yet.', emptyProjects: 'No projects yet.',
    pagination: 'Pagination', previous: '← Previous', next: 'Next →', filters: 'Work categories', all: 'All',
    relatedWorks: 'Related works', relatedPosts: 'Related posts', emptyRelatedPosts: 'No related posts yet.',
    releaseDate: 'Release date', creators: 'Creators', platforms: 'Platforms', sources: 'Sources:', note: 'Reaction', experiences: 'Experiences',
    visit: 'Visit project ↗', sourceCode: 'Source code ↗', notFound: 'Page not found', home: 'Back to home', postMissing: 'Post not found', workMissing: 'Work not found',
    game: 'Games', anime: 'Anime', book: 'Books', movie: 'Movies', tv: 'TV', manga: 'Manga', comic: 'Comics', boardgame: 'Board games',
    planned: 'Planned', 'in-progress': 'In progress', completed: 'Completed', 'on-hold': 'On hold', dropped: 'Dropped',
    web: 'Web', mobile: 'Mobile', desktop: 'Desktop', other: 'Other',
    searchGames: 'Search games', metadataSearch: 'Work metadata search', searchWorks: 'Search works', detailFailed: 'Details unavailable; filled basic search metadata.', upgradeRequired: 'Provider API requires an adapter update.', search: 'Search', searching: 'Searching…', choose: 'Select',
    searchHint: 'Fill basic metadata; keep your rating, status, notes and uploaded cover.',
    expired: 'Your session expired. Please sign in again.', searchFailed: 'Search failed. Please try again.', noResults: 'No results found.',
    applied: 'Metadata filled. Review it before saving:', unavailable: 'Server credentials are not configured.',
    providerError: 'Provider unavailable. Please try again.', rateLimited: 'Too many requests. Please try again later.',
  },
} satisfies Record<Language, Record<string, string>>
export type UIKey = keyof typeof dictionaries.zh
export const uiLabel = (language: Language, value?: string | null) => value ? dictionaries[language][value as UIKey] || value : ''
