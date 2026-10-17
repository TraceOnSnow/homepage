import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'
import { createContentClient, runCLI } from '../../../../scripts/content-client.mjs'

test('one native API-key identity manages Works and Markdown Posts without administrator privileges', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'homepage-content-client-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-content-integration-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config })
    await payload.db.migrate()
    const owner = await payload.create({ collection: 'users', data: { email: 'owner@example.test', password: 'original-owner-password-123' } })
    const key = 'isolated-content-client-key-at-least-32-characters'
    const identity = await payload.create({ collection: 'content-clients', data: { name: 'Integration client', apiKey: key } })
    const fetcher: typeof fetch = (url, init) => handleEndpoints({ config, request: new Request(url, init) })
    const client = createContentClient({ url: 'http://127.0.0.1:3320', apiKey: key, fetcher })
    const raw = (route: string, method = 'GET', data?: object) => handleEndpoints({ config,
      request: new Request('http://127.0.0.1:3320/api/' + route, { method,
        headers: { Authorization: `content-clients API-Key ${key}`, 'Content-Type': 'application/json' },
        ...(data ? { body: JSON.stringify(data) } : {}) }) })
    for (const [route, method, data] of [
      ['users', 'GET'], ['users', 'POST', { email: 'denied@example.test', password: 'denied-password-123' }],
      [`users/${owner.id}`, 'PATCH', { name: 'Must not change' }],
      ['content-clients', 'GET'], ['content-clients', 'POST', { name: 'Escalation', apiKey: key }],
      [`content-clients/${identity.id}`, 'PATCH', { name: 'Must not change', apiKey: 'replacement-key-at-least-32-characters' }],
      ['media', 'POST', { alt: 'Denied upload' }],
    ] as const) assert.equal((await raw(route, method, data)).status, 403, method + ' ' + route)
    assert.equal((await raw('content/posts')).status, 401)
    assert.equal((await raw('metadata/search?type=invalid&q=test')).status, 400, 'native key authenticates metadata requests')
    assert.equal((await payload.collections['content-clients'].config.access.admin!({ req: { user: { ...identity, collection: 'content-clients' } } as never })).valueOf(), false)
    const json = async (name: string, data: object) => { const file = path.join(directory, name); await writeFile(file, JSON.stringify(data)); return file }
    const workFile = await json('work.json', { title: 'API work', type: 'game', slug: 'api-work', rating: 0, note: 'Preserve my reaction' })
    assert.equal((await runCLI(['works', 'create', workFile], client)).dryRun, true)
    assert.equal((await payload.find({ collection: 'works' })).totalDocs, 0)
    const work = await runCLI(['works', 'create', workFile, '--apply'], client)
    assert.equal(work.visibility, 'private')
    assert.equal(work.status, 'completed')
    await assert.rejects(runCLI(['works', 'create', workFile, '--apply'], client), /already exists/)
    const markdown = '\r\n## 原始 Markdown\r\n\r\n++保留语法++\r\n'
    const bodyFile = path.join(directory, 'article.md'); await writeFile(bodyFile, markdown)
    const postFile = await json('post.json', { title: 'API article', link: 'note/api-article', publishedAt: '2020-01-02T00:00:00Z' })
    const post = await runCLI(['posts', 'create', postFile, '--markdown', bodyFile, '--apply'], client)
    assert.equal(post.markdown, markdown)
    assert.equal(post._status, 'draft')
    const anonymous = (id: number) => handleEndpoints({ config, request: new Request(`http://127.0.0.1:3320/api/posts/${id}`) })
    assert.equal((await anonymous(post.id)).status, 404)
    const published = await runCLI(['posts', 'publish', String(post.id), '--apply'], client)
    assert.equal(published._status, 'published')
    assert.equal((await anonymous(post.id)).status, 200)
    const patch = await json('post-patch.json', { title: 'Edited draft', markdown: markdown + 'DRAFT ONLY' })
    const draft = await runCLI(['posts', 'update', String(post.id), patch, '--apply'], client)
    assert.equal(draft._status, 'draft')
    assert.equal((await (await anonymous(post.id)).json()).markdown, markdown, 'draft edit does not replace published body')
    await assert.rejects(runCLI(['posts', 'publish', String(post.id), '--expected-updated-at', '2000-01-01T00:00:00Z', '--apply'], client), /changed/)
    const next = await runCLI(['posts', 'publish', String(post.id), '--apply'], client)
    assert.equal(next.markdown, markdown + 'DRAFT ONLY', 'publishing includes the latest draft content')
    const linked = await runCLI(['works', 'link', String(work.id), String(post.id), '--apply'], client)
    assert.equal(linked.article, post.id)
    assert.equal(linked.note, work.note)
    assert.equal(linked.rating, 0)
    await runCLI(['posts', 'unpublish', String(post.id), '--apply'], client)
    assert.equal((await anonymous(post.id)).status, 404)
    await runCLI(['posts', 'delete', String(post.id), '--apply'], client)
    assert.equal((await payload.findByID({ collection: 'works', id: work.id, depth: 0 })).article, null)
    await runCLI(['works', 'delete', String(work.id), '--apply'], client)
    assert.equal((await payload.find({ collection: 'works' })).totalDocs, 0)
    assert.ok((await payload.login({ collection: 'users', data: { email: owner.email, password: 'original-owner-password-123' } })).token)
    assert.equal((await payload.findByID({ collection: 'users', id: owner.id })).name, owner.name)
    await payload.update({ collection: 'content-clients', id: identity.id, data: { apiKey: null } })
    await assert.rejects(client('POST', 'works', { data: { title: 'Revoked', type: 'game' } }), /403/)
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
