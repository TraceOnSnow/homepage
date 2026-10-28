import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload, PayloadRequest } from 'payload'

test('restricted library capability performs SQLite CRUD without exposing Users or Posts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-library-agent-'))
  const token = 'integration-library-token-at-least-32-characters'
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'library-agent-integration-not-production', DISABLE_PAYLOAD_HMR: 'true', LIBRARY_AGENT_TOKEN: token })
  let payload: Payload | undefined
  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    const { libraryAgentEndpoint } = await import('../../src/lib/library-agent')
    payload = await getPayload({ config })
    await payload.db.migrate()
    const owner = await payload.create({ collection: 'users', data: { email: 'owner@example.test', password: 'library-test-password-123' } })
    const post = await payload.create({ collection: 'posts', data: { title: 'Secret article', link: 'secret', locale: 'zh', publishedAt: '2020-01-01T00:00:00Z', markdown: 'Protected source', _status: 'draft' } })
    const original = await payload.create({ collection: 'works', data: { title: 'Preserved', type: 'game', slug: 'preserved', visibility: 'public', rating: 0, status: 'completed', note: 'Authored note', experiences: [{ status: 'completed', startedOn: '2020-01-01T00:00:00Z', note: 'Original experience' }] } })
    async function call(input: unknown, authorization = `Bearer ${token}`) {
      const request = new Request('http://localhost/api/library-agent', { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify(input) })
      const response = await libraryAgentEndpoint.handler(Object.assign(request, { payload }) as unknown as PayloadRequest)
      assert.match(response.headers.get('cache-control') || '', /no-store/)
      return { status: response.status, body: await response.json() }
    }
    assert.equal((await call({ action: 'list' }, '')).status, 401)
    assert.equal((await call({ action: 'list', collection: 'users' })).status, 400)
    assert.equal((await call({ action: 'create', data: { type: 'game', title: 'Bad rating', rating: 101 } })).status, 422)
    assert.equal((await call({ action: 'create', data: { type: 'game', title: 'Bad URL', coverUrl: 'javascript:alert(1)' } })).status, 422)
    assert.equal((await call({ action: 'create', data: { type: 'game', title: 'Bad status', status: 'made-up' } })).status, 422)
    assert.equal((await call({ action: 'metadata-details', type: 'game', q: 'TUNIC', provider: 'unknown', id: '1' })).status, 400)
    const autoSlug = await call({ action: 'create', data: { type: 'game', title: 'Generated slug' } })
    assert.equal(autoSlug.status, 200)
    assert.equal(autoSlug.body.slug, 'generated-slug')
    await payload.update({ collection: 'works', id: autoSlug.body.id, data: { deletedAt: new Date().toISOString() } })
    const created = await call({ action: 'create', data: { type: 'game', title: 'Agent fixture', slug: 'agent-fixture', rating: 90, note: 'User-owned note', article: post.id, sources: [{ provider: 'igdb', externalId: '123' }] } })
    assert.equal(created.status, 200)
    assert.equal(created.body.visibility, 'private')
    assert.equal(created.body.status, null)
    assert.equal(created.body.article, post.id, 'depth zero returns only the relationship ID')
    assert.equal(JSON.stringify(created.body).includes('Protected source'), false)
    const id = created.body.id
    assert.equal((await payload.find({ collection: 'works', overrideAccess: false, user: null, where: { id: { equals: id } } })).totalDocs, 0)
    assert.equal((await call({ action: 'get', id })).body.title, 'Agent fixture')
    const listed = await call({ action: 'list', provider: 'igdb', externalId: '123', limit: 1 })
    assert.equal(listed.body.totalDocs, 1)
    assert.equal(listed.body.docs[0].id, id)
    const mixed = await payload.create({ collection: 'works', data: { title: 'Mixed sources', slug: 'mixed-sources', type: 'game', visibility: 'public', sources: [
      { provider: 'igdb', externalId: '456' }, { provider: 'rawg', externalId: '123' },
    ] } })
    const precise = await call({ action: 'list', provider: 'igdb', externalId: '123' })
    assert.deepEqual(precise.body.docs.map((work: { id: number }) => work.id), [id], 'provider and external ID must match the same source entry')
    await payload.update({ collection: 'works', id: mixed.id, data: { deletedAt: new Date().toISOString() } })
    const mismatch = await call({ action: 'update', id, expectedUpdatedAt: '2000-01-01T00:00:00Z', data: { note: 'Must not overwrite' } })
    assert.equal(mismatch.status, 409)
    assert.equal((await call({ action: 'get', id })).body.note, 'User-owned note')
    const changed = await call({ action: 'update', id, expectedUpdatedAt: created.body.updatedAt, data: { visibility: 'public', title: 'Agent fixture edited' } })
    assert.equal(changed.status, 200)
    assert.equal(changed.body.note, 'User-owned note')
    assert.equal(changed.body.rating, 90)
    assert.equal(changed.body.sources[0].id, created.body.sources[0].id)
    assert.equal((await payload.find({ collection: 'works', overrideAccess: false, user: null, where: { id: { equals: id } } })).totalDocs, 0, 'legacy save stays a draft even when visibility is public')
    assert.equal((await call({ action: 'delete', id, expectedUpdatedAt: '2000-01-01T00:00:00Z' })).status, 409)
    const deleted = await call({ action: 'delete', id, expectedUpdatedAt: changed.body.updatedAt })
    assert.deepEqual(deleted, { status: 200, body: { deleted: true, id } })
    assert.equal((await call({ action: 'get', id })).status, 404)
    assert.deepEqual(await payload.findByID({ collection: 'works', id: original.id, depth: 0 }), original)
    assert.equal((await payload.findByID({ collection: 'users', id: owner.id })).email, owner.email)
    assert.equal((await payload.findByID({ collection: 'posts', id: post.id })).markdown, 'Protected source')
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
