import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'

test('SQLite Works/Media CRUD, admin authentication, and anonymous access', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'payload-cms-test-'))
  Object.assign(process.env, { DISABLE_PAYLOAD_HMR: 'true', NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'integration-test-secret-not-for-production' })
  let payload: Payload | undefined
  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config })
    await payload.db.migrate()
    assert.ok('posts' in payload.collections)
    assert.ok(!('projects' in payload.collections))
    const owner = await payload.create({ collection: 'users', data: { email: 'owner@example.test', password: 'test-password-123' } })
    const user = { ...owner, collection: 'users' as const }
    const anonymous = { overrideAccess: false, user: null } as const
    const { default: sharp } = await import('sharp')
    const image = await sharp({ create: { width: 800, height: 1000, channels: 3, background: '#557799' } }).png().toBuffer()
    const media = await payload.create({ collection: 'media', user, overrideAccess: false, data: { alt: 'Test cover' }, file: { data: image, mimetype: 'image/png', name: 'cover.png', size: image.length } })
    assert.ok(media.url)
    assert.ok(media.sizes?.card?.url)
    assert.equal((await payload.find({ collection: 'media', ...anonymous })).totalDocs, 1)
    const work = await payload.create({ collection: 'works', user, overrideAccess: false, data: { title: 'TUNIC', slug: '', type: 'game', rating: 9.5, cover: media.id, visibility: 'public', _status: 'published', sources: [{ provider: 'igdb', externalId: '12' }], experiences: [{ status: 'completed', note: 'Completed once' }] } })
    assert.equal(work.slug, 'tunic')
    assert.equal((await payload.find({ collection: 'works', ...anonymous, depth: 1 })).docs[0].rating, 9.5)
    await payload.update({ collection: 'works', id: work.id, user, data: { visibility: 'private' } })
    assert.equal((await payload.find({ collection: 'works', ...anonymous })).totalDocs, 0)
    await assert.rejects(payload.findByID({ collection: 'works', id: work.id, ...anonymous }))
    await assert.rejects(payload.create({ collection: 'works', ...anonymous, data: { title: 'Unauthorized', slug: 'unauthorized', type: 'game', visibility: 'public', _status: 'published' } }))
    await assert.rejects(payload.update({ collection: 'works', id: work.id, ...anonymous, data: { rating: 1 } }))
    await assert.rejects(payload.delete({ collection: 'works', id: work.id, ...anonymous }))
    await assert.rejects(payload.create({ collection: 'media', ...anonymous, data: { alt: 'Unauthorized' } }))
    await assert.rejects(payload.create({ collection: 'users', ...anonymous, data: { email: 'intruder@example.test', password: 'password-123' } }))
    await assert.rejects(payload.find({ collection: 'users', ...anonymous }))
    assert.ok((await payload.login({ collection: 'users', data: { email: 'owner@example.test', password: 'test-password-123' } })).token)
    await assert.rejects(payload.create({ collection: 'works', user, data: { title: 'Bad rating', slug: 'bad-rating', type: 'game', visibility: 'public', _status: 'published', rating: 11 } }))
    await assert.rejects(payload.create({ collection: 'works', user, data: { title: 'Bad URL', slug: 'bad-url', type: 'game', visibility: 'public', _status: 'published', coverUrl: 'javascript:alert(1)' } }))
  } finally {
    await payload?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
})
