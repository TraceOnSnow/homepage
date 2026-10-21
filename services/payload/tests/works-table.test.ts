import assert from 'node:assert/strict'
import test from 'node:test'
import { experienceDateInput, isExperienceDate } from '../src/lib/experience'
import { workPatch, workPublicationData, workPublicationLabel, workValues, type TableWork } from '../src/lib/works-table'
import { writeTableWork, type tableRequest } from '../src/components/admin/works-table-api'

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
  assert.throws(() => workPatch(work, { ...values, rating: '11' }), /评分/)
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
