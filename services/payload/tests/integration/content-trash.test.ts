import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'

test('native Trash retains IDs, private edits and history; restore remains draft; hard deletion is refused', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-content-trash-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-content-trash-secret', CONTENT_BUILD_TOKEN: 'isolated-build-token-at-least-32-characters', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config }); await payload.db.migrate()
    const user = await payload.create({ collection: 'users', data: { email: 'trash@example.test', password: 'isolated-password-123' } })
    const key = 'isolated-trash-client-at-least-32-characters'
    await payload.create({ collection: 'content-clients', data: { name: 'Trash fixture', apiKey: key } })
    const request = async (route: string, method = 'GET', data?: object, authenticated = true) => handleEndpoints({ config, request: new Request(`http://127.0.0.1:3322/api/${route}`, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `content-clients API-Key ${key}` } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }) })
    for (const collection of ['works', 'posts'] as const) {
      const field = collection === 'works' ? 'note' : 'markdown'
      const item: { id: number } = collection === 'works'
        ? await payload.create({ collection: 'works', data: { title: collection, note: 'PUBLIC', _status: 'published', slug: 'trash-work', type: 'book', visibility: 'public' } })
        : await payload.create({ collection: 'posts', data: { title: collection, markdown: 'PUBLIC', _status: 'published', link: 'trash-post', locale: 'zh', publishedAt: '2020-01-01T00:00:00Z' } })
      await payload.update({ collection, id: item.id, draft: true, data: { [field]: 'LATEST PRIVATE', _status: 'draft' } })
      const versionsBefore = (await payload.findVersions({ collection, limit: 100 })).totalDocs
      const beforeTrash = await payload.findByID({ collection, id: item.id, draft: true, depth: 0 })
      const trashQuery = new URLSearchParams({ 'where[and][0][id][equals]': String(item.id), 'where[and][1][updatedAt][equals]': beforeTrash.updatedAt, draft: 'false', depth: '0' })
      const trashedResponse = await request(`${collection}?${trashQuery}`, 'PATCH', { deletedAt: new Date().toISOString() })
      assert.equal(trashedResponse.status, 200, await trashedResponse.clone().text())
      assert.equal((await request(`${collection}/${item.id}`, 'GET', undefined, false)).status, 404)
      const publicList = await (await request(`${collection}?draft=false&depth=0`, 'GET', undefined, false)).json()
      assert.ok(!publicList.docs.some((doc: { id: number }) => doc.id === item.id))
      if (collection === 'posts') {
        const built = await handleEndpoints({ config, request: new Request('http://127.0.0.1:3322/api/content/posts', { headers: { Authorization: `Bearer ${process.env.CONTENT_BUILD_TOKEN}` } }) })
        assert.equal(built.status, 200)
        assert.ok(!(await built.json()).docs.some((doc: { id: number }) => doc.id === item.id))
      }
      assert.equal((await request(`${collection}/${item.id}?draft=true`)).status, 404)
      const trash = await (await request(`${collection}/${item.id}?trash=true&draft=true&depth=0`)).json()
      assert.equal(trash.id, item.id)
      assert.equal(trash[field], 'LATEST PRIVATE')
      assert.ok(trash.deletedAt)
      assert.ok((await payload.findVersions({ collection, limit: 100 })).totalDocs >= versionsBefore)
      const list = await (await request(`${collection}?trash=true&draft=true&depth=0`)).json()
      assert.ok(list.docs.some((doc: { id: number }) => doc.id === item.id))
      const restoredResponse = await request(`${collection}/${item.id}?trash=true&depth=0`, 'PATCH', { deletedAt: null })
      assert.equal(restoredResponse.status, 200, await restoredResponse.clone().text())
      const restored = await (await request(`${collection}/${item.id}?draft=true&depth=0`)).json()
      assert.equal(restored.id, item.id)
      assert.equal(restored[field], 'LATEST PRIVATE')
      assert.equal(restored._status, 'draft')
      if (collection === 'works') assert.equal(restored.visibility, 'private')
      assert.equal((await request(`${collection}/${item.id}`, 'GET', undefined, false)).status, 404)
      const permanent = await request(`${collection}/${item.id}`, 'DELETE')
      assert.ok(permanent.status >= 400)
      await assert.rejects(payload.delete({ collection, id: item.id, user }))
      assert.equal((await request(`${collection}/${item.id}?draft=true`)).status, 200)
    }
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
