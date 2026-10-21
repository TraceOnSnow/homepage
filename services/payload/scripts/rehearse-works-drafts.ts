/** Private-copy-only rehearsal. Never opens a server, logs content, or accepts a production path. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Payload } from 'payload'
import type { SQLiteAdapter } from '@payloadcms/db-sqlite'
import type { TableWork } from '../src/lib/works-table'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
const privateRoot = path.join(repository, '.cache/workflow-real-data')
const migrationName = '20261021_034349_works_drafts'
const expectedLegacyMigrations = [
  '20260929_234416_initial', '20260930_000715_native_slug',
  '20261015_211157_markdown_posts', '20261017_171808_content_clients',
]
const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
class RehearsalCheck extends Error {}
function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new RehearsalCheck(code)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => JSON.stringify(key) + ':' + canonical(child)).join(',') + '}'
  return JSON.stringify(value) ?? 'undefined'
}

// Emit hashes/counts only, never rows. The baseline supplies the exact old column
// list so the migration's new Work status is the sole excluded original-table field.
const auditProgram = `import hashlib,json,sqlite3,sys
from pathlib import Path
c=sqlite3.connect(Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
baseline=json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv)>2 else None
names=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
quote=lambda value:'"'+value.replace('"','""')+'"'
tables={}
for name in names:
 columns=[r[1] for r in c.execute('PRAGMA table_info('+quote(name)+')')]
 if baseline:
  if name not in baseline['tables']: continue
  columns=baseline['tables'][name]['columns']
 serialized=[]
 for row in c.execute('SELECT '+','.join(quote(col) for col in columns)+' FROM '+quote(name)):
  encoded=json.dumps(row,ensure_ascii=False,separators=(',',':'),default=lambda blob:{'sqlite_blob_hex':blob.hex()}).encode()
  serialized.append(hashlib.sha256(encoded).hexdigest())
 serialized.sort()
 tables[name]={'columns':columns,'rows':len(serialized),'row_sha256':serialized,'sha256':hashlib.sha256(('\\n'.join(serialized)).encode()).hexdigest()}
out={'tables':tables,'names':names,'works':c.execute('SELECT COUNT(*) FROM works').fetchone()[0],
 'posts':c.execute('SELECT COUNT(*) FROM cms_posts').fetchone()[0],
 'public_ids':[r[0] for r in c.execute("SELECT id FROM works WHERE visibility='public' ORDER BY id")],
 'private_works':c.execute("SELECT COUNT(*) FROM works WHERE visibility='private'").fetchone()[0],
 'migrations':[r[0] for r in c.execute('SELECT name FROM payload_migrations ORDER BY id')],
 'integrity_ok':c.execute('PRAGMA integrity_check').fetchone()==('ok',),
 'foreign_keys_ok':not c.execute('PRAGMA foreign_key_check').fetchall()}
if '_works_v' in names:
 out['versions']=c.execute('SELECT COUNT(*) FROM _works_v').fetchone()[0]
 out['incorrect_statuses']=c.execute("SELECT COUNT(*) FROM works WHERE _status != CASE WHEN visibility='public' THEN 'published' ELSE 'draft' END OR _status IS NULL").fetchone()[0]
print(json.dumps(out,ensure_ascii=False,sort_keys=True))`

type TableAudit = { columns: string[]; rows: number; row_sha256: string[]; sha256: string }
type Audit = {
  tables: Record<string, TableAudit>; names: string[]; works: number; posts: number;
  public_ids: number[]; private_works: number; migrations: string[];
  integrity_ok: boolean; foreign_keys_ok: boolean; versions?: number; incorrect_statuses?: number;
}
function audit(database: string, baseline?: string): Audit {
  return JSON.parse(execFileSync('python3', ['-c', auditProgram, database, ...(baseline ? [baseline] : [])], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  })) as Audit
}

let stage = 'input-guards'
let derivative: string | undefined
let payload: Payload | undefined
try {
  process.umask(0o077)
  const [basename, sourceHash, ...extra] = process.argv.slice(2)
  check(!extra.length && /^before-\d{8}T\d{6}Z\.db$/.test(basename || '') && /^[a-f0-9]{64}$/.test(sourceHash || ''), 'private-basename-and-expected-sha256-required')
  check(path.resolve(repository) !== '/home/trace/projects/homepage', 'production-checkout-refused')
  check(await realpath(privateRoot) === privateRoot, 'private-directory-symlinks-refused')
  const parent = await lstat(privateRoot)
  check(parent.isDirectory() && (parent.mode & 0o077) === 0, 'private-directory-must-be-0700')
  const source = path.join(privateRoot, basename)
  const sourceStat = await lstat(source)
  check(sourceStat.isFile() && !sourceStat.isSymbolicLink() && sourceStat.nlink === 1
    && (sourceStat.mode & 0o077) === 0, 'source-must-be-private-regular-unlinked-copy')
  for (const extension of ['-wal', '-shm', '-journal']) {
    const present = await lstat(source + extension).then(() => true, error => {
      if (error.code === 'ENOENT') return false
      throw error
    })
    check(!present, 'source-must-be-a-closed-consistent-snapshot')
  }
  check(hash(await readFile(source)) === sourceHash, 'source-hash-mismatch')
  // Refuse inherited database/auth config instead of accidentally reusing it.
  for (const name of ['DATABASE_URL', 'MEDIA_DIR', 'PAYLOAD_SECRET', 'CONTENT_BUILD_TOKEN', 'HOMEPAGE_API_KEY', 'DOTENV_CONFIG_PATH']) {
    check(!Object.hasOwn(process.env, name), 'inherited-runtime-config-refused-use-env-i')
  }
  derivative = await mkdtemp(path.join(privateRoot, 'rehearsal-'))
  const database = path.join(derivative, 'payload.db')
  await copyFile(source, database, constants.COPYFILE_EXCL)
  await chmod(database, 0o600)
  await mkdir(path.join(derivative, 'media'), { mode: 0o700 })
  const emptyEnv = path.join(derivative, 'empty.env')
  await writeFile(emptyEnv, '# Rehearsal only; no production environment file is read.\n', { flag: 'wx', mode: 0o600 })
  Object.assign(process.env, {
    NODE_ENV: 'production', DATABASE_URL: `file:${database}`, MEDIA_DIR: path.join(derivative, 'media'),
    PAYLOAD_SECRET: 'synthetic-works-private-copy-rehearsal-secret', SERVER_URL: 'http://127.0.0.1:3399',
    PAYLOAD_IMPORT_TRANSACTION: '0', DISABLE_PAYLOAD_HMR: 'true',
    DOTENV_CONFIG_PATH: emptyEnv, DOTENV_CONFIG_QUIET: 'true',
  })
  stage = 'before-manifest'
  const before = audit(database)
  check(before.integrity_ok && before.foreign_keys_ok, 'source-integrity-failed')
  check(canonical(before.migrations) === canonical(expectedLegacyMigrations), 'unexpected-legacy-migration-history')
  check(!before.names.some(name => name.startsWith('_works_v')) && !before.tables.works.columns.includes('_status'), 'already-migrated-source-refused')
  const baselineFile = path.join(derivative, 'before-audit.json')
  await writeFile(baselineFile, JSON.stringify(before), { flag: 'wx', mode: 0o600 })
  stage = 'reviewed-migration'
  const { getPayload, handleEndpoints } = await import('payload')
  const { default: configuration } = await import('../src/payload.config')
  const config = await configuration
  // SanitizedConfig deep-requires Pino's optional settings; runtime accepts the
  // documented logger options object and must not log any copied content.
  config.logger = { options: { level: 'silent' } } as typeof config.logger
  payload = await getPayload({ config })
  await payload.db.migrate()
  stage = 'old-column-preservation'
  const after = audit(database, baselineFile)
  for (const [name, table] of Object.entries(before.tables)) {
    if (name === 'payload_migrations') continue
    check(canonical(after.tables[name]) === canonical(table), 'old-table-data-changed')
  }
  check(after.names.filter(name => !before.names.includes(name)).every(name => name.startsWith('_works_v')), 'unexpected-new-table')
  check(after.integrity_ok && after.foreign_keys_ok, 'migrated-integrity-failed')
  check(after.versions === before.works && after.incorrect_statuses === 0, 'initial-versions-or-statuses-mismatch')
  check(canonical(after.migrations) === canonical([...expectedLegacyMigrations, migrationName]), 'migration-ledger-mismatch')
  await writeFile(path.join(derivative, 'after-audit.json'), JSON.stringify(after), { flag: 'wx', mode: 0o600 })
  const adapter = payload.db as unknown as SQLiteAdapter
  const { generateDrizzleJson, generateMigration } = adapter.requireDrizzleKit()
  const expectedSchema = JSON.parse(await readFile(new URL('../src/migrations/20261021_034349_works_drafts.json', import.meta.url), 'utf8'))
  check((await generateMigration(expectedSchema, await generateDrizzleJson(adapter.schema))).length === 0, 'generated-schema-differs')
  stage = 'read-only-native-fields'
  const { workPublicationData } = await import('../src/lib/works-table')
  const latest = await payload.find({ collection: 'works', draft: true, depth: 0, pagination: false, overrideAccess: true })
  const base = await payload.find({ collection: 'works', draft: false, depth: 0, pagination: false, overrideAccess: true })
  check(latest.totalDocs === before.works && base.totalDocs === before.works, 'native-read-count-mismatch')
  const original = new Map(base.docs.map(work => [work.id, work]))
  const fieldDifferences: string[][] = []
  for (const work of latest.docs) {
    const publicBase = original.get(work.id)
    check(publicBase, 'native-base-identity-missing')
    const selected = workPublicationData(work as TableWork)
    const originalFields = workPublicationData(publicBase as TableWork)
    if (canonical(selected) !== canonical(originalFields)) {
      fieldDifferences.push([...new Set([...Object.keys(selected), ...Object.keys(originalFields)])]
        .filter(key => canonical(selected[key as keyof typeof selected]) !== canonical(originalFields[key as keyof typeof originalFields])))
    }
    check(work._status === (work.visibility === 'public' ? 'published' : 'draft'), 'native-status-mismatch')
  }
  if (fieldDifferences.length) await writeFile(path.join(derivative, 'native-field-differences.json'), JSON.stringify({
    affected_records: fieldDifferences.length, differing_field_names: [...new Set(fieldDifferences.flat())],
  }), { flag: 'wx', mode: 0o600 })
  check(fieldDifferences.length === 0, 'latest-base-initial-fields-mismatch')
  const pagedIDs: number[] = []
  for (let page = 1; page <= 1000; page++) {
    const paged = await payload.find({ collection: 'works', draft: true, depth: 0, limit: 100, page, overrideAccess: true })
    for (const work of paged.docs) {
      check(canonical(workPublicationData(work as TableWork)) === canonical(workPublicationData(original.get(work.id)! as TableWork)), 'paged-latest-fields-mismatch')
      pagedIDs.push(work.id)
    }
    if (!paged.hasNextPage) break
    check(page < 1000, 'native-pagination-incomplete')
  }
  check(pagedIDs.length === before.works && new Set(pagedIDs).size === before.works, 'native-pagination-identity-mismatch')
  const versionRows = await payload.findVersions({ collection: 'works', pagination: false, depth: 0, overrideAccess: true })
  check(versionRows.totalDocs === before.works, 'native-version-count-mismatch')
  for (const row of versionRows.docs) {
    const parentID = row.parent
    check(canonical(workPublicationData(row.version as TableWork)) === canonical(workPublicationData(original.get(Number(parentID))! as TableWork)), 'version-list-fields-mismatch')
  }
  for (const field of ['aliases', 'creators', 'platforms', 'tags'] as const) {
    const sample = base.docs.find(work => work[field]?.length)
    if (!sample) continue
    const row = versionRows.docs.find(version => version.parent === sample.id)!
    const version = await payload.findVersionByID({ collection: 'works', id: row.id, depth: 0, overrideAccess: true })
    const byID = await payload.findByID({ collection: 'works', id: sample.id, draft: true, depth: 0, overrideAccess: true })
    check(canonical(version.version[field]) === canonical(sample[field]) && canonical(byID[field]) === canonical(sample[field]), 'single-version-text-fields-mismatch')
  }
  // A process-local synthetic auth strategy exercises native REST serialization
  // without reading or writing any copied users, keys or authentication fields.
  // It is removed before anonymous checks; no listener is ever opened.
  const originalStrategies = payload.authStrategies
  payload.authStrategies = [{ name: 'private-copy-synthetic-read-only', authenticate: ({ headers }) => ({
    user: headers.get('x-private-copy-read') === 'synthetic-only'
      ? { collection: 'users', id: -1, email: 'synthetic@example.invalid', createdAt: '', updatedAt: '' } : null,
  }) }]
  try {
    const restIDs: number[] = []
    for (let page = 1; page <= 1000; page++) {
      const response = await handleEndpoints({ config, request: new Request(`http://127.0.0.1:3399/api/works?draft=true&depth=0&limit=100&page=${page}`, { headers: { 'x-private-copy-read': 'synthetic-only' } }) })
      check(response.ok, 'synthetic-rest-latest-failed')
      const result = await response.json()
      for (const work of result.docs) {
        check(canonical(workPublicationData(work as TableWork)) === canonical(workPublicationData(original.get(work.id)! as TableWork)), 'rest-latest-fields-mismatch')
        restIDs.push(work.id)
      }
      if (!result.hasNextPage) break
      check(page < 1000, 'rest-pagination-incomplete')
    }
    check(restIDs.length === before.works && new Set(restIDs).size === before.works, 'rest-latest-identity-mismatch')
  } finally { payload.authStrategies = originalStrategies }
  const beforePosts = before.tables.cms_posts.rows
  const posts = await payload.find({ collection: 'posts', draft: true, depth: 0, pagination: false, overrideAccess: true })
  check(posts.totalDocs === beforePosts, 'post-read-count-mismatch')
  stage = 'anonymous-in-process-api'
  const anonymous = (route: string) => handleEndpoints({ config, request: new Request(`http://127.0.0.1:3399/api/${route}`) })
  const publicIDs: number[] = []
  for (let page = 1; page <= 1000; page++) {
    const response = await anonymous(`works?draft=false&depth=0&limit=100&page=${page}`)
    check(response.ok, 'anonymous-public-api-failed')
    const result = await response.json()
    check(Array.isArray(result.docs) && typeof result.hasNextPage === 'boolean', 'anonymous-pagination-invalid')
    for (const work of result.docs) {
      check(work._status === 'published' && work.visibility === 'public', 'anonymous-nonpublic-work')
      publicIDs.push(work.id)
    }
    if (!result.hasNextPage) break
    check(result.docs.length && page < 1000, 'anonymous-pagination-incomplete')
  }
  check(canonical(publicIDs.sort((a, b) => a - b)) === canonical(before.public_ids), 'anonymous-public-identity-mismatch')
  const privateWork = latest.docs.find(work => work.visibility === 'private')
  if (privateWork) check((await anonymous(`works/${privateWork.id}?draft=true`)).status === 404, 'anonymous-private-draft-readable')
  check([401, 403].includes((await anonymous('works/versions?limit=1')).status), 'anonymous-version-history-readable')
  stage = 'repeat-migration-and-final-audit'
  const completeBeforeRepeat = audit(database)
  await payload.db.migrate()
  const completeAfterRepeat = audit(database)
  check(canonical(completeBeforeRepeat) === canonical(completeAfterRepeat), 'repeat-migration-changed-content')
  await payload.destroy()
  payload = undefined
  check(canonical(audit(database)) === canonical(completeAfterRepeat), 'final-close-changed-content')
  check(hash(await readFile(source)) === sourceHash, 'original-source-changed')
  const report = {
    success: true, migration: migrationName, source_basename: basename, source_sha256: sourceHash,
    rehearsal_database: database, rehearsal_sha256: hash(await readFile(database)),
    works: before.works, posts: before.posts, public_works: before.public_ids.length, private_works: before.private_works,
    initial_versions: after.versions, preserved_old_tables: Object.keys(before.tables).length - 1,
    old_columns_and_every_row_hash_unchanged: true, array_and_relation_hashes_unchanged: true,
    integrity_ok: true, foreign_keys_ok: true, generated_schema_matches: true,
    latest_base_fields_match: true, paged_latest_and_rest_fields_match: true, version_list_and_single_fields_match: true,
    synthetic_auth_in_memory_only: true, anonymous_public_identity_matches: true,
    anonymous_private_and_versions_denied: true, repeat_migration_unchanged: true,
    source_unchanged: true, production_environment_read: false, production_credentials_used: false, listener_started: false,
  }
  await writeFile(path.join(derivative, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  if (payload) await payload.destroy().catch(() => {})
  // Suppress exceptions that might include database content or authentication values.
  console.error(JSON.stringify({ success: false, stage, check: error instanceof RehearsalCheck ? error.message : 'private-error-not-printed', private_derivative: derivative, detail: 'Inspect only the private derivative; source snapshot was not opened for writing.' }))
  process.exitCode = 1
}
