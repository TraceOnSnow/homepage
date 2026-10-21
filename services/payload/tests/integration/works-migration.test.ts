import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'
import type { SQLiteAdapter, MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

test('Works drafts upgrade preserves every old table row, array ID, relation and published public value', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-work-upgrade-'))
  const database = path.join(directory, 'payload.db')
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${database}`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-work-upgrade-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  const python = (code: string) => JSON.parse(execFileSync('python3', ['-c', code, database], { encoding: 'utf8' }))
  const snapshot = `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1]);out={}
for (name,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_works_v%' AND name != 'payload_migrations' ORDER BY name"):
 cols=sorted(r[1] for r in c.execute('PRAGMA table_info("'+name+'")') if not (name=='works' and r[1]=='_status'))
 out[name]=sorted(c.execute('SELECT '+','.join('"'+v+'"' for v in cols)+' FROM "'+name+'"').fetchall(),key=repr)
print(json.dumps(out,ensure_ascii=False,sort_keys=True))`
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    const { migrations } = await import('../../src/migrations')
    payload = await getPayload({ config })
    await payload.db.migrate({ migrations: migrations.slice(0, -1).map(migration => ({ name: migration.name, up: args => migration.up(args as MigrateUpArgs), down: args => migration.down(args as MigrateDownArgs) })) })
    python(`import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1]);c.execute('PRAGMA foreign_keys=ON')
