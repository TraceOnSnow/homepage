import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'
import type { SQLiteAdapter } from '@payloadcms/db-sqlite'
import { workPatch, workValues, type TableWork } from '../../src/lib/works-table'

test('existing migrations support precise and partial experience dates through native APIs without schema changes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-works-table-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-works-table-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config }); await payload.db.migrate()
    const db = payload.db as unknown as SQLiteAdapter
    const { generateDrizzleJson, generateMigration } = db.requireDrizzleKit()
    const previous = JSON.parse(await readFile(new URL('../../src/migrations/20261017_171808_content_clients.json', import.meta.url), 'utf8'))
    assert.deepEqual(await generateMigration(previous, await generateDrizzleJson(db.schema)), [], 'application defaults must not require rewriting the production tables')
    const key = 'isolated-works-table-native-api-key-at-least-32'
    await payload.create({ collection: 'content-clients', data: { name: 'Test client', apiKey: key } })
    const request = (route: string, method = 'GET', data?: unknown) => handleEndpoints({ config, request: new Request(`http://127.0.0.1:3321/api/${route}`, {
      method, headers: { Authorization: `content-clients API-Key ${key}`, 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }) })
    const created = await request('works?depth=0', 'POST', { title: 'Historic work', type: 'movie', visibility: 'private', rating: 0, note: 'Keep this',
      experiences: [{ id: 'old-experience', startedOn: '2020-01-01T00:00:00.000Z', endedOn: '2020-01-02T00:00:00.000Z', progress: 'Old progress', note: 'Old note' }] })
    assert.equal(created.status, 201)
    const work = (await created.json()).doc as TableWork
    assert.equal(work.status, 'completed')
    assert.equal(work.experiences![0].endedOn, '2020-01-02T00:00:00.000Z')
    const patch = workPatch(work, { ...workValues(work), endedOn: '2021-05' })
    const params = new URLSearchParams({ depth: '0', 'where[and][0][id][equals]': String(work.id), 'where[and][1][updatedAt][equals]': work.updatedAt })
    const updated = await request(`works?${params}`, 'PATCH', patch)
    assert.equal(updated.status, 200)
    const saved = (await updated.json()).docs[0] as TableWork
    assert.equal(saved.experiences![0].endedOn, '2021-05')
    assert.equal(saved.experiences![0].startedOn, work.experiences![0].startedOn)
    assert.equal(saved.experiences![0].id, 'old-experience')
    assert.equal(saved.experiences![0].note, 'Old note')
    assert.equal(saved.experiences![0].progress, 'Old progress')
    assert.equal(saved.rating, 0); assert.equal(saved.note, 'Keep this')
    const conflicted = await request(`works?${params}`, 'PATCH', { rating: 10 })
    assert.equal((await conflicted.json()).docs.length, 0, 'stale timestamp cannot match the changed record')
    assert.equal((await request(`works/${work.id}`, 'PATCH', { experiences: [{ endedOn: '2021-02-29' }] })).status, 400)
    const year = await request(`works/${work.id}?depth=0`, 'PATCH', { experiences: [{ ...saved.experiences![0], endedOn: '2020' }] })
    assert.equal((await year.json()).doc.experiences[0].endedOn, '2020')
    const cleared = await request(`works/${work.id}?depth=0`, 'PATCH', { experiences: [{ ...saved.experiences![0], endedOn: null }] })
    assert.equal((await cleared.json()).doc.experiences[0].endedOn, null)
    assert.equal((await payload.find({ collection: 'works' })).totalDocs, 1)
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
