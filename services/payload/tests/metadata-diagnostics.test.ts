import assert from 'node:assert/strict'
import test from 'node:test'
import { createHTTP, ProviderError } from '../src/lib/metadata/http'
import { withMetadataContext, type MetadataDiagnostic } from '../src/lib/metadata/diagnostics'

test('diagnostics preserve concurrent provider context without logging private request or response data', async () => {
  const records: MetadataDiagnostic[] = []
  const secret = 'private-query-token-cookie-and-body'
  const http = createHTTP(async (_url, init) => {
    assert.equal(init?.redirect, 'error')
    assert.equal(init?.cache, 'no-store')
    assert.ok(init?.signal)
    await new Promise(resolve => setTimeout(resolve, 5))
    return Response.json({ content: secret }, { headers: {
      'CF-Ray': 'a4c412421c1e7673-IAH', 'CF-Cache-Status': 'MISS', 'Set-Cookie': secret,
    } })
  }, record => records.push(record))
  const result = await Promise.all([
    withMetadataContext('bgg', 'search', () => http.json(`https://example.test/search?q=${secret}`, { headers: { Authorization: `Bearer ${secret}` } })),
    withMetadataContext('bangumi', 'details', () => http.json('https://example.test/details', { method: 'POST', body: secret })),
  ])
  assert.equal((result[0] as { content: string }).content, secret)
  assert.deepEqual(records.map(r => [r.provider, r.operation]).sort(), [['bangumi', 'details'], ['bgg', 'search']])
  assert.equal(new Set(records.map(r => r.requestId)).size, 2)
  for (const record of records) {
    assert.equal(record.outcome, 'ok'); assert.equal(record.status, 200); assert.equal(record.phase, 'body')
    assert.equal(record.cfRay, 'a4c412421c1e7673-IAH'); assert.equal(record.cfCacheStatus, 'MISS')
    assert.ok(record.elapsedMs >= 0)
  }
  assert.ok(!JSON.stringify(records).includes(secret))
  assert.ok(!JSON.stringify(records).includes('example.test'))
})

test('HTTP diagnostics retain 403 and 522 evidence while preserving safe ProviderError and Retry-After behavior', async () => {
  for (const status of [403, 522]) {
    const records: MetadataDiagnostic[] = []
    const http = createHTTP(async () => new Response('private upstream HTML', { status, headers: {
      'Retry-After': '120', 'CF-Ray': 'a4c412421c1e7673-ICN', 'CF-Cache-Status': 'private-secret-invalid-value',
    } }), record => records.push(record))
    await assert.rejects(http.text('https://example.test/?key=private-key'), error => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.status, status); assert.equal(error.retryAfter, 120_000)
      assert.equal(error.message, 'Provider request failed')
      return true
    })
    assert.equal(records.length, 1)
    assert.equal(records[0].status, status); assert.equal(records[0].errorCategory, 'http')
    assert.equal(records[0].retryAfterMs, 120_000); assert.equal(records[0].phase, 'headers')
    assert.equal(records[0].cfCacheStatus, null)
    assert.ok(!JSON.stringify(records).includes('private'))
  }
})

test('timeout, network and invalid JSON remain distinguishable without exposing exception messages', async () => {
  for (const [failure, category] of [
    [new DOMException('private timeout URL', 'TimeoutError'), 'timeout'],
    [new TypeError('private token in connection error'), 'network'],
    [undefined, 'other'],
  ] as const) {
    const records: MetadataDiagnostic[] = []
    const http = createHTTP(async () => { throw failure }, record => records.push(record))
    await assert.rejects(http.json('https://example.test'))
    assert.equal(records[0].errorCategory, category)
    assert.equal(records[0].status, null)
    assert.equal(records[0].phase, 'headers')
    assert.ok(!JSON.stringify(records).includes('private'))
  }
  const records: MetadataDiagnostic[] = []
  const http = createHTTP(async () => new Response('private invalid JSON'), record => records.push(record))
  await assert.rejects(http.json('https://example.test'), SyntaxError)
  assert.equal(records[0].status, 200)
  assert.equal(records[0].phase, 'body')
  assert.equal(records[0].errorCategory, 'invalid-response')
})

test('a failing log sink cannot turn a successful metadata request into a failure', async () => {
  const http = createHTTP(async () => Response.json({ ok: true }), () => { throw Error('log sink unavailable') })
  assert.deepEqual(await http.json('https://example.test'), { ok: true })
})
