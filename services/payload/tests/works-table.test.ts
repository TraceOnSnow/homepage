import assert from 'node:assert/strict'
import test from 'node:test'
import { experienceDateInput, isExperienceDate } from '../src/lib/experience'
import { matchesWorkTableFilters, shouldConfirmWorkNavigation, workPatch, workPublicationData, workPublicationLabel, workValues, type TableWork } from '../src/lib/works-table'
import { saveTableDrafts, writeTableWork, type TableSaveProgress, type TableSaveResult, type tableRequest } from '../src/components/admin/works-table-api'

test('experience dates preserve precision, validate leap years, and display legacy timestamps without rewriting', () => {
  for (const date of [null, '', '2020', '2020-02', '2020-02-29', '2020-02-28T16:00:00.000Z']) assert.equal(isExperienceDate(date), true)
  for (const date of ['2020-00', '2020-13', '2021-02-29', '2020-04-31', '20', '2020-2', '2020-01-01 extra']) assert.equal(isExperienceDate(date), false, date)
  assert.equal(experienceDateInput('2020'), '2020')
  assert.equal(experienceDateInput('2020-02-28T16:00:00.000Z'), '2020-02-29')
})

test('table patches keep historic dates, IDs, notes and progress, and preserve rating zero', () => {
  const work: TableWork = {
    id: 1, title: 'Personal record', slug: 'personal-record', type: 'game', visibility: 'private',
    createdAt: '2020-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', rating: 0, note: 'Original reaction',
    experiences: [
      { id: 'first', endedOn: '2020-01-01T00:00:00.000Z', note: 'Old note', progress: 'Credits', status: 'completed' },
      { id: 'second', startedOn: '2022-01-01T00:00:00.000Z', endedOn: '2022-01-05T00:00:00.000Z', platform: 'PC' },
    ],
  }
  const values = workValues(work)
  assert.equal(values.rating, '0')
  assert.deepEqual(workPatch(work, values), {})
  assert.deepEqual(workPatch(work, { ...values, article: 12 }), { article: 12 })
  const changed = workPatch(work, { ...values, endedOn: '2023-05', rating: '' })
  assert.equal(changed.rating, null)
  assert.deepEqual(changed.experiences?.[0], work.experiences![0])
  assert.equal(changed.experiences?.[1].id, 'second')
  assert.equal(changed.experiences?.[1].startedOn, '2022-01-01T00:00:00.000Z')
  assert.equal(changed.experiences?.[1].endedOn, '2023-05')
  assert.equal(work.experiences![1].endedOn, '2022-01-05T00:00:00.000Z')
  assert.equal('note' in changed, false)
  assert.throws(() => workPatch(work, { ...values, rating: '101' }), /评分/)
  assert.throws(() => workPatch(work, { ...values, endedOn: '2023-02-29' }), /时间/)
})

const published: TableWork = {
  id: 9, title: 'Published work', slug: 'published-work', type: 'book', visibility: 'public',
  _status: 'published', note: 'Old public reaction', rating: 0,
  createdAt: '2020-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  experiences: [{ id: 'old-row', endedOn: '2020', note: 'Keep history' }],
}

function apiFixture(latest = structuredClone(published), base = structuredClone(published)) {
  const calls: { route: string; method: string; data?: unknown }[] = []
  const state = { latest, base }
  const request: typeof tableRequest = async <T>(route: string, method = 'GET', data?: unknown): Promise<T> => {
    calls.push({ route, method, data })
    const query = new URL(route, 'http://fixture.test').searchParams
    if (method === 'GET') return structuredClone(query.get('draft') === 'true' ? state.latest : state.base) as T
    const values = data as Partial<TableWork>
    state.latest = { ...state.latest, ...values, updatedAt: '2026-01-03T00:00:00Z' }
    if (query.get('draft') !== 'true') state.base = structuredClone(state.latest)
    return { docs: [structuredClone(state.latest)] } as T
  }
  return { request, state, calls }
}

