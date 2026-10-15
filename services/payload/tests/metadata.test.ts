import assert from 'node:assert/strict'
import test from 'node:test'
import { createGameSearch } from '../src/lib/metadata/games'
import { metadataPatch } from '../src/lib/metadata/apply'
import { slugify } from '../src/lib/slug'

test('IGDB normalizes dates, aliases, developers and provenance; token/search are cached', async () => {
  const calls: string[] = []
  const search = createGameSearch({ IGDB_CLIENT_ID: 'client', IGDB_CLIENT_SECRET: 'secret' }, async (input, init) => {
    calls.push(String(input))
    if (String(input).includes('oauth2')) {
      assert.equal(String(input).includes('secret'), false)
      assert.equal(String(init?.body).includes('client_secret=secret'), true)
      return Response.json({ access_token: 'token', expires_in: 3600 })
    }
    assert.match(String(init?.body), /search "TUNIC"/)
    return Response.json([{ id: 12, name: 'TUNIC', first_release_date: 1647388800, url: 'https://www.igdb.com/games/tunic', cover: { url: '//images.igdb.com/t_thumb/cover.jpg' }, alternative_names: [{ name: '小狐狸' }], involved_companies: [{ developer: true, company: { name: 'Andrew Shouldice' } }, { publisher: true, company: { name: 'Publisher' } }] }])
  })
  const first = await search('TUNIC')
  const candidate = first.candidates[0]
  assert.equal(candidate.releaseDate, '2022-03-16T00:00:00.000Z')
  assert.equal(candidate.coverUrl, 'https://images.igdb.com/t_cover_big/cover.jpg')
  assert.deepEqual(candidate.creators, ['Andrew Shouldice'])
  assert.deepEqual(candidate.aliases, ['TUNIC', '小狐狸'])
  assert.equal(candidate.source.externalId, '12')
  assert.equal(first.providers[1].state, 'unavailable')
  assert.deepEqual(await search('TUNIC'), first)
  assert.equal(calls.length, 2)
  assert.equal(JSON.stringify(first).includes('secret'), false)
})

test('provider failure cannot discard RAWG results or leak error details; cooldown honors 429', async () => {
  let failedCalls = 0
  const search = createGameSearch({ IGDB_CLIENT_ID: 'client', IGDB_CLIENT_SECRET: 'secret', RAWG_API_KEY: 'rawg-secret' }, async input => {
    if (String(input).includes('rawg.io')) return Response.json({ results: [{ id: 1, name: 'TUNIC', released: '2022-03-16', slug: 'tunic' }] })
    failedCalls++
    return new Response('secret error details', { status: 429, headers: { 'Retry-After': '120' } })
  })
  const result = await search('TUNIC')
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].provider, 'rawg')
  assert.equal(result.providers[0].state, 'rate-limited')
  assert.equal(JSON.stringify(result).includes('secret'), false)
  await search('another game')
  assert.equal(failedCalls, 1)
})

test('missing credentials never trigger network calls; invalid query is rejected', async () => {
  const search = createGameSearch({}, async () => { throw new Error('must not fetch') })
  assert.deepEqual((await search('TUNIC')).providers.map(p => p.state), ['unavailable', 'unavailable'])
  await assert.rejects(search('a'))
  await assert.rejects(search('x'.repeat(101)))
})

test('metadata fill preserves authored fields, stable slug and other provider identity', () => {
  const current = { slug: 'my-tunic', rating: 9.5, note: '个人感想', status: 'completed', cover: 8, sources: [{ provider: 'rawg', externalId: '42' }, { provider: 'igdb', externalId: 'old' }] }
  const patch = metadataPatch({ type: 'game', provider: 'igdb', externalId: '12', title: 'TUNIC', aliases: ['TUNIC'], creators: [], platforms: [], source: { provider: 'igdb', externalId: '12' } }, current)
  const filled = { ...current, ...patch }
  assert.equal(filled.slug, 'my-tunic')
  assert.equal(filled.rating, 9.5)
  assert.equal(filled.note, '个人感想')
  assert.equal(filled.status, 'completed')
  assert.equal(filled.cover, 8)
  assert.deepEqual(filled.sources, [{ provider: 'rawg', externalId: '42' }, { provider: 'igdb', externalId: '12' }])
  assert.equal(slugify(' TUNIC / 小狐狸 '), 'tunic-小狐狸')
})
