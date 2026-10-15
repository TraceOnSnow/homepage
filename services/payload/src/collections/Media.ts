import path from 'node:path'
import type { CollectionConfig } from 'payload'
import { publicRead, writes } from './shared'

export const Media: CollectionConfig = {
  labels: { singular: {zh: '媒体', en: 'Media'}, plural: {zh: '媒体', en: 'Media'} },
  slug: 'media', access: { read: publicRead, ...writes },
  upload: {
    staticDir: process.env.MEDIA_DIR || path.resolve('storage/media'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    imageSizes: [{ name: 'card', width: 640, height: 480, fit: 'inside' }],
  },
  fields: [{ name: 'alt', label: {zh: '图片说明', en: 'Alternative text'}, type: 'text', required: true }],
}
