import type { Work } from '../payload-types'
import { experienceDateInput, isExperienceDate } from './experience'

export type TableWork = Omit<Work, 'article'> & { article?: number | null }
export type WorkValues = {
  status: string; rating: string; startedOn: string; endedOn: string
  note: string; article: number | null; visibility: string
}

export function workValues(work: TableWork): WorkValues {
  const last = work.experiences?.at(-1)
  return {
    status: work.status || '', rating: work.rating == null ? '' : String(work.rating),
    startedOn: experienceDateInput(last?.startedOn), endedOn: experienceDateInput(last?.endedOn),
    note: work.note || '', article: work.article ?? null, visibility: work.visibility,
  }
}

/** Only changed fields are sent; date edits keep every historic row and its ID. */
export function workPatch(work: TableWork, values: WorkValues): Partial<Work> {
  const original = workValues(work)
  const patch: Partial<Work> = {}
  if (values.status !== original.status) patch.status = (values.status || null) as Work['status']
  if (values.rating !== original.rating) {
    if (values.rating.trim() && (!Number.isFinite(Number(values.rating)) || Number(values.rating) < 0 || Number(values.rating) > 10)) throw Error('评分须为 0–10，未评分请留空。')
    patch.rating = values.rating.trim() ? Number(values.rating) : null
  }
  if (values.note !== original.note) patch.note = values.note
  if (values.article !== original.article) patch.article = values.article
  if (values.visibility !== original.visibility) patch.visibility = values.visibility as Work['visibility']
  if (values.startedOn !== original.startedOn || values.endedOn !== original.endedOn) {
    if (!isExperienceDate(values.startedOn) || !isExperienceDate(values.endedOn)) throw Error('时间请填写年份、年月或完整日期。')
    const experiences = (work.experiences || []).map(row => ({ ...row }))
    if (!experiences.length) experiences.push({})
    const row = experiences.at(-1)!
    if (values.startedOn !== original.startedOn) row.startedOn = values.startedOn || null
    if (values.endedOn !== original.endedOn) row.endedOn = values.endedOn || null
    patch.experiences = experiences
  }
  return patch
}

export function isWorkDirty(work: TableWork, values: WorkValues) {
  const original = workValues(work)
  return (Object.keys(original) as (keyof WorkValues)[]).some(key => original[key] !== values[key])
}

export function finishedSortValue(work: Pick<Work, 'experiences' | 'createdAt'>): number {
  const ends = (work.experiences || []).map(row => row.endedOn).filter((date): date is string => Boolean(date) && isExperienceDate(date))
  return Math.max(0, ...ends.map(date => Date.parse(date))) || Date.parse(work.createdAt) || 0
}
