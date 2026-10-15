import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { Payload } from 'payload'
import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-sqlite'

test('upgrade preserves legacy rows; Markdown drafts, protection, single relations and deletion are safe', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'homepage-posts-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`, MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'posts-integration-secret-not-production', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  try {
    const { getPayload } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    const { migrations } = await import('../../src/migrations')
    payload = await getPayload({ config })
    await payload.db.migrate({ migrations: migrations.slice(0, 2).map(migration => ({ name: migration.name,
      up: args => migration.up(args as MigrateUpArgs), down: args => migration.down(args as MigrateDownArgs) })) })
    execFileSync('python3', ['-c', "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute(\"INSERT INTO posts(id,title,slug,content,_status) VALUES (99,'Legacy','legacy','original rich text','published')\");c.commit()", `${directory}/payload.db`])
    await payload.db.migrate()
    const legacy = execFileSync('python3', ['-c', "import sqlite3,sys,json;c=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute('SELECT id,title,content FROM posts WHERE id=99').fetchone()))", `${directory}/payload.db`], { encoding: 'utf8' })
    assert.deepEqual(JSON.parse(legacy), [99, 'Legacy', 'original rich text'])
    const owner = await payload.create({ collection: 'users', data: { email: 'posts@example.test', password: 'posts-test-password-123' } })
    const user = { ...owner, collection: 'users' as const }
    const anonymous = { overrideAccess: false, user: null } as const
    const body = '\r\n## 原文\r\n\r\n++强调++\r\n\r\n:::info\r\n保留原文\r\n:::\r\n'
    const post = await payload.create({ collection: 'posts', data: { title: '原始文章', markdown: body, link: 'note/original', locale: 'zh', publishedAt: '2020-01-02T00:00:00Z', _status: 'draft' } })
    assert.equal(post.markdown, body)
    assert.equal((await payload.find({ collection: 'posts', ...anonymous })).totalDocs, 0)
    await assert.rejects(payload.findVersions({ collection: 'posts', ...anonymous }))
    await assert.rejects(payload.create({ collection: 'posts', ...anonymous, data: { title: 'Denied', link: 'denied', locale: 'zh', publishedAt: new Date().toISOString() } }))
    const work = await payload.create({ collection: 'works', data: { title: 'Work', type: 'game', slug: 'work', article: post.id, note: 'Original reaction', rating: 0, visibility: 'public' } })
    await payload.update({ collection: 'posts', id: post.id, data: { _status: 'published' }, user, overrideAccess: false })
    assert.equal((await payload.find({ collection: 'posts', ...anonymous })).docs[0].markdown, body)
    await payload.update({ collection: 'posts', id: post.id, data: { title: 'Unsaved publicly', markdown: 'DRAFT ONLY' }, draft: true })
    const live = (await payload.find({ collection: 'posts', ...anonymous, draft: false })).docs[0]
    assert.equal(live.title, '原始文章')
    assert.equal(live.markdown, body)
    await payload.update({ collection: 'posts', id: post.id, data: { title: '新标题', _status: 'published', markdown: body } })
    assert.equal((await payload.findByID({ collection: 'posts', id: post.id })).link, 'note/original')
    const unchanged = await payload.findByID({ collection: 'works', id: work.id })
    assert.equal(unchanged.note, 'Original reaction')
    assert.equal(unchanged.rating, 0)
    await payload.update({ collection: 'works', id: work.id, data: { note: '' } })
    assert.equal((await payload.findByID({ collection: 'works', id: work.id })).note, '')
    await payload.update({ collection: 'posts', id: post.id, data: { markdown: ':::encrypted\nPRIVATE CONTENT\n:::', protectedContent: false } })
    assert.equal((await payload.find({ collection: 'posts', ...anonymous })).totalDocs, 0)
    await assert.rejects(payload.findByID({ collection: 'posts', id: post.id, ...anonymous }))
    await payload.delete({ collection: 'posts', id: post.id })
    assert.equal((await payload.findByID({ collection: 'works', id: work.id })).article, null)
    assert.equal((await payload.findByID({ collection: 'works', id: work.id })).rating, 0)
    const plan = path.join(directory, 'invalid-import.json')
    const entry = (link: string) => ({ file: `${link}.md`, works: [], data: { title: 'Transactional import', link, locale: 'zh', publishedAt: '2020-01-01T00:00:00Z', _status: 'published', markdown: 'Original text' } })
    await writeFile(plan, JSON.stringify([entry('must-rollback'), entry('../invalid')]), { mode: 0o600 })
    assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/import-markdown.ts', plan, '--apply'], { cwd: process.cwd(), env: process.env, stdio: 'pipe' }))
    assert.equal((await payload.find({ collection: 'posts' })).totalDocs, 0, 'failed import must roll back its earlier successful rows')
  } finally { await payload?.destroy(); await rm(directory, { recursive: true, force: true }) }
})
