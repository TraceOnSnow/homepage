import type { Work } from '../payload-types'
import { experienceDateInput, isExperienceDate } from './experience'

export type TableWork = Omit<Work, 'article'> & { article?: number | null }
export type WorkValues = {
  status: string; rating: string; startedOn: string; endedOn: string
  note: string; article: number | null; visibility: string
}

/** A published version remains available while a separate latest draft is edited. */
export function workPublicationLabel(latest: TableWork, published: TableWork): string {
  if (latest._status === 'draft') {
    if (published._status === 'published') return published.visibility === 'public' ? '草稿修改 · 旧版已公开' : '草稿修改 · 旧版已发布（私密）'
    return '草稿'
  }
  return latest.visibility === 'public' ? '已发布 · 公开' : '已发布 · 私密'
}

/** Publishing/withdrawing must carry the latest draft, never just flip the base status. */
export function workPublicationData(work: TableWork): Partial<Work> {
  const fields: (keyof Work)[] = [
    'title', 'slug', 'type', 'rating', 'status', 'tags', 'note', 'article', 'experiences', 'aliases',
    'cover', 'coverUrl', 'releaseDate', 'creators', 'platforms', 'description', 'sources', 'visibility',
  ]
  return Object.fromEntries(fields.filter(key => work[key] !== undefined).map(key => [key, work[key]]))
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

export type WorkTableFilters = { query: string; type: string; status: string; missing: string; attention: string }

/** Include current input matches, but retain an originally matching edited row
 * until save so typing a score/date never removes its own focused control. */
export function matchesWorkTableFilters(work: TableWork, values: WorkValues, filters: WorkTableFilters, error?: string): boolean {
  const query = filters.query.trim().toLocaleLowerCase()
  const dirty = isWorkDirty(work, values)
  const matchesPersonal = (input: WorkValues) => (!filters.status || (filters.status === 'unknown' ? !input.status : input.status === filters.status))
    && (filters.missing !== 'rating' || !input.rating.trim())
    && (filters.missing !== 'date' || !input.endedOn.trim())
  return (!query || [work.title, ...(work.aliases || [])].some(text => text.toLocaleLowerCase().includes(query)))
    && (!filters.type || work.type === filters.type)
    && (matchesPersonal(values) || (dirty && matchesPersonal(workValues(work))))
    && (filters.attention !== 'dirty' || dirty)
    && (filters.attention !== 'errors' || Boolean(error))
}

/** Ordinary navigation only; drawers and modified clicks keep their native behavior. */
export function shouldConfirmWorkNavigation(currentURL: string, destination: string, options: {
  button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
  target?: string | null; download: boolean; inDrawer: boolean; inTable: boolean;
}): boolean {
  if (options.button !== 0 || options.ctrlKey || options.metaKey || options.shiftKey || options.altKey
    || options.download || options.inDrawer || options.inTable || (options.target && options.target !== '_self')) return false
  const current = new URL(currentURL)
  const next = new URL(destination, current)
  return ['http:', 'https:'].includes(next.protocol)
    && (next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search)
}

export function finishedSortValue(work: Pick<Work, 'experiences' | 'createdAt'>): number {
  const ends = (work.experiences || []).map(row => row.endedOn).filter((date): date is string => Boolean(date) && isExperienceDate(date))
  return Math.max(0, ...ends.map(date => Date.parse(date))) || Date.parse(work.createdAt) || 0
}
