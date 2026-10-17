import type { CollectionConfig } from 'payload'
import { administrator } from './shared'

// A normal Payload API-key identity, shared by scripts and AI tools.
export const ContentClients: CollectionConfig = {
  slug: 'content-clients',
  labels: { singular: { zh: '内容客户端', en: 'Content client' }, plural: { zh: '内容客户端', en: 'Content clients' } },
  auth: { useAPIKey: true, disableLocalStrategy: true },
  admin: { useAsTitle: 'name', description: '仅可管理作品、文章及查询资料；不允许进入后台、管理账号或上传文件。' },
  access: { admin: administrator, create: administrator, read: administrator, update: administrator, delete: administrator },
  fields: [{ name: 'name', type: 'text', required: true, label: { zh: '名称', en: 'Name' } }],
}
