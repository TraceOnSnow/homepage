import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetadataService } from '../src/lib/metadata/search'
import { releaseDate } from '../src/lib/metadata/normalize'
import { createHTTP } from '../src/lib/metadata/http'
import type { Dispatcher } from 'undici'

const env = { GOOGLE_BOOKS_API_KEY: 'google-secret', TMDB_API_READ_ACCESS_TOKEN: 'tmdb-secret', WEREAD_API_KEY: 'weread-secret', BGG_API_TOKEN: 'bgg-secret' }

test('WeRead uses its own pooled transport without changing other providers or redirect policy', async () => {
  const dispatchers: (Dispatcher | undefined)[] = []
  const http = createHTTP(async (_input, init) => {
    dispatchers.push((init as RequestInit & { dispatcher?: Dispatcher }).dispatcher)
    assert.equal(init?.redirect, 'error')
    assert.equal(init?.cache, 'no-store')
    assert.ok(init?.signal)
    return Response.json({})
  })
  await http.json('https://i.weread.qq.com/api/agent/gateway')
  await http.json('https://i.weread.qq.com/api/agent/gateway')
  await http.json('https://api.themoviedb.org/3/search/movie')
  await http.json('https://i.weread.qq.com.example.com/')
  assert.ok(dispatchers[0])
  assert.equal(dispatchers[0], dispatchers[1])
  assert.equal(dispatchers[2], undefined)
  assert.equal(dispatchers[3], undefined)
})

test('books normalize three independent providers, HTTPS covers, ISBN and WeRead scope 17', async () => {
  const calls: string[] = []
  const service = createMetadataService(env, async (input, init) => {
    const url = String(input); calls.push(url)
    if (url.includes('googleapis.com')) {
      assert.equal(new URL(url).searchParams.get('q'), 'isbn:9781234567897')
      return Response.json({ items: [{ id: 'google-id', volumeInfo: { title: 'Book', authors: ['Author'], publishedDate: '2008', description: '<p>Intro</p>', imageLinks: { thumbnail: 'http://books.google.com/cover.jpg' } } }] })
    }
    if (url.includes('openlibrary.org/search')) return Response.json({ docs: [{ key: 'OL1W', title: 'Book', author_name: ['Author'], cover_i: 12 }] })
    if (url.includes('openlibrary.org/works')) return Response.json({ description: { value: 'Full description' } })
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer weread-secret')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.skill_version, '1.0.5')
    assert.equal(body.params, undefined)
    if (body.api_name === '/book/info') return Response.json({ bookId: 'wr1', title: '三体', author: '刘慈欣', cover: 'https://cdn.weread.qq.com/cover.jpg', intro: 'Full WeRead intro', publishTime: '2008-01-01', readerLink: 'https://weread.qq.com/reader/test', deepLink: 'https://weread.qq.com/detail/test' })
    assert.equal(body.scope, 10)
    return Response.json({ errcode: 0, data: { results: [{ scope: 17, books: [{ bookInfo: { bookId: 'wr1', title: '三体', author: '刘慈欣', cover: 'https://cdn.weread.qq.com/cover.jpg', intro: 'Intro' } }] }] } })
  })
  const result = await service.search('book', '978-1-234-56789-7')
  assert.deepEqual(result.providers.map(p => p.state), ['ok', 'ok', 'ok'])
  assert.equal(result.candidates.length, 3)
  assert.equal(result.candidates[0].releaseDate, undefined)
  assert.equal(result.candidates[0].coverUrl, 'https://books.google.com/cover.jpg')
  assert.equal(result.candidates[1].source.externalId, 'OL1W')
  const full = await service.resolve('book', '978-1-234-56789-7', 'weread', 'wr1')
  assert.equal(full.candidate.releaseDate, '2008-01-01T00:00:00.000Z')
  assert.equal(full.candidate.description, 'Full WeRead intro')
  assert.equal(full.candidate.source.url, 'https://weread.qq.com/reader/test')
  assert.equal((await service.resolve('book', '978-1-234-56789-7', 'open-library', 'OL1W')).candidate.description, 'Full description')
  assert.equal(JSON.stringify(result).includes('secret'), false)
  assert.equal(calls.length, 5)
})

test('TMDB keeps movie and TV identities and cache separate, enriches credits only on selection', async () => {
  let requests = 0
  const service = createMetadataService(env, async (input, init) => {
    requests++
    const url = new URL(String(input))
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer tmdb-secret')
    if (url.pathname.includes('/search/')) return Response.json({ results: [{ id: 42, title: url.pathname.includes('movie') ? 'Movie' : undefined, name: 'TV', release_date: '2024-02-29', poster_path: '/poster.jpg' }] })
    assert.equal(url.searchParams.get('append_to_response'), 'credits')
    return Response.json({ credits: { crew: [{ job: 'Director', name: 'Director' }, { job: 'Editor', name: 'Editor' }] } })
  })
  assert.equal((await service.search('movie', 'Same title')).candidates[0].externalId, 'movie:42')
  assert.equal((await service.search('tv', 'Same title')).candidates[0].externalId, 'tv:42')
  assert.equal(requests, 2)
  const full = await service.resolve('movie', 'Same title', 'tmdb', 'movie:42')
  assert.deepEqual(full.candidate.creators, ['Director'])
  await assert.rejects(service.resolve('movie', 'Same title', 'tmdb', 'tv:42'))
  await assert.rejects(service.resolve('movie', 'Same title', 'tmdb', 'https://localhost/private'))
  assert.equal(requests, 3)
})

