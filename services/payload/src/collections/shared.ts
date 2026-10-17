import type { Access, Field, PayloadRequest } from 'payload'
import { slugField } from 'payload'
import { slugify } from '../lib/slug'

export const administrator = ({ req }: { req: PayloadRequest }): boolean => req.user?.collection === 'users'
export const authenticated = ({ req }: { req: PayloadRequest }): boolean =>
  administrator({ req }) || req.user?.collection === 'content-clients'
export const publicRead: Access = () => true
export const writes = { create: authenticated, update: authenticated, delete: authenticated }
export const administratorWrites = { create: administrator, update: administrator, delete: administrator }
export const slug: Field = slugField({
  slugify: ({ valueToSlugify }) => slugify(String(valueToSlugify || '')),
  overrides: (row) => {
    const field = row.fields[1]
    if (field.type === 'text') field.hooks = {
      beforeValidate: [({ value, data, originalDoc }) => value || originalDoc?.slug || slugify(data?.title || '')],
    }
    return row
  },
})
export const tags: Field = { name: 'tags', label: {zh: '标签', en: 'Tags'}, type: 'text', hasMany: true }
export const cover: Field = { name: 'cover', label: {zh: '封面', en: 'Cover'}, type: 'upload', relationTo: 'media' }
export const httpURL = (value: unknown, options?: { req?: PayloadRequest }) => {
  const chinese = options?.req?.i18n.language !== 'en'
  const invalid = chinese ? '请输入有效 URL。' : 'Enter a valid URL.'
  const protocol = chinese ? '请输入 HTTP(S) URL。' : 'Enter an HTTP(S) URL.'
  if (!value) return true
  try { return ['http:', 'https:'].includes(new URL(String(value)).protocol) || protocol }
  catch { return invalid }
}
