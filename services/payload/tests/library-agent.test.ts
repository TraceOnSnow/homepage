import assert from 'node:assert/strict'
import test from 'node:test'
import type { PayloadRequest } from 'payload'
import { libraryAgentEndpoint } from '../src/lib/library-agent'
import { metadataService } from '../src/lib/metadata/endpoint'

const token = 'test-library-capability-token-at-least-32-characters'
process.env.LIBRARY_AGENT_TOKEN = token
async function call(input: unknown, payload: unknown = {}, authorization: string | null = `Bearer ${token}`, extraHeaders: Record<string, string> = {}) {
  const request = new Request('http://localhost/api/library-agent', { method: 'POST', headers: {
    'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}), ...extraHeaders,
  }, body: typeof input === 'string' ? input : JSON.stringify(input) })
  const response = await libraryAgentEndpoint.handler(Object.assign(request, { payload, user: { id: 1, collection: 'users' } }) as unknown as PayloadRequest)
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  return { status: response.status, body: await response.json() }
}

test('dedicated capability required, even for an authenticated administrator', async () => {
  for (const authorization of [null, 'Bearer wrong', `JWT ${token}`, `Bearer ${token}x`]) {
    assert.equal((await call({ action: 'list' }, {}, authorization)).status, 401)
  }
  delete process.env.LIBRARY_AGENT_TOKEN
  assert.equal((await call({ action: 'list' })).status, 401)
  process.env.LIBRARY_AGENT_TOKEN = 'short'
  assert.equal((await call({ action: 'list' }, {}, 'Bearer short')).status, 401)
  process.env.LIBRARY_AGENT_TOKEN = token
})

test('rejects malformed, oversized, unknown and privileged request fields before calling Payload', async () => {
  for (const input of ['{', null, [], { action: 'sql' }, { action: 'list', collection: 'users' },
    { action: 'list', overrideAccess: true }, { action: 'delete', id: [1, 2] },
    { action: 'create', data: { type: 'game', title: 'Test', createdAt: '2020-01-01' } },
    { action: 'create', data: { type: 'game', title: 'Test', sources: [{ provider: 'igdb', externalId: '1', password: 'bad' }] } },
    { action: 'update', id: 1, expectedUpdatedAt: '2026-01-01T00:00:00Z', data: {} },
  ]) assert.equal((await call(input)).status, 400)
  assert.equal((await call(' '.repeat(262145))).status, 413)
  assert.equal((await call({ action: 'list' }, {}, undefined, { 'Content-Length': '262145' })).status, 413)
})

test('lists only Works with bounded pagination and explicit filters', async () => {
  let options: Record<string, unknown> | undefined
  const result = await call({ action: 'list', page: 2, limit: 10, q: 'Work', slug: 'work', provider: 'igdb', externalId: '1' }, {
    find: async (input: Record<string, unknown>) => { options = input; return { docs: [], totalDocs: 0, page: 2, hasNextPage: false } },
  })
  assert.equal(result.status, 200)
  assert.deepEqual(options, { collection: 'works', overrideAccess: true, depth: 0, sort: 'id', page: 2, limit: 10, where: { and: [
    { title: { contains: 'Work' } }, { slug: { equals: 'work' } }, { 'sources.provider': { equals: 'igdb' } }, { 'sources.externalId': { equals: '1' } },
  ] } })
  for (const input of [{ limit: 101 }, { page: 0 }, { page: '1' }, { provider: 'igdb' }, { externalId: '1' }]) {
    assert.equal((await call({ action: 'list', ...input })).status, 400)
  }
})

test('create defaults private and unknown status, preserving explicit personal fields', async () => {
  const created: Record<string, unknown>[] = []
  const payload = { create: async (input: Record<string, unknown>) => { created.push(input); return input.data } }
  assert.deepEqual((await call({ action: 'create', data: { title: 'Work', type: 'game', rating: 0, note: 'User note' } }, payload)).body,
    { title: 'Work', slug: '', type: 'game', rating: 0, note: 'User note', visibility: 'private', status: null })
  const explicit = { title: 'Public', type: 'anime', status: 'completed', visibility: 'public', experiences: [{ id: 'existing', status: 'completed', note: 'Original date: 2025' }] }
  assert.deepEqual((await call({ action: 'create', data: explicit }, payload)).body, { ...explicit, slug: '' })
  assert.equal(created[0].collection, 'works')
  assert.equal(created[0].depth, 0)
})