test('saving a draft uses latest version guards and leaves old published visibility/content intact', async () => {
  const api = apiFixture()
  const result = await writeTableWork('save-draft', published, published, { note: 'New draft', visibility: 'private' }, api.request)
  const write = api.calls.find(call => call.method === 'PATCH')!
  const query = new URL(write.route, 'http://fixture.test').searchParams
  assert.equal(query.get('draft'), 'true')
  assert.equal(query.get('where[and][1][updatedAt][equals]'), published.updatedAt)
  assert.deepEqual(write.data, { note: 'New draft', visibility: 'private', _status: 'draft' })
  assert.equal(result.latest.note, 'New draft')
  assert.equal(result.latest.visibility, 'private')
  assert.equal(result.publishedBase.note, 'Old public reaction')
  assert.equal(result.publishedBase.visibility, 'public')
  assert.equal(result.publishedBase._status, 'published')
  assert.equal(workPublicationLabel(result.latest, result.publishedBase), '草稿修改 · 旧版已公开')
})

test('publish carries complete latest editable draft with its selected visibility and historic row IDs', async () => {
  const latest: TableWork = { ...structuredClone(published), _status: 'draft', note: 'Latest private draft', visibility: 'private', updatedAt: '2026-01-02T00:00:00Z' }
  const api = apiFixture(latest)
  const result = await writeTableWork('publish', latest, published, {}, api.request)
  const write = api.calls.find(call => call.method === 'PATCH')!
  const query = new URL(write.route, 'http://fixture.test').searchParams
  assert.equal(query.get('draft'), 'false')
  assert.equal(query.get('where[and][1][updatedAt][equals]'), published.updatedAt)
  assert.equal((write.data as TableWork).note, 'Latest private draft')
  assert.equal((write.data as TableWork).visibility, 'private')
  assert.deepEqual((write.data as TableWork).experiences, published.experiences)
  assert.equal(result.publishedBase._status, 'published')
  assert.equal(workPublicationLabel(result.latest, result.publishedBase), '已发布 · 私密')
  assert.equal('updatedAt' in (write.data as object), false)
  assert.equal('id' in workPublicationData(latest), false)
})

test('withdraw retains latest draft content rather than restoring old public fields', async () => {
  const latest: TableWork = { ...structuredClone(published), _status: 'draft', note: 'Retain this newer draft', updatedAt: '2026-01-02T00:00:00Z' }
  const api = apiFixture(latest)
  const result = await writeTableWork('unpublish', latest, published, {}, api.request)
  assert.equal(result.latest._status, 'draft')
  assert.equal(result.latest.note, 'Retain this newer draft')
  assert.equal(result.publishedBase._status, 'draft')
  assert.equal(workPublicationLabel(result.latest, result.publishedBase), '草稿')
})

test('concurrent latest or base changes stop before PATCH so caller can retain input', async () => {
  for (const side of ['latest', 'base'] as const) {
    const api = apiFixture()
    api.state[side].updatedAt = '2026-01-04T00:00:00Z'
    await assert.rejects(writeTableWork('save-draft', published, published, { rating: 8 }, api.request), /其他操作更新/)
    assert.equal(api.calls.some(call => call.method === 'PATCH'), false)
  }
})

test('filters include current edits, preserve focused edits until save, and locate hidden unsaved or failed rows', () => {
  const work = { ...published, aliases: ['Another title'], rating: null, status: 'planned' as const }
  const values = { ...workValues(work), rating: '0', status: 'completed', endedOn: '2023-05' }
  const filters = { query: '  ANOTHER TITLE  ', type: 'book', status: 'completed', missing: '', attention: 'dirty' }
  assert.equal(matchesWorkTableFilters(work, values, filters), true)
  assert.equal(matchesWorkTableFilters(work, values, { ...filters, missing: 'rating' }), false)
  assert.equal(matchesWorkTableFilters(work, values, { ...filters, missing: 'date' }), false)
  assert.equal(matchesWorkTableFilters(work, values, { ...filters, status: 'planned' }), true, 'changed status remains visible until save')
  assert.equal(matchesWorkTableFilters(work, workValues(work), { ...filters, status: 'planned' }), false)
  assert.equal(matchesWorkTableFilters(work, values, { ...filters, attention: 'errors' }), false)
  assert.equal(matchesWorkTableFilters(work, values, { ...filters, attention: 'errors' }, 'Concurrent edit'), true)
  const missingScore = { ...filters, status: '', missing: 'rating' }
  for (const rating of ['9', '9.', '9.5']) assert.equal(matchesWorkTableFilters(work, { ...values, rating }, missingScore), true)
  const saved = { ...work, rating: 9.5, status: 'completed' as const }
  assert.equal(matchesWorkTableFilters(saved, workValues(saved), { ...missingScore, attention: '' }), false, 'saved rating leaves missing-score filter')
})

