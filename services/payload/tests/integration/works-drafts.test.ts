import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'
import { createContentClient, runCLI } from '../../../../scripts/content-client.mjs'

test('Works and Posts save successive private drafts, publish the selected version, and withdraw without losing edits', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-work-drafts-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-work-draft-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config }); await payload.db.migrate()
    await payload.create({ collection: 'users', data: { email: 'drafts@example.test', password: 'isolated-password-123' } })
    const key = 'isolated-drafts-client-at-least-32-characters'
    await payload.create({ collection: 'content-clients', data: { name: 'Drafts fixture', apiKey: key } })
    const fetcher: typeof fetch = (url, init) => handleEndpoints({ config, request: new Request(url, init) })
    const client = createContentClient({ url: 'http://127.0.0.1:3322', apiKey: key, fetcher })
    const anonymous = (route: string) => handleEndpoints({ config, request: new Request(`http://127.0.0.1:3322/api/${route}`) })
    const json = async (name: string, data: object) => { const filename = path.join(directory, name + '.json'); await writeFile(filename, JSON.stringify(data)); return filename }
    for (const resource of ['works', 'posts'] as const) {
      const field = resource === 'works' ? 'note' : 'markdown'
      const file = await json(resource, { title: `Original ${resource}`, [field]: 'PUBLIC ORIGINAL', ...(resource === 'works' ? { type: 'game', slug: 'draft-test-work', visibility: 'public', rating: 0, experiences: [{ id: 'stable-experience', endedOn: '2020' }] } : { link: 'draft-test-post' }) })
      const created = await runCLI([resource, 'create', file, '--apply'], client)
      assert.equal(created._status, 'draft')
      assert.equal((await anonymous(`${resource}/${created.id}`)).status, 404)
      const published = await runCLI([resource, 'publish', String(created.id), '--apply'], client)
      assert.equal(published._status, 'published')
      assert.equal((await (await anonymous(`${resource}/${created.id}`)).json())[field], 'PUBLIC ORIGINAL')
      const patch = await json(resource + '-patch', { title: `Draft ${resource}`, [field]: 'DRAFT ONE' })
      await runCLI([resource, 'update', String(created.id), patch, '--apply'], client)
      // First save differs from base. A second valid save must match the latest version timestamp.
      await writeFile(patch, JSON.stringify({ [field]: 'DRAFT TWO' }))
      const second = await runCLI([resource, 'update', String(created.id), patch, '--apply'], client)
      assert.equal(second[field], 'DRAFT TWO')
      assert.equal((await runCLI([resource, 'get', String(created.id)], client))[field], 'DRAFT TWO')
      assert.equal((await (await anonymous(`${resource}/${created.id}?depth=1`)).json())[field], 'PUBLIC ORIGINAL')
      for (const route of [`${resource}/${created.id}?draft=true`, `${resource}?draft=true&depth=2`]) {
        const response = await anonymous(route)
        const body = await response.text()
        assert.ok(!body.includes('DRAFT ONE') && !body.includes('DRAFT TWO'), route + ' must not expose draft values')
      }
      assert.equal((await anonymous(`${resource}/versions`)).status, 403)
      await assert.rejects(payload.findVersions({ collection: resource, overrideAccess: false, user: null }))
      const next = await runCLI([resource, 'publish', String(created.id), '--apply'], client)
      assert.equal(next[field], 'DRAFT TWO')
      assert.equal((await (await anonymous(`${resource}/${created.id}`)).json())[field], 'DRAFT TWO')
      await writeFile(patch, JSON.stringify({ [field]: 'NEWEST UNPUBLISHED' }))
      await runCLI([resource, 'update', String(created.id), patch, '--apply'], client)
      await runCLI([resource, 'unpublish', String(created.id), '--apply'], client)
      assert.equal((await anonymous(`${resource}/${created.id}`)).status, 404)
      const retained = await runCLI([resource, 'get', String(created.id)], client)
      assert.equal(retained[field], 'NEWEST UNPUBLISHED', 'withdrawing must retain latest draft content')
      if (resource === 'works') assert.equal(retained.experiences[0].id, 'stable-experience')
      const versions = await payload.findVersions({ collection: resource, limit: 100 })
      assert.ok(versions.totalDocs >= 6)
    }
    const privateWork = (await client('POST', 'works', { data: { title: 'Default private', slug: 'default-private', type: 'book', _status: 'published' } })).doc
    assert.equal(privateWork.visibility, 'private')
    assert.equal((await anonymous(`works/${privateWork.id}`)).status, 404)
    // A public Work relationship must resolve the published Post, never its latest private edit.
    const article = await payload.create({ collection: 'posts', data: { title: 'Public article', link: 'relation-post', locale: 'zh', publishedAt: '2020-01-01T00:00:00Z', markdown: 'PUBLISHED RELATION', _status: 'published' } })
    const work = await payload.create({ collection: 'works', data: { title: 'Public relation', slug: 'public-relation', type: 'book', visibility: 'public', _status: 'published', article: article.id } })
    await payload.update({ collection: 'posts', id: article.id, draft: true, data: { markdown: 'PRIVATE RELATION DRAFT', _status: 'draft' } })
    const body = await (await anonymous(`works/${work.id}?depth=2&draft=false`)).text()
    assert.ok(body.includes('PUBLISHED RELATION'))
    assert.ok(!body.includes('PRIVATE RELATION DRAFT'))
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
