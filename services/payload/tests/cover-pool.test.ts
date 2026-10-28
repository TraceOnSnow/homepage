import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { BUILT_IN_COVERS, CoverPoolError, readCoverPool, saveCoverPool, validateCoverPoolPatch, type CoverMedia } from '../src/lib/cover-pool'

const documents: CoverMedia[] = [
  { id: 1, url: 'https://site.example/api/media/file/test.webp', mimeType: 'image/webp', width: 500, height: 300, alt: 'A cover', updatedAt: '2026-10-29T00:00:00Z' },
  { id: 2, url: '/api/media/file/other.png', mimeType: 'image/png', alt: 'Second image' },
  { id: 3, url: 'file:///private/config', mimeType: 'image/webp' },
]
const media = async (ids: number[]) => documents.filter(doc => ids.includes(doc.id))
const temporary = async (run: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cover-pool-unit-'))
  try { await run(directory) } finally { await rm(directory, { recursive: true, force: true }) }
}

test('missing settings preserve 21 originals without upload; public output selects only requested media', () => temporary(async directory => {
  const initial = await readCoverPool(directory, async () => { throw new Error('No media query needed') })
  assert.deepEqual(initial.covers, BUILT_IN_COVERS)
  assert.equal(initial.includeBuiltIn, true); assert.deepEqual(initial.images, [])
  const saved = await saveCoverPool(directory, { revision: initial.revision, includeBuiltIn: true, mediaIds: [1] }, media)
  assert.equal(saved.covers.length, 22)
  assert.deepEqual(saved.images, [{ id: 1, url: documents[0].url, alt: documents[0].alt, width: 500, height: 300, updatedAt: documents[0].updatedAt }])
  assert.equal((await stat(path.join(directory, '.cover-pool.json'))).mode & 0o777, 0o600)
  assert.deepEqual(await readCoverPool(directory, media), saved)
  assert.ok(!JSON.stringify(saved).includes('mimeType')); assert.ok(!JSON.stringify(saved).includes('other.png'))
}))

test('strict shape rejects coercion, unknown keys, duplicates, empty pools and excessive IDs', () => {
  const valid = { revision: 'a'.repeat(64), includeBuiltIn: false, mediaIds: [1] }
  for (const value of [null, [], { ...valid, includeBuiltIn: 'true' }, { ...valid, mediaIds: ['1'] },
    { ...valid, mediaIds: [0] }, { ...valid, mediaIds: [1, 1] }, { ...valid, mediaIds: [1.1] },
    { ...valid, mediaIds: [] }, { ...valid, mediaIds: Array.from({ length: 201 }, (_, i) => i + 1) },
    { ...valid, revision: 'old' }, { ...valid, filename: '/private/file' }]) assert.throws(() => validateCoverPoolPatch(value), CoverPoolError)
})

test('concurrent same-revision writers yield one commit and one conflict', () => temporary(async directory => {
  const initial = await readCoverPool(directory, media)
  const results = await Promise.allSettled([1, 2].map(id => saveCoverPool(directory,
    { revision: initial.revision, includeBuiltIn: false, mediaIds: [id] }, media)))
  const committed = results.filter(result => result.status === 'fulfilled')
  const rejected = results.filter(result => result.status === 'rejected')
  assert.equal(committed.length, 1); assert.equal(rejected.length, 1)
  assert.equal(rejected[0].status === 'rejected' && rejected[0].reason.status, 409)
  assert.deepEqual(await readCoverPool(directory, media), committed[0].status === 'fulfilled' ? committed[0].value : null)
  assert.equal((await readFile(path.join(directory, '.cover-pool.json'), 'utf8')).includes('revision'), false)
}))

test('deleted or unsafe media require explicit removal and preserve other selections', () => temporary(async directory => {
  let current = await readCoverPool(directory, media)
  for (const id of [3, 999]) await assert.rejects(saveCoverPool(directory,
    { revision: current.revision, includeBuiltIn: false, mediaIds: [id] }, media), /不存在或不可用/)
  current = await saveCoverPool(directory, { revision: current.revision, includeBuiltIn: true, mediaIds: [1, 2] }, media)
  const withoutFirst = async (ids: number[]) => documents.filter(doc => doc.id === 2 && ids.includes(doc.id))
  const missing = await readCoverPool(directory, withoutFirst)
  assert.deepEqual(missing.mediaIds, [1, 2]); assert.deepEqual(missing.images.map(image => image.id), [2])
  await assert.rejects(saveCoverPool(directory, { revision: current.revision, includeBuiltIn: true, mediaIds: [1, 2] }, withoutFirst), /1/)
  const repaired = await saveCoverPool(directory, { revision: current.revision, includeBuiltIn: false, mediaIds: [2] }, withoutFirst)
  assert.deepEqual(repaired.covers, ['/api/media/file/other.png'])
}))

