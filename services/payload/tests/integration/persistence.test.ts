import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const worker = (directory: string, mode: string) => {
  const output = execFileSync(process.execPath, ['--import', 'tsx', 'tests/helpers/persistence-worker.ts', mode], {
    cwd: root, encoding: 'utf-8', timeout: 90_000,
    env: { ...process.env, NODE_ENV: 'production', DISABLE_PAYLOAD_HMR: 'true', DATABASE_URL: `file:${directory}/storage/payload.db`, MEDIA_DIR: `${directory}/storage/media`, PAYLOAD_SECRET: 'persistence-test-secret-not-for-production' },
  })
  return JSON.parse(output.match(/PERSISTENCE_RESULT=(.+)/)![1])
}
const digest = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex')

test('legacy snapshot import preserves IDs, administrator credentials, uploads, and records across process restarts', { timeout: 180_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'payload-persistence-'))
  const source = path.join(directory, 'legacy')
  const target = path.join(directory, 'backend')
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(path.join(source, 'storage/media'), { recursive: true })
    const created = worker(source, 'create')
    await writeFile(path.join(source, '.env'), 'PAYLOAD_SECRET=persistence-test-secret-not-for-production\nRAWG_API_KEY=fixture-key\n')
    // Reproduce the old dev-push migration marker without changing the baseline schema.
    execFileSync('python3', ['-c', "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('DELETE FROM payload_migrations'); c.execute(\"INSERT INTO payload_migrations(name,batch) VALUES ('dev',-1)\"); c.commit(); c.close()", path.join(source, 'storage/payload.db')])
    const before = await digest(path.join(source, 'storage/payload.db'))
    execFileSync('python3', ['scripts/import-legacy.py', source, '--destination', target], { cwd: root })
    assert.equal(await digest(path.join(source, 'storage/payload.db')), before)
    const copiedEnv = await readFile(path.join(target, '.env'), 'utf-8')
    assert.ok(copiedEnv.includes('PAYLOAD_SECRET=persistence-test-secret-not-for-production'))
    assert.ok(copiedEnv.includes('RAWG_API_KEY=fixture-key'))
    assert.deepEqual(worker(target, 'read'), created)
    assert.deepEqual(worker(target, 'read'), created)
    const targetBefore = await digest(path.join(target, 'storage/payload.db'))
    assert.throws(() => execFileSync('python3', ['scripts/import-legacy.py', source, '--destination', target], { cwd: root, stdio: 'pipe' }), /refusing to overwrite/)
    assert.equal(await digest(path.join(target, 'storage/payload.db')), targetBefore)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
