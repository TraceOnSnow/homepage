import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'

test('native Media upload and cover-pool REST preserve schema and enforce administrator/CSRF boundaries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-cover-pool-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`,
    SERVER_URL: 'https://covers.example', PAYLOAD_SECRET: 'cover-pool-isolated-test-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    const { coverPoolEndpoints } = await import('../../src/lib/cover-pool-endpoint')
    const configured = await config
    for (const endpoint of coverPoolEndpoints) if (!configured.endpoints.some(item => item.path === endpoint.path && item.method === endpoint.method)) configured.endpoints.push(endpoint)
    payload = await getPayload({ config: configured }); await payload.db.migrate()
    const owner = await payload.create({ collection: 'users', data: { email: 'covers@example.test', password: 'cover-pool-password-123' } })
    const key = 'cover-pool-content-client-test-key-long-enough'
    await payload.create({ collection: 'content-clients', data: { name: 'Cannot manage covers', apiKey: key } })
    const call = (method = 'GET', data?: unknown, authorization?: string, origin?: string) => handleEndpoints({ config: configured,
      request: new Request('https://covers.example/api/site-covers', { method, headers: {
        'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}), ...(origin ? { Origin: origin } : {}),
      }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }) })
    const initialResponse = await call(); assert.equal(initialResponse.status, 200)
    const initial = await initialResponse.json(); assert.equal(initial.covers.length, 21)
    const login = await payload.login({ collection: 'users', data: { email: owner.email, password: 'cover-pool-password-123' } })
    const authorization = `JWT ${login.token}`
    const patch = { revision: initial.revision, includeBuiltIn: true, mediaIds: [] }
    assert.equal((await call('PATCH', patch)).status, 403)
    assert.equal((await call('PATCH', patch, `content-clients API-Key ${key}`)).status, 403)
    assert.equal((await call('PATCH', patch, authorization, 'https://untrusted.example')).status, 403)
    const sharp = (await import('sharp')).default
    const buffer = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#5588bb' } }).png().toBuffer()
    const media = await payload.create({ collection: 'media', data: { alt: 'Native selected cover' },
      file: { data: buffer, mimetype: 'image/png', name: 'selected-cover.png', size: buffer.length } })
    await payload.create({ collection: 'media', data: { alt: 'Unselected media must stay absent' },
      file: { data: buffer, mimetype: 'image/png', name: 'not-selected.png', size: buffer.length } })
    const savedResponse = await call('PATCH', { ...patch, includeBuiltIn: false, mediaIds: [media.id] }, authorization, 'https://covers.example')
    assert.equal(savedResponse.status, 200, await savedResponse.clone().text())
    const saved = await savedResponse.json()
    assert.deepEqual(saved.covers, [`https://covers.example/api/media/file/${media.filename}`]); assert.equal(saved.images[0].updatedAt, media.updatedAt)
    assert.ok(!JSON.stringify(saved).includes('not-selected')); assert.ok(!JSON.stringify(saved).includes(directory)); assert.ok(!JSON.stringify(saved).includes('filename'))
    assert.equal((await stat(path.join(directory, 'media/.cover-pool.json'))).mode & 0o777, 0o600)
    const privateFile = await handleEndpoints({ config: configured, request: new Request('https://covers.example/api/media/file/.cover-pool.json') })
    assert.ok([403, 404].includes(privateFile.status), 'private cover settings cannot be served by the native Media file route')
    assert.equal((await call('PATCH', patch, authorization)).status, 409)
    assert.equal((await call('PATCH', { revision: saved.revision, includeBuiltIn: false, mediaIds: [] }, authorization)).status, 400)
    assert.equal((await call('PATCH', { revision: saved.revision, includeBuiltIn: false, mediaIds: [99999] }, authorization)).status, 400)
    const before = await readFile(path.join(directory, 'media/.cover-pool.json'), 'utf8')
    await payload.delete({ collection: 'media', id: media.id })
    const missing = await (await call()).json()
    assert.deepEqual(missing.mediaIds, [media.id]); assert.deepEqual(missing.images, [])
    assert.equal(await readFile(path.join(directory, 'media/.cover-pool.json'), 'utf8'), before)
    const restoredResponse = await call('PATCH', { revision: saved.revision, includeBuiltIn: true, mediaIds: [] }, authorization)
    assert.equal(restoredResponse.status, 200); assert.equal((await restoredResponse.json()).covers.length, 21)
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
