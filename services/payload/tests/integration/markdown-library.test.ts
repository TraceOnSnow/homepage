import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import type { Payload } from 'payload'

const execute = promisify(execFile)
const libraryProject = process.env.MARKDOWN_LIBRARY_PROJECT || path.resolve(process.cwd(), '../../../obsidian-workflow')

test('Markdown publication round-trips through actual native Payload REST without exposing local drafts', {
  skip: !existsSync(path.join(libraryProject, 'src/markdown_library/transport.py')),
  timeout: 120_000,
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markdown-payload-wire-'))
  Object.assign(process.env, { NODE_ENV: 'production', DATABASE_URL: `file:${directory}/payload.db`,
    MEDIA_DIR: `${directory}/media`, PAYLOAD_SECRET: 'isolated-markdown-wire-test-secret', DISABLE_PAYLOAD_HMR: 'true' })
  let payload: Payload | undefined
  const server = createServer()
  try {
    const { getPayload, handleEndpoints } = await import('payload')
    const { default: config } = await import('../../src/payload.config')
    payload = await getPayload({ config })
    await payload.db.migrate()
    const fixtureKey = 'isolated-markdown-wire-key-with-no-production-access'
    await payload.create({ collection: 'content-clients', data: { name: 'Markdown wire fixture', apiKey: fixtureKey } })
    server.on('request', async (incoming, outgoing) => {
      try {
        const chunks: Buffer[] = []
        for await (const chunk of incoming) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks)
        const headers = new Headers()
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value)
        }
        const request = new Request(`http://127.0.0.1${incoming.url}`, {
          method: incoming.method, headers, ...(body.length ? { body } : {}),
        })
        const response = await handleEndpoints({ config, request })
        outgoing.writeHead(response.status, Object.fromEntries(response.headers))
        outgoing.end(Buffer.from(await response.arrayBuffer()))
      } catch {
        outgoing.writeHead(500, { 'Content-Type': 'application/json' })
        outgoing.end(JSON.stringify({ error: 'Isolated HTTP harness failed' }))
      }
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const program = `
import json, os, yaml
from pathlib import Path
from urllib.request import urlopen
from markdown_library import Library
from markdown_library.transport import PayloadClient, sync_once

library = Library.initialize(Path(os.environ['WIRE_FIXTURE_DIR']) / 'vault')
client = PayloadClient(os.environ['WIRE_FIXTURE_URL'], os.environ['WIRE_FIXTURE_KEY'], allow_loopback_http=True)
work = library.create('这段私人体验正文不应上传。', title='Wire Work', kind='work', properties={
    'slug': 'wire-work', 'type': 'game', 'rating': 0, 'note': '初版短感受',
    'experiences': [{'endedOn': '2024-06'}]})
post = library.create('## 公开正文\\n\\n初版文章。', title='Wire Post', kind='post', properties={
    'link': 'note/wire-post', 'locale': 'zh', 'publishedAt': '2020-01-02T00:00:00Z'})
for note in (work, post):
    library.publish(note['id'], expected_hash=note['sha256'])
preview = sync_once(library, client, works_drafts_and_versions=True)
assert all(not row['applied'] for row in preview['results']), preview
assert client.list_collection('works') == []
first = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not first['pending_ids'], first
assert all(row['status'] == 'observed' for row in first['results']), first

def public(collection):
    with urlopen(os.environ['WIRE_FIXTURE_URL'] + '/api/' + collection + '?depth=0&draft=false') as response:
        return json.load(response)['docs']

assert len(public('works')) == len(public('posts')) == 1
remote_work = public('works')[0]
assert remote_work['note'] == '初版短感受' and remote_work['rating'] == 0
assert remote_work['experiences'][0]['endedOn'] == '2024-06'
assert '这段私人体验正文' not in json.dumps(remote_work, ensure_ascii=False)
assert public('posts')[0]['markdown'] == '## 公开正文\\n\\n初版文章。'

current = library.get(work['id'])
current = library.replace(work['id'], current['markdown'].replace('初版短感受', '修改后短感受'), expected_hash=current['sha256'])
unchanged = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not unchanged['pending_ids'], unchanged
assert public('works')[0]['note'] == '初版短感受'
library.publish(work['id'], expected_hash=current['sha256'])
updated = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not updated['pending_ids'], updated
assert public('works')[0]['note'] == '修改后短感受'
assert len(client.list_collection('works')) == 1

# Library relationships stay stable UUIDs, resolved only at the API boundary.
current = library.get(work['id'])
properties = current['properties']
properties['article'] = post['id']
body = current['markdown'].split('---\\n', 2)[2]
linked = library.replace(work['id'], '---\\n' + yaml.safe_dump(properties, allow_unicode=True, sort_keys=False) + '---\\n' + body,
    expected_hash=current['sha256'])
library.publish(work['id'], expected_hash=linked['sha256'])
relation = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not relation['pending_ids'], relation
assert public('works')[0]['article'] == public('posts')[0]['id']

# A Payload Admin draft returns to the library as a draft, preserving private body.
remote = client.get('works', remote_work['id'], draft=True)
client.update('works', remote['id'], {'note': '后台新稿', '_status': 'draft'}, expected_version=remote['updatedAt'], draft=True)
reverse = sync_once(library, client, apply=True, works_drafts_and_versions=True, accept_remote=True)
assert any(row['status'] == 'remote-draft-imported' for row in reverse['results']), reverse
assert public('works')[0]['note'] == '修改后短感受'
imported = library.get(work['id'])
assert imported['properties']['note'] == '后台新稿'
assert '这段私人体验正文' in imported['markdown']
library.publish(work['id'], expected_hash=imported['sha256'])
converged = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not converged['pending_ids'], converged
assert public('works')[0]['note'] == '后台新稿'

library.unpublish(work['id'])
withdrawn = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not withdrawn['pending_ids'], withdrawn
assert public('works') == []
assert len(client.list_collection('works')) == 1
assert library.get(work['id'])['id'] == work['id']
assert len(public('posts')) == 1

# Confirmed local deletion withdraws automatically while retaining both systems.
restored = library.get(work['id'])
library.publish(work['id'], expected_hash=restored['sha256'])
republished = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not republished['pending_ids'], republished
assert len(public('works')) == 1
deleted = library.delete(work['id'], expected_hash=restored['sha256'])
deleted_sync = sync_once(library, client, apply=True, works_drafts_and_versions=True)
assert not deleted_sync['pending_ids'], deleted_sync
assert public('works') == [] and len(client.list_collection('works')) == 1
recovered = library.recover(work['id'], expected_hash=deleted['sha256'])
assert recovered['id'] == work['id'] and '这段私人体验正文' in recovered['markdown']
assert library.publication(work['id']) is None
print(json.dumps({'status': 'passed', 'checks': ['real-rest-create', 'work-private-body',
    'partial-date-and-zero-rating', 'draft-does-not-publish', 'explicit-update',
    'linked-library-id', 'admin-draft-roundtrip', 'confirmed-delete-withdrawal',
    'withdraw-retains-record-and-local-note', 'no-duplicate-records']}))
`
    const result = await execute('python3', ['-c', program], { cwd: libraryProject,
      env: { ...process.env, PYTHONPATH: path.join(libraryProject, 'src'), WIRE_FIXTURE_DIR: directory,
        WIRE_FIXTURE_URL: origin, WIRE_FIXTURE_KEY: fixtureKey }, timeout: 90_000, maxBuffer: 1_000_000 })
    assert.equal(JSON.parse(result.stdout.trim()).status, 'passed')
    assert.equal((await payload.find({ collection: 'works', pagination: false })).totalDocs, 1)
  } finally {
    server.closeAllConnections()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    await payload?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
})
