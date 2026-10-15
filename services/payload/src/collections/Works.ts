import { dictionaries } from '@/lib/ui/dictionary'
import type { CollectionConfig } from 'payload'
import { cover, httpURL, slug, tags, writes } from './shared'

export { workTypes } from '@/lib/metadata/types'
import { workTypes } from '@/lib/metadata/types'
const statuses = ['planned', 'in-progress', 'completed', 'on-hold', 'dropped'] as const
const statusOptions = statuses.map(value => ({ value, label: { zh: dictionaries.zh[value], en: dictionaries.en[value] } }))

export const Works: CollectionConfig = {
  labels: { singular: {zh: '作品', en: 'Works'}, plural: {zh: '作品', en: 'Works'} },
  slug: 'works', admin: { useAsTitle: 'title', defaultColumns: ['title', 'type', 'rating', 'status'] },
  access: { read: ({ req }) => req.user ? true : { visibility: { equals: 'public' } }, ...writes },
  fields: [
    { name: 'type', label: {zh: '类型', en: 'Type'}, type: 'select', required: true, defaultValue: 'game', options: workTypes.map(value => ({ value, label: { zh: dictionaries.zh[value], en: dictionaries.en[value] } })) },
    { name: 'metadataSearch', type: 'ui', admin: {
      components: { Field: '/components/admin/MetadataSearch#MetadataSearch' },
    } },
    { name: 'title', label: {zh: '标题', en: 'Title'}, type: 'text', required: true }, slug,
    { name: 'aliases', label: {zh: '别名', en: 'Aliases'}, type: 'text', hasMany: true }, cover,
    { name: 'coverUrl', label: {zh: '外部封面', en: 'External cover'}, type: 'text', validate: httpURL, admin: { description: { zh: '外部封面；上传封面优先。', en: 'External cover; uploaded covers take priority.' } } },
    { name: 'releaseDate', label: {zh: '发行日期', en: 'Release date'}, type: 'date' },
    { name: 'creators', label: {zh: '创作者', en: 'Creators'}, type: 'text', hasMany: true },
    { name: 'platforms', label: {zh: '平台', en: 'Platforms'}, type: 'text', hasMany: true },
    { name: 'description', label: {zh: '简介', en: 'Description'}, type: 'textarea' },
    { name: 'sources', label: {zh: '资料来源', en: 'Sources'}, type: 'array', fields: [
      { name: 'provider', label: {zh: '来源', en: 'Provider'}, type: 'text', required: true },
      { name: 'externalId', label: {zh: '来源 ID', en: 'Provider ID'}, type: 'text', required: true },
      { name: 'url', label: {zh: '链接', en: 'URL'}, type: 'text', validate: httpURL },
      { name: 'fetchedAt', label: {zh: '获取时间', en: 'Fetched at'}, type: 'date' },
    ] },
    { name: 'rating', label: {zh: '个人评分', en: 'Rating'}, type: 'number', min: 0, max: 10, admin: { step: 0.1, description: { zh: '个人评分，0–10；未评分时留空。', en: 'Personal rating, 0–10; leave blank if unrated.' } } },
    { name: 'status', label: {zh: '状态', en: 'Status'}, type: 'select', options: statusOptions, defaultValue: 'planned' }, tags,
    { name: 'note', label: {zh: '短感受', en: 'Short reaction'}, type: 'textarea', admin: {
      components: { Field: '/components/admin/ReactionField#ReactionField' },
      description: { zh: '留空时显示关联文章标题；占位文字不会保存到短感受。', en: 'Empty reactions use the article title; placeholder text is never saved.' },
    } },
    { name: 'article', label: { zh: '关联文章', en: 'Article' }, type: 'relationship', relationTo: 'posts', hasMany: false,
      admin: { description: { zh: '可选择、新建或编辑一篇文章。短感受留空时，前台显示文章标题；不会自动改写短感受。', en: 'Choose, create or edit one article. Empty reactions display its title without copying it.' } } },
    { name: 'experiences', label: {zh: '体验记录', en: 'Experiences'}, type: 'array', fields: [
      { name: 'status', label: {zh: '状态', en: 'Status'}, type: 'select', options: statusOptions, defaultValue: 'completed' },
      { name: 'startedOn', label: {zh: '开始日期', en: 'Started on'}, type: 'date' }, { name: 'endedOn', label: {zh: '结束日期', en: 'Ended on'}, type: 'date' },
      { name: 'platform', label: {zh: '平台', en: 'Platform'}, type: 'text' }, { name: 'progress', label: {zh: '进度', en: 'Progress'}, type: 'text' }, { name: 'note', label: {zh: '感想 / 笔记', en: 'Reaction / Notes'}, type: 'textarea' },
    ] },
    { name: 'visibility', label: {zh: '可见性', en: 'Visibility'}, type: 'select', required: true, defaultValue: 'public', options: [{ value: 'public', label: { zh: '公开', en: 'Public' } }, { value: 'private', label: { zh: '私密', en: 'Private' } }], admin: { position: 'sidebar' } },
  ],
}
