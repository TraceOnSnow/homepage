import type { CollectionConfig } from 'payload'
import { authenticated } from './shared'

export const Users: CollectionConfig = {
  labels: { singular: {zh: '管理员', en: 'Users'}, plural: {zh: '管理员', en: 'Users'} },
  slug: 'users', auth: true,
  admin: { useAsTitle: 'email' },
  access: { admin: authenticated, create: authenticated, read: authenticated, update: authenticated, delete: authenticated },
  fields: [{ name: 'name', label: {zh: '姓名', en: 'Name'}, type: 'text' }],
}