test('corrupt/oversized config and symlinks fail closed and preserve unrelated targets', () => temporary(async directory => {
  const config = path.join(directory, '.cover-pool.json')
  await writeFile(config, 'not JSON'); await assert.rejects(readCoverPool(directory, media), /暂不可读取/)
  await writeFile(config, ' '.repeat(20_000)); await assert.rejects(readCoverPool(directory, media), CoverPoolError)
  await rm(config)
  const target = path.join(directory, 'private-file'); await writeFile(target, 'leave intact'); await symlink(target, config)
  await assert.rejects(readCoverPool(directory, media), CoverPoolError)
  await assert.rejects(saveCoverPool(directory, { revision: 'a'.repeat(64), includeBuiltIn: true, mediaIds: [] }, media), CoverPoolError)
  assert.equal(await readFile(target, 'utf8'), 'leave intact')
  await rm(config); await rm(path.join(directory, '.cover-pool.lock')); await symlink(directory, path.join(directory, '.cover-pool.lock'))
  const current = await readCoverPool(directory, media)
  await assert.rejects(saveCoverPool(directory, { revision: current.revision, includeBuiltIn: true, mediaIds: [1] }, media))
}))


test('built-in images support individual selection and old settings still mean all 21', () => temporary(async directory => {
  const current = await readCoverPool(path.join(directory, 'new-media-directory'), media)
  assert.equal(current.covers.length, 21)
  const subset = await saveCoverPool(directory, { revision: current.revision, includeBuiltIn: true, builtInIds: [2, 7], mediaIds: [] }, media)
  assert.deepEqual(subset.covers, ['/img/cover/2.webp', '/img/cover/7.webp'])
  assert.deepEqual(subset.builtInIds, [2, 7])
  for (const builtInIds of [[0], [22], [1, 1], ['2'], [1.5], [], null]) {
    assert.throws(() => validateCoverPoolPatch({ revision: subset.revision, includeBuiltIn: true, mediaIds: [], builtInIds }), CoverPoolError)
  }
  const original = await saveCoverPool(directory, { revision: subset.revision, includeBuiltIn: true, mediaIds: [] }, media)
  assert.deepEqual(original.covers, BUILT_IN_COVERS)
}))


test('kernel lock excludes another process and releases automatically after the owner is killed', () => temporary(async directory => {
  const initial = await readCoverPool(directory, media)
  const moduleURL = new URL('../src/lib/cover-pool.ts', import.meta.url).href
  const code = `import { saveCoverPool } from ${JSON.stringify(moduleURL)}; import { writeFile } from 'node:fs/promises';
    const hold = setInterval(() => {}, 1000);
    await saveCoverPool(process.argv[1], JSON.parse(process.argv[2]), async () => {
      await writeFile(process.argv[1] + '/child-ready', 'ready'); return new Promise(() => {});
    }); clearInterval(hold);`
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, directory,
    JSON.stringify({ revision: initial.revision, includeBuiltIn: true, mediaIds: [1] })], { stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = once(child, 'exit')
  try {
    const deadline = Date.now() + 10_000
    for (;;) {
      try { await stat(path.join(directory, 'child-ready')); break } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        if (Date.now() > deadline || child.exitCode !== null) throw new Error('Child lock acquisition timed out')
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    }
    await assert.rejects(saveCoverPool(directory, { revision: initial.revision, includeBuiltIn: false, mediaIds: [2] }, media),
      error => error instanceof CoverPoolError && error.status === 503)
    assert.equal((await readCoverPool(directory, media)).revision, initial.revision)
    child.kill('SIGKILL'); await exited
    const saved = await saveCoverPool(directory, { revision: initial.revision, includeBuiltIn: false, mediaIds: [2] }, media)
    assert.deepEqual(saved.mediaIds, [2])
    assert.ok((await stat(path.join(directory, '.cover-pool.lock'))).isFile())
    assert.equal((await stat(path.join(directory, '.cover-pool.lock'))).mode & 0o777, 0o600)
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited } }
}))
