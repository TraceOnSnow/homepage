import assert from 'node:assert/strict'
import test from 'node:test'
import { experienceDateInput, isExperienceDate } from '../src/lib/experience'
import { workPatch, workValues, type TableWork } from '../src/lib/works-table'

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
