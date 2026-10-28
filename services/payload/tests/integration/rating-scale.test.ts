import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'
import type { SQLiteAdapter, MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

test('hundred-point migration preserves each base/draft/history value, rolls back failures, and never repeats', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-rating-scale-'))
  const database = path.join(directory, 'payload.db')
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${database}`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-rating-test-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  const python = (code: string) => JSON.parse(execFileSync('python3', ['-c', code, database], { encoding: 'utf8' }))
  const snapshot = `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1]);out={}
for (name,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'payload_migrations' ORDER BY name"):
 cols=[r[1] for r in c.execute('PRAGMA table_info("'+name+'")') if r[1] not in ('rating','version_rating')]
 out[name]=sorted(c.execute('SELECT '+','.join('"'+v+'"' for v in cols)+' FROM "'+name+'"').fetchall(),key=repr)
print(json.dumps(out,ensure_ascii=False,sort_keys=True))`
  const ratings = () => python(`import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1]);print(json.dumps([c.execute('SELECT id,rating FROM works ORDER BY id').fetchall(),c.execute('SELECT id,version_rating FROM _works_v ORDER BY id').fetchall()]))`) as [Array<[number, number | null]>, Array<[number, number | null]>]
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    const { migrations } = await import('../../src/migrations')
    const migration = migrations.at(-1)!
    const { ratingScaleMarker } = await import('../../src/migrations/20261028_120000_rating_scale_100')
    payload = await getPayload({ config })
    await payload.db.migrate({ migrations: migrations.slice(0, -1).map(m => ({ name: m.name, up: args => m.up(args as MigrateUpArgs), down: args => m.down(args as MigrateDownArgs) })) })
    const pub = await payload.create({ collection: 'works', data: { title: 'Different versions', type: 'game', slug: 'different-versions', visibility: 'public', _status: 'published', rating: 8.5, note: 'Published reaction', experiences: [{ id: 'stable-experience', endedOn: '2020-05' }] } })
    await payload.update({ collection: 'works', id: pub.id, draft: true, data: { rating: 8.37, note: 'Private latest reaction', _status: 'draft' } })
    for (const [slug, rating] of [['zero', 0], ['unrated', null], ['fine', 8.375], ['tiny', 1e-7], ['max', 10]] as const) {
      await payload.create({ collection: 'works', data: { title: slug, type: 'book', slug, rating, visibility: 'private', _status: 'draft' } })
    }
    const before = python(snapshot)
    const oldRatings = ratings()
    const adapter = payload.db as unknown as SQLiteAdapter
    const drizzle = adapter.drizzle
    let injected = false
    const broken = new Proxy(drizzle, { get(target, key) {
      if (key === 'transaction') return (fn: (transaction: unknown) => Promise<void>) => target.transaction(async transaction => {
        return fn(new Proxy(transaction, { get(inner, property) {
          if (property === 'run') return async (statement: Parameters<typeof inner.run>[0]) => {
            const result = await inner.run(statement)
            if (JSON.stringify(statement).includes('UPDATE works SET rating')) { injected = true; throw new Error('Injected rating interruption') }
            return result
          }
          const value = Reflect.get(inner, property)
          return typeof value === 'function' ? value.bind(inner) : value
        } }))
      })
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    await assert.rejects(migration.up({ db: broken } as MigrateUpArgs), /Injected rating interruption/)
    assert.equal(injected, true)
    assert.deepEqual(ratings(), oldRatings)
    assert.deepEqual(python(snapshot), before)
    // Reject an unmarked mixed scale before changing a single other rating.
    python(`import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE works SET rating=85 WHERE slug='zero'");c.commit();print('null')`)
    const mixed = ratings()
    await assert.rejects(migration.up({ db: drizzle } as MigrateUpArgs), /unconverted 0–10/)
    assert.deepEqual(ratings(), mixed)
    python(`import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);c.execute("UPDATE works SET rating=0 WHERE slug='zero'");c.commit();print('null')`)
    await migration.up({ db: drizzle } as MigrateUpArgs)
    const expected = oldRatings.map(rows => rows.map(([id, value]) => [id, value === null ? null : Number(`${String(value).split('e')[0]}e${Number(String(value).split('e')[1] || 0) + 1}`)]))
    assert.deepEqual(ratings(), expected)
    assert.deepEqual(python(snapshot), before, 'all other columns, tables, IDs, timestamps, status and relationships are untouched')
    // Simulate successful data commit followed by interrupted Payload bookkeeping.
    await payload.db.migrate()
    assert.deepEqual(ratings(), expected)
    await migration.up({ db: drizzle } as MigrateUpArgs)
    await payload.db.migrate()
    assert.deepEqual(ratings(), expected)
    assert.deepEqual(python(snapshot), before)
    assert.equal((await payload.findByID({ collection: 'works', id: pub.id, draft: false })).rating, 85)
    assert.equal((await payload.findByID({ collection: 'works', id: pub.id, draft: true })).rating, 83.7)
    const versions = await payload.findVersions({ collection: 'works', where: { parent: { equals: pub.id } }, limit: 100 })
    assert.ok(versions.docs.some(v => v.version.rating === 85))
    assert.ok(versions.docs.some(v => v.version.rating === 83.7))
    const user = await payload.create({ collection: 'users', data: { email: 'rating@example.test', password: 'synthetic-rating-password' } })
    const key = 'synthetic-rating-client-key-at-least-32-chars'
    await payload.create({ collection: 'content-clients', data: { name: 'Rating fixture', apiKey: key } })
    const request = (rating: unknown) => handleEndpoints({ config, request: new Request('http://127.0.0.1:3399/api/works?draft=true', { method: 'POST', headers: { Authorization: `content-clients API-Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `Rating ${rating}`, type: 'game', slug: `rating-${rating}`, rating, _status: 'draft', visibility: 'private' }) }) })
    for (const value of [0, 85, 100, 83.75, 8.5, null]) {
      const response = await request(value)
      assert.equal(response.status, 201)
      const doc = (await response.json()).doc
      assert.equal(doc.rating, value, 'new API uses the explicit hundred-point value, never magnitude heuristics')
    }
    for (const value of [-1, 100.1, 101, 'eighty-five']) assert.ok((await request(value)).status >= 400)
    const publicResponse = await handleEndpoints({ config, request: new Request(`http://127.0.0.1:3399/api/works/${pub.id}?draft=false`) })
    assert.equal(publicResponse.status, 200)
    assert.equal((await publicResponse.json()).rating, 85)
    const { generateDrizzleJson, generateMigration } = adapter.requireDrizzleKit()
    const schema = JSON.parse(await readFile(new URL('../../src/migrations/20261028_120000_rating_scale_100.json', import.meta.url), 'utf8'))
    assert.deepEqual(await generateMigration(schema, await generateDrizzleJson(adapter.schema)), [], 'numeric storage and snapshot require no table change')
    assert.deepEqual(python(`import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute('PRAGMA foreign_key_check').fetchall()))`), [])
    assert.equal(python(`import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute('PRAGMA integrity_check').fetchone()[0]))`), 'ok')
    assert.equal(python(`import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute('SELECT count(*) FROM payload_migrations WHERE name=?',(${JSON.stringify(ratingScaleMarker)},)).fetchone()[0]))`), 1)
    await assert.rejects(migration.down({} as never), /0–100-compatible/)
    assert.ok(user.id)
    if (process.env.RATING_TEST_REPORT) await writeFile(process.env.RATING_TEST_REPORT, JSON.stringify({ passed: true, originalWorks: oldRatings[0].length, originalVersions: oldRatings[1].length, beforeRatings: oldRatings, afterRatings: expected, checks: ['atomic-failure-rollback', 'mixed-scale-rejected', 'crash-gap-idempotence', 'every-nonrating-column-preserved', 'base-draft-history-distinct', 'standard-rest-0-100', 'fractional-precision', 'zero-null', 'schema-no-op', 'integrity-foreign-keys', 'down-rejected'] }, null, 2))
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
