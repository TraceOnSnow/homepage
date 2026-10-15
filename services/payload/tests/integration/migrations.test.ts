import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'

test('committed production migrations bootstrap an empty database and are repeatable', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'trace-migrations-'))
  Object.assign(process.env, {
    NODE_ENV: 'production', DATABASE_URL: `file:${directory}/test.db`, MEDIA_DIR: `${directory}/media`,
    PAYLOAD_SECRET: 'temporary-migration-test-secret-not-production',
  })
  let payload: Payload | undefined
  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config })
    await payload.db.migrate()
    const work = await payload.create({ collection: 'works', data: { title: 'Migration test', slug: '', type: 'game', visibility: 'public' } })
    assert.equal(work.slug, 'migration-test')
    await payload.db.migrate()
    assert.equal((await payload.find({ collection: 'works' })).totalDocs, 1)
  } finally {
    await payload?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
})