test('update and delete require a single ID and version, then constrain their Where', async () => {
  const requests: Record<string, unknown>[] = []
  const payload = {
    update: async (input: Record<string, unknown>) => { requests.push(input); return { docs: [{ id: 2, note: 'Changed' }], errors: [] } },
    delete: async (input: Record<string, unknown>) => { requests.push(input); return { docs: [{ id: 2 }], errors: [] } },
  }
  const version = '2026-01-01T00:00:00.000Z'
  assert.equal((await call({ action: 'update', id: 2, data: { note: 'Changed' } }, payload)).status, 400)
  assert.equal((await call({ action: 'delete', id: 2 }, payload)).status, 400)
  assert.equal((await call({ action: 'update', id: 2, expectedUpdatedAt: version, data: { note: 'Changed' } }, payload)).body.note, 'Changed')
  assert.deepEqual((await call({ action: 'delete', id: '2', expectedUpdatedAt: version }, payload)).body, { deleted: true, id: 2 })
  for (const request of requests) assert.deepEqual(request.where, { and: [{ id: { equals: 2 } }, { updatedAt: { equals: version } }] })
  assert.equal((await call({ action: 'delete', id: 2, expectedUpdatedAt: version }, { delete: async () => ({ docs: [], errors: [] }) })).status, 409)
  assert.equal((await call({ action: 'update', id: 2, expectedUpdatedAt: version, data: { rating: 20 } }, { update: async () => ({ docs: [], errors: [{ message: 'private internal error' }] }) })).status, 422)
})

test('metadata requests share existing service and reject client URLs', async () => {
  const search = metadataService.search
  const resolve = metadataService.resolve
  const seen: unknown[][] = []
  metadataService.search = async (...args) => { seen.push(args); return { candidates: [], providers: [] } }
  metadataService.resolve = async (...args) => { seen.push(args); throw new Error('Private provider credentials') }
  try {
    assert.equal((await call({ action: 'metadata-search', type: 'game', q: ' TUNIC ' })).status, 200)
    assert.deepEqual(seen, [['game', 'TUNIC']])
    assert.equal((await call({ action: 'metadata-details', type: 'game', q: 'TUNIC', provider: 'igdb', id: '1', url: 'http://secret/' })).status, 400)
    const failed = await call({ action: 'metadata-details', type: 'game', q: 'TUNIC', provider: 'igdb', id: '1' })
    assert.equal(failed.status, 500)
    assert.equal(JSON.stringify(failed.body).includes('credentials'), false)
    metadataService.resolve = async () => { throw new Error('Candidate not found') }
    assert.deepEqual(await call({ action: 'metadata-details', type: 'game', q: 'TUNIC', provider: 'igdb', id: 'arbitrary' }),
      { status: 400, body: { error: 'Invalid metadata candidate' } })
  } finally { metadataService.search = search; metadataService.resolve = resolve }
})

test('concurrent Agent edits are serialized and the second stale mutation conflicts', async () => {
  let version = '2026-01-01T00:00:00.000Z'
  let active = 0
  let maximum = 0
  const payload = { update: async (input: { where: { and: { updatedAt?: { equals: string } }[] } }) => {
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    const matches = input.where.and[1].updatedAt?.equals === version
    if (matches) version = '2026-01-01T00:00:01.000Z'
    active -= 1
    return { docs: matches ? [{ id: 1, updatedAt: version }] : [], errors: [] }
  } }
  const input = { action: 'update', id: 1, expectedUpdatedAt: version, data: { note: 'Change' } }
  const results = await Promise.all([call(input, payload), call(input, payload)])
  assert.deepEqual(results.map(result => result.status), [200, 409])
  assert.equal(maximum, 1)
})

test('missing records and field validation have safe error responses', async () => {
  const missing = await call({ action: 'get', id: 999 }, { findByID: async () => { throw Object.assign(new Error('SELECT secret'), { status: 404 }) } })
  assert.deepEqual(missing, { status: 404, body: { error: 'Work not found' } })
  const invalid = await call({ action: 'create', data: { title: 'Work', type: 'game', rating: 11 } }, { create: async () => { throw Object.assign(new Error('private validation dump'), { status: 400 }) } })
  assert.deepEqual(invalid, { status: 422, body: { error: 'Work validation failed' } })
})
