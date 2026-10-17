import type { CollectionConfig } from 'payload'
import { administrator } from './shared'

export const Users: CollectionConfig = {
  labels: { singular: {zh: '管理员', en: 'Users'}, plural: {zh: '管理员', en: 'Users'} },
  slug: 'users', auth: true,
  admin: { useAsTitle: 'email' },
  access: { admin: administrator, create: administrator, read: administrator, update: administrator, delete: administrator },
  fields: [{ name: 'name', label: {zh: '姓名', en: 'Name'}, type: 'text' }],
}