c.execute("INSERT INTO works(id,type,title,slug,rating,status,note,visibility,created_at,updated_at) VALUES (41,'game','公开历史','public-legacy',0,'completed','原感受','public','2020-01-01T00:00:00Z','2020-02-01T00:00:00Z')")
c.execute("INSERT INTO works(id,type,title,slug,rating,status,note,visibility) VALUES (42,'book','私密历史','private-legacy',9,'planned','保留私密','private')")
c.execute("INSERT INTO media(id,alt,filename) VALUES(91,'原封面','fixture.png')")
c.execute("INSERT INTO cms_posts(id,title,markdown,link,locale,_status) VALUES(92,'原文章','原正文','original-article','zh','published')")
c.execute("UPDATE works SET cover_id=91,article_id=92 WHERE id=41")
c.execute("INSERT INTO works_experiences(_order,_parent_id,id,status,started_on,ended_on,platform,progress,note) VALUES(1,41,'old-array-id','completed','2019','2020-01','原平台','原进度','原备注')")
c.execute("INSERT INTO works_sources(_order,_parent_id,id,provider,external_id,url) VALUES(1,41,'old-source-id','catalogue','777','https://example.test/source')")
c.execute("INSERT INTO works_texts(id,\\"order\\",parent_id,path,text) VALUES(71,1,41,'aliases','原别名')")
c.execute("INSERT INTO works_texts(id,\\"order\\",parent_id,path,text) VALUES(72,1,41,'tags','原标签')")
c.execute("INSERT INTO works_texts VALUES(73,1,41,'creators','原作者')")
c.execute("INSERT INTO works_texts VALUES(74,1,41,'platforms','原平台')")
c.execute("INSERT INTO payload_locked_documents(id,global_slug) VALUES(81,'preserve-lock')")
c.execute("INSERT INTO payload_locked_documents_rels(id,parent_id,path,works_id) VALUES(82,81,'document',41)")
c.commit();print('null')`)
    const before = python(snapshot)
    const adapter = payload.db as unknown as SQLiteAdapter
    const drizzle = adapter.drizzle
    let failureInjected = false
    const interrupted = new Proxy(drizzle, { get(target, property) {
      if (property === 'transaction') return (operation: (transaction: unknown) => Promise<void>) => target.transaction(async transaction => {
        const broken = new Proxy(transaction, { get(inner, name) {
          if (name === 'run') return async (statement: Parameters<typeof inner.run>[0]) => {
            const result = await inner.run(statement)
            const query = JSON.stringify(statement)
            if (query.includes('DROP TABLE') && query.includes('works') && !query.includes('works_sources')) {
              failureInjected = true
              throw new Error('Injected failure after original Works table drop')
            }
            return result
          }
          const value = Reflect.get(inner, name)
          return typeof value === 'function' ? value.bind(inner) : value
        } })
        return operation(broken)
      })
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    await assert.rejects(migrations.at(-1)!.up({ db: interrupted } as MigrateUpArgs), /Injected failure/)
    assert.equal(failureInjected, true)
    assert.deepEqual(python(snapshot), before, 'interrupted replacement must roll back every existing row')
    assert.equal(python("import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute(\"SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE '_works_v%'\").fetchone()[0]))"), 0)
    await payload.db.migrate()
    assert.deepEqual(python(snapshot), before, 'all original table values, IDs, array and lock references must survive')
    const publicWork = await payload.findByID({ collection: 'works', id: 41, draft: true, depth: 0 })
    assert.equal(publicWork._status, 'published')
    assert.equal(publicWork.cover, 91)
    assert.equal(publicWork.article, 92)
    assert.equal(publicWork.experiences![0].id, 'old-array-id')
    assert.equal(publicWork.sources![0].id, 'old-source-id')
    assert.deepEqual(publicWork.aliases, ['原别名'])
    assert.deepEqual(publicWork.tags, ['原标签'])
    const privateWork = await payload.findByID({ collection: 'works', id: 42, draft: true })
    assert.equal(privateWork._status, 'draft')
    assert.equal(privateWork.visibility, 'private')
    const anonymous = await payload.find({ collection: 'works', overrideAccess: false, user: null, draft: false })
    assert.deepEqual(anonymous.docs.map(work => work.id), [41])
    assert.equal(anonymous.docs[0].note, '原感受')
    const versions = await payload.findVersions({ collection: 'works', limit: 100 })
    assert.equal(versions.totalDocs, 2)
    // findByID can fall back to base when seed timestamps match. Management
    // list and actual history reads must preserve native version.* text paths.
    const fields = ['aliases', 'creators', 'platforms', 'tags'] as const
    const paged = await payload.find({ collection: 'works', draft: true, depth: 0, limit: 100, page: 1 })
    const latest = paged.docs.find(work => work.id === 41)!
    const seededVersion = await payload.findVersionByID({ collection: 'works', id: versions.docs.find(version => version.parent === 41)!.id, depth: 0 })
    for (const field of fields) {
      assert.deepEqual(latest[field], publicWork[field], `draft list preserves ${field}`)
      assert.deepEqual(seededVersion.version[field], publicWork[field], `version preserves ${field}`)
      assert.equal(latest[field]!.length, 1)
    }
    assert.equal(latest.experiences![0].id, 'old-array-id')
    assert.equal(latest.sources![0].id, 'old-source-id')
    // Synthetic identity only; call native REST in-process without a listener.
    await payload.create({ collection: 'users', data: { email: 'upgrade@example.test', password: 'synthetic-upgrade-password' } })
    const key = 'synthetic-upgrade-client-key-at-least-32-characters'
    await payload.create({ collection: 'content-clients', data: { name: 'Upgrade fixture', apiKey: key } })
    const response = await handleEndpoints({ config, request: new Request('http://127.0.0.1:3399/api/works?draft=true&depth=0&limit=100&page=1', { headers: { Authorization: `content-clients API-Key ${key}` } }) })
    assert.equal(response.status, 200)
    const rest = (await response.json()).docs.find((work: { id: number }) => work.id === 41)
    for (const field of fields) assert.deepEqual(rest[field], publicWork[field], `REST draft list preserves ${field}`)
    assert.deepEqual(python("import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute('PRAGMA foreign_key_check').fetchall()))"), [])
    const db = payload.db as unknown as SQLiteAdapter
    const { generateDrizzleJson, generateMigration } = db.requireDrizzleKit()
    const schema = JSON.parse(await readFile(new URL('../../src/migrations/20261021_034349_works_drafts.json', import.meta.url), 'utf8'))
    assert.deepEqual(await generateMigration(schema, await generateDrizzleJson(db.schema)), [])
    const beforeRepeat = python(snapshot)
    await payload.db.migrate()
    assert.deepEqual(python(snapshot), beforeRepeat, 'repeat migration is a no-op for all data, including synthetic API identities')
    await assert.rejects(migrations.at(-1)!.down({} as never), /Preserve Work drafts/)
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
