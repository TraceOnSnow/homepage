import type { CollectionConfig, Where } from 'payload'
import { cover, tags, writes } from './shared'
import { slugify } from '../lib/slug'

export const Posts: CollectionConfig = {
  slug: 'posts', dbName: 'cms_posts',
  labels: { singular: { zh: '文章', en: 'Post' }, plural: { zh: '文章', en: 'Posts' } },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'locale', '_status', 'publishedAt'] },
  versions: { drafts: true, maxPerDoc: 30 },
  indexes: [{ fields: ['locale', 'link'], unique: true }],
  access: {
    ...writes,
    read: ({ req }): true | Where => req.user ? true : { and: [
      { _status: { equals: 'published' } }, { protectedContent: { equals: false } },
    ] },
    readVersions: ({ req }) => Boolean(req.user),
  },
  hooks: { beforeValidate: [({ data, originalDoc }) => {
    if (!data) return data
    data.link ||= originalDoc?.link || slugify(data.title || '')
    data.publishedAt ||= originalDoc?.publishedAt || new Date().toISOString()
    const metadata = data.frontmatter === undefined ? originalDoc?.frontmatter : data.frontmatter
    const markdown = data.markdown === undefined ? originalDoc?.markdown : data.markdown
    data.protectedContent = Boolean(metadata?.password || /^[ \t]*:{3,}[ \t]*encrypted\b/m.test(markdown || ''))
    return data
  }] },
  fields: [
    { name: 'title', label: { zh: '标题', en: 'Title' }, type: 'text', required: true },
    { name: 'markdown', label: { zh: 'Markdown 正文', en: 'Markdown source' }, type: 'textarea', maxLength: 1_000_000, admin: { rows: 24, description: { zh: '保存原始 Markdown，支持纯文字；由 Koharu 渲染。', en: 'Raw Markdown, rendered by Koharu.' } } },
    { name: 'link', label: { zh: '固定链接', en: 'Permalink' }, type: 'text',
      validate: (value: unknown) => typeof value === 'string' && value.length <= 240 && value.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('_') && !/[\\?#%\s\p{Cc}]/u.test(part)) || '请输入安全的相对路径，例如 note/my-review。',
      admin: { position: 'sidebar', description: '首次自动生成；改标题不改变链接。' } },
    { name: 'locale', label: { zh: '语言', en: 'Language' }, type: 'select', required: true, defaultValue: 'zh', options: ['zh', 'en', 'ja', 'ko'], admin: { position: 'sidebar' } },
    { name: 'publishedAt', label: { zh: '发布日期', en: 'Publication date' }, type: 'date', required: true, defaultValue: () => new Date().toISOString(), admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'description', label: { zh: '摘要', en: 'Description' }, type: 'textarea' },
    tags, cover,
    { name: 'categories', label: { zh: '分类', en: 'Categories' }, type: 'json', admin: { description: 'Koharu 分类数组，例如 ["笔记"] 或 [["笔记", "前端"]]。' } },
    { name: 'frontmatter', label: { zh: '其他主题选项', en: 'Other theme options' }, type: 'json', admin: { description: '保留原生 Markdown 选项；标题、链接、日期和草稿状态以上方字段为准。' } },
    { name: 'protectedContent', type: 'checkbox', defaultValue: false, admin: { hidden: true, readOnly: true } },
  ],
}
