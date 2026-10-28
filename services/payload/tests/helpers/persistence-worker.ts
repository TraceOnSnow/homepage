import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'
import config from '../../src/payload.config'

const payload = await getPayload({ config })
try {
  if (process.argv[2] === 'create') {
    // This fixture intentionally represents a pre-percent legacy database.
    const { migrations } = await import('../../src/migrations')
    await payload.db.migrate({ migrations: migrations.slice(0, -1).map(m => ({ name: m.name, up: args => m.up(args as MigrateUpArgs), down: args => m.down(args as MigrateDownArgs) })) })
  } else await payload.db.migrate()
  if (process.argv[2] === 'create') {
    await payload.create({ collection: 'users', data: { email: 'owner@example.test', password: 'persistence-test-password' } })
    const { default: sharp } = await import('sharp')
    const image = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#557799' } }).png().toBuffer()
    const media = await payload.create({ collection: 'media', data: { alt: 'Persistence cover' }, file: { data: image, mimetype: 'image/png', name: 'persistent.png', size: image.length } })
    await payload.create({ collection: 'works', data: { title: 'Persistent work', slug: 'persistent-work', type: 'game', rating: 8.5, status: 'completed', note: 'Personal note', cover: media.id, sources: [{ provider: 'igdb', externalId: '12' }], experiences: [{ status: 'completed', platform: 'PC', note: 'Experience note' }], visibility: 'public' } })
  }
  const work = (await payload.find({ collection: 'works', where: { slug: { equals: 'persistent-work' } }, depth: 1 })).docs[0]
  assert.equal(work.rating, process.argv[2] === 'create' ? 8.5 : 85)
  assert.equal(work.status, 'completed')
  assert.equal(work.note, 'Personal note')
  assert.equal(work.sources?.[0].externalId, '12')
  assert.equal(work.experiences?.[0].note, 'Experience note')
  assert.ok(work.cover && typeof work.cover === 'object')
  const cover = work.cover
  assert.ok((await readFile(path.join(process.env.MEDIA_DIR!, cover.filename!))).length)
  assert.ok((await readFile(path.join(process.env.MEDIA_DIR!, cover.sizes!.card!.filename!))).length)
  assert.ok((await payload.login({ collection: 'users', data: { email: 'owner@example.test', password: 'persistence-test-password' } })).token)
  console.log('PERSISTENCE_RESULT=' + JSON.stringify({ id: work.id, coverId: cover.id }))
} finally { await payload.destroy() }
