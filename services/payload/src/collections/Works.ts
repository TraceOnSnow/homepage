import { preserveContentHistory, restoreAsDraft } from './lifecycle'
import { dictionaries } from '@/lib/ui/dictionary'
import { ValidationError, type CollectionConfig, type CollectionBeforeValidateHook, type Where } from 'payload'
import { cover, httpURL, slug, tags, writes } from './shared'

export { workTypes } from '@/lib/metadata/types'
import { workTypes } from '@/lib/metadata/types'
import { validateExperienceDate } from '@/lib/experience'
const statuses = ['planned', 'in-progress', 'completed', 'on-hold', 'dropped'] as const
const statusOptions = statuses.map(value => ({ value, label: { zh: dictionaries.zh[value], en: dictionaries.en[value] } }))

// Native draft saves skip field validators; enforce the scale for every API write.
const validatePersonalRating: CollectionBeforeValidateHook = ({ data }) => {
  const rating = data?.rating
  if (rating !== undefined && rating !== null && rating !== '' && (typeof rating !== 'number' || !Number.isFinite(rating) || rating < 0 || rating > 100)) {
    throw new ValidationError({ errors: [{ path: 'rating', message: '个人评分须为 0–100，100 满分；未评分请留空。' }] })
  }
  return data
}

export const Works: CollectionConfig = {
  labels: { singular: {zh: '作品', en: 'Works'}, plural: {zh: '作品', en: 'Works'} },
  slug: 'works', admin: { useAsTitle: 'title', defaultColumns: ['title', 'type', 'rating', 'status', '_status'] },
  versions: { drafts: true, maxPerDoc: 30 },
  trash: true,
  access: {
    ...writes,
    read: ({ req }): true | Where => req.user ? true : { and: [
      { deletedAt: { exists: false } },
      { _status: { equals: 'published' } }, { visibility: { equals: 'public' } },
    ] },
    readVersions: ({ req }) => Boolean(req.user),
  },
  hooks: { beforeValidate: [validatePersonalRating], beforeChange: [restoreAsDraft], beforeDelete: [preserveContentHistory] },
  fields: [
    { name: 'type', label: {zh: '类型', en: 'Type'}, type: 'select', required: true, defaultValue: 'game', options: workTypes.map(value => ({ value, label: { zh: dictionaries.zh[value], en: dictionaries.en[value] } })) },
    { name: 'metadataSearch', type: 'ui', admin: {
      components: { Field: '/components/admin/MetadataSearch#MetadataSearch' },
    } },
    { name: 'title', label: {zh: '标题', en: 'Title'}, type: 'text', required: true }, slug,
    { name: 'rating', label: {zh: '个人评分（满分100）', en: 'Rating (out of 100)'}, type: 'number', min: 0, max: 100, admin: { step: 1, description: { zh: '个人评分，0–100，100 满分；未评分时留空。', en: 'Personal rating, 0–100 (out of 100); leave blank if unrated.' } } },
    { name: 'status', label: {zh: '状态', en: 'Status'}, type: 'select', options: statusOptions, defaultValue: 'completed' }, tags,
    { name: 'note', label: {zh: '短感受', en: 'Short reaction'}, type: 'textarea', admin: {
      components: { Field: '/components/admin/ReactionField#ReactionField' },
      description: { zh: '一句话感受，也可记录“第八集”“二周目通关”等。留空时显示关联文章标题，不自动改写内容。', en: 'A reaction or progress note, e.g. episode 8 or second playthrough. Empty reactions display the linked article title.' },
    } },
    { name: 'article', label: { zh: '关联笔记', en: 'Linked article' }, type: 'relationship', relationTo: 'posts', hasMany: false,
      admin: { description: { zh: '可选择、新建或编辑一篇文章。短感受留空时，前台显示文章标题；不会自动改写短感受。', en: 'Choose, create or edit one article. Empty reactions display its title without copying it.' } } },
    { name: 'experiences', label: {zh: '体验时间', en: 'Experience dates'}, type: 'array', defaultValue: [{}], admin: {
      description: { zh: '主要填写结束时间；开始时间可空。不记得时间可以留空，重看／重读时可保留多次记录。', en: 'End date is usually enough; start date and unknown dates may be blank. Existing repeat experiences are preserved.' },
    }, fields: [
      { type: 'row', fields: [
        { name: 'startedOn', label: {zh: '开始时间', en: 'Started on'}, type: 'text', validate: validateExperienceDate,
          admin: { components: { Field: '/components/admin/ExperienceDateField#ExperienceDateField' } } },
        { name: 'endedOn', label: {zh: '结束时间', en: 'Finished on'}, type: 'text', validate: validateExperienceDate,
          admin: { components: { Field: '/components/admin/ExperienceDateField#ExperienceDateField' } } },
      ] },
      { type: 'collapsible', label: { zh: '已有补充记录', en: 'Existing experience details' }, admin: {
        initCollapsed: true, condition: (_data, sibling) => Boolean(sibling.platform || sibling.progress || sibling.note),
      }, fields: [
        { name: 'status', label: {zh: '当时状态', en: 'Previous status'}, type: 'select', options: statusOptions, defaultValue: 'completed', admin: { readOnly: true } },
        { name: 'platform', label: {zh: '平台', en: 'Platform'}, type: 'text', admin: { readOnly: true } },
        { name: 'progress', label: {zh: '原进度', en: 'Previous progress'}, type: 'text', admin: { readOnly: true } },
        { name: 'note', label: {zh: '原备注', en: 'Previous note'}, type: 'textarea', admin: { readOnly: true } },
      ] },
    ] },
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
    { name: 'visibility', label: {zh: '发布后的可见性', en: 'Visibility when published'}, type: 'select', required: true, defaultValue: 'private', options: [{ value: 'public', label: { zh: '公开', en: 'Public' } }, { value: 'private', label: { zh: '私密', en: 'Private' } }], admin: { position: 'sidebar', description: { zh: '保存草稿不会改变线上版本。只有明确发布且选择公开的作品才会展示。', en: 'Saving a draft keeps the live version. Only published public Works are visible.' } } },
  ],
}