test('navigation protection excludes native drawers, modified clicks, downloads and same-page anchors', () => {
  const current = 'http://localhost:8767/admin/works-table'
  const normal = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, download: false, inDrawer: false, inTable: false }
  assert.equal(shouldConfirmWorkNavigation(current, '/admin/collections/posts', normal), true)
  assert.equal(shouldConfirmWorkNavigation(current, 'https://example.test/', normal), true)
  assert.equal(shouldConfirmWorkNavigation(current, '#record', normal), false)
  assert.equal(shouldConfirmWorkNavigation(current, 'mailto:test@example.invalid', normal), false)
  for (const property of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey', 'download', 'inDrawer', 'inTable'] as const) {
    assert.equal(shouldConfirmWorkNavigation(current, '/admin/collections/posts', { ...normal, [property]: true }), false, property)
  }
  assert.equal(shouldConfirmWorkNavigation(current, '/admin', { ...normal, target: '_blank' }), false)
  assert.equal(shouldConfirmWorkNavigation(current, '/admin', { ...normal, button: 1 }), false)
})

test('batch save reports serial observed progress, keeps failed inputs, and continues after validation or concurrency errors', async () => {
  const originals = [9, 10, 11, 12].map(id => ({ ...structuredClone(published), id, title: `Work ${id}` }))
  const rows = originals.map((base, index) => ({ base, publishedBase: structuredClone(base), values: { ...workValues(base), rating: index === 1 ? '101' : index === 3 ? '0' : '8' } }))
  const before = structuredClone(rows)
  const apis = new Map(originals.map(work => [work.id, apiFixture(structuredClone(work), structuredClone(work))]))
  apis.get(9)!.state.latest.updatedAt = '2026-02-01T00:00:00Z'
  const resultEvents: TableSaveResult[] = []
  const progress: TableSaveProgress[] = []
  const request: typeof tableRequest = async <T>(route: string, method = 'GET', data?: unknown): Promise<T> => {
    const url = new URL(route, 'http://fixture.test')
    const id = Number(url.pathname.match(/works\/(\d+)/)?.[1] || url.searchParams.get('where[and][0][id][equals]'))
    return apis.get(id)!.request<T>(route, method, data)
  }
  const result = await saveTableDrafts(rows, event => resultEvents.push(event), value => progress.push(value), request)
  assert.deepEqual(result, { total: 3, done: 3, success: 1, failed: 2 })
  assert.deepEqual(rows, before, 'inputs and reviewed baselines are never modified by the save helper')
  assert.deepEqual(resultEvents.map(event => [event.id, Boolean(event.saved)]), [[9, false], [10, false], [11, true]])
  assert.match(resultEvents[0].error!, /其他操作更新/)
  assert.match(resultEvents[1].error!, /评分/)
  assert.equal(resultEvents[2].saved!.publishedBase._status, 'published')
  assert.equal(resultEvents[2].saved!.latest._status, 'draft')
  assert.deepEqual(progress.map(value => value.done), [0, 1, 1, 2, 2, 3])
  for (const id of [9, 10, 12]) assert.equal(apis.get(id)!.calls.some(call => call.method === 'PATCH'), false)
  assert.equal(apis.get(11)!.calls.filter(call => call.method === 'PATCH').length, 1)
})


test('hundred-point table input preserves explicit scores and decimal legacy precision', () => {
  for (const rating of ['0', '85', '100', '83.75', '8.5']) assert.equal(workPatch(published, { ...workValues(published), rating }).rating ?? 0, Number(rating))
  for (const rating of ['-1', '100.1', 'bad']) assert.throws(() => workPatch(published, { ...workValues(published), rating }), /评分/)
})