test('Bangumi routes anime/manga correctly and enriches infobox creators', async () => {
  const filters: number[][] = []
  const service = createMetadataService({}, async (input, init) => {
    if (String(input).includes('/search/')) {
      filters.push(JSON.parse(String(init?.body)).filter.type)
      return Response.json({ data: [{ id: 1, name: 'Original', name_cn: '中文', date: '2023-10-01', images: { large: 'https://lain.bgm.tv/cover.jpg' } }] })
    }
    return Response.json({ id: 1, infobox: [{ key: '导演', value: [{ v: 'Director' }] }, { key: '动画制作', value: 'Studio' }] })
  })
  assert.equal((await service.search('anime', '中文')).candidates[0].type, 'anime')
  assert.equal((await service.search('manga', '中文')).candidates[0].type, 'manga')
  assert.deepEqual(filters, [[2], [1]])
  assert.deepEqual((await service.resolve('anime', '中文', 'bangumi', '1')).candidate.creators, ['Director', 'Studio'])
})

test('BGG parses XML regardless of attribute order and obtains cover/designer from details', async () => {
  const service = createMetadataService(env, async (input, init) => {
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer bgg-secret')
    const xml = String(input).includes('/search?')
      ? '<items><item id="13" type="boardgame"><name value="Catan &amp; Friends" type="primary"/><yearpublished value="1995"/></item></items>'
      : '<items><item type="boardgame" id="13"><name value="Catan &amp; Friends" type="primary"/><image>https://cf.geekdo-images.com/cover.jpg</image><description>A &amp; B</description><link value="Designer" type="boardgamedesigner" id="1"/></item></items>'
    return new Response(xml)
  })
  const result = await service.search('boardgame', 'Catan')
  assert.equal(result.candidates[0].title, 'Catan & Friends')
  const full = await service.resolve('boardgame', 'Catan', 'bgg', '13')
  assert.equal(full.candidate.coverUrl, 'https://cf.geekdo-images.com/cover.jpg')
  assert.deepEqual(full.candidate.creators, ['Designer'])
  assert.equal(full.candidate.description, 'A & B')
  assert.equal(full.candidate.releaseDate, undefined)
})

test('one failed book provider does not discard other results; WeRead upgrade stops future calls', async () => {
  let wereadCalls = 0
  const service = createMetadataService(env, async input => {
    if (String(input).includes('googleapis')) return new Response('secret details', { status: 429 })
    if (String(input).includes('openlibrary')) return Response.json({ docs: [{ key: '/works/OL1W', title: 'Book' }] })
    wereadCalls++
    return Response.json({ upgrade_info: { message: 'Update required' } })
  })
  const result = await service.search('book', 'Book')
  assert.equal(result.candidates.length, 1)
  assert.deepEqual(result.providers.map(p => p.state), ['rate-limited', 'ok', 'upgrade-required'])
  assert.equal(JSON.stringify(result).includes('secret'), false)
  await service.search('book', 'Another book')
  assert.equal(wereadCalls, 1)
})

test('detail failure preserves the initial candidate, missing secrets skip requests, dates reject impossible days', async () => {
  const service = createMetadataService({}, async input => String(input).includes('/search/subjects?') ? Response.json({ data: [{ id: 1, name: 'Anime' }] }) : new Response('private details', { status: 503 }))
  const full = await service.resolve('anime', 'Anime', 'bangumi', '1')
  assert.equal(full.state, 'error')
  assert.equal(full.candidate.title, 'Anime')
  assert.equal((await service.search('movie', 'Movie')).providers[0].state, 'unavailable')
  assert.equal((await service.search('boardgame', 'Catan')).providers[0].state, 'unavailable')
  assert.equal(releaseDate('2024-02-30'), undefined)
  assert.equal(releaseDate('2024'), undefined)
})


test('Open Library uses title search for a two-character Chinese book name', async () => {
  const service = createMetadataService({}, async input => {
    if (String(input).includes('googleapis')) return Response.json({ items: [] })
    const url = new URL(String(input))
    assert.equal(url.searchParams.get('title'), '三体')
    assert.equal(url.searchParams.has('q'), false)
    return Response.json({ docs: [{ key: '/works/OL1W', title: '三体' }] })
  })
  assert.equal((await service.search('book', '三体')).candidates[0].title, '三体')
})
