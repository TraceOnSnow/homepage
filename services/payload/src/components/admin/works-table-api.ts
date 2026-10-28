import type { Work } from '../../payload-types'
import { hasPublicWorkTableUpdate, isWorkDirty, sameWorkField, workPatch, workPublicationData, workTablePublicationBlock, type TableWork, type WorkValues } from '../../lib/works-table'

export async function tableRequest<T>(route: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api/${route}`, {
    method, credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? '登录已过期或无权操作，请重新登录。' : `操作失败（HTTP ${response.status}），请检查内容后重试。`)
  return response.json()
}

/** Read every page, including private records. Never turn a failed page into an empty table. */
export async function tableDocuments<T extends { id: number }>(resource: string): Promise<T[]> {
  const docs = new Map<number, T>()
  for (let page = 1; page <= 1000; page++) {
    const result = await tableRequest<{ docs: T[]; hasNextPage: boolean }>(`${resource}${resource.includes('?') ? '&' : '?'}depth=0&limit=100&page=${page}&sort=id`)
    if (!Array.isArray(result.docs) || typeof result.hasNextPage !== 'boolean') throw Error('收到无效的数据分页，请刷新重试。')
    for (const doc of result.docs) docs.set(doc.id, doc)
    if (!result.hasNextPage) return [...docs.values()]
    if (!result.docs.length) throw Error('分页结果不完整，请刷新重试。')
  }
  throw Error('记录超过本次读取上限，请使用原生作品列表。')
}

export async function readTableWork(id: number, request: typeof tableRequest = tableRequest) {
  const [latest, publishedBase] = await Promise.all([
    request<TableWork>(`works/${id}?depth=0&draft=true`),
    request<TableWork>(`works/${id}?depth=0&draft=false`),
  ])
  return { latest, publishedBase }
}

/** Payload may assign array row IDs/defaults; every supplied value must still match. */
function persistedMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length
    && expected.every((item, index) => persistedMatches(actual[index], item))
  if (expected && typeof expected === 'object') return Boolean(actual && typeof actual === 'object')
    && Object.entries(expected).every(([key, value]) => persistedMatches((actual as Record<string, unknown>)[key], value))
  return sameWorkField(actual, expected)
}

/** Standard REST only. These checks are optimistic, not an atomic cross-editor lock. */
export async function writeTableWork(
  action: 'save-draft' | 'save-sync' | 'publish' | 'publish-updates' | 'unpublish',
  reviewed: TableWork,
  reviewedBase: TableWork,
  patch: Partial<Work> = {},
  request: typeof tableRequest = tableRequest,
) {
  const current = await readTableWork(reviewed.id, request)
  if (!reviewed.updatedAt || !reviewedBase.updatedAt || current.latest.updatedAt !== reviewed.updatedAt
    || current.publishedBase.updatedAt !== reviewedBase.updatedAt) throw Error('记录已被其他操作更新。输入已保留，请查看详情核对后再决定。')
  const saveDraft = action === 'save-draft'
  const publishing = action !== 'save-draft' && action !== 'unpublish'
  if (action === 'save-sync' || action === 'publish-updates') {
    const blocked = workTablePublicationBlock(current.latest, current.publishedBase)
    if (blocked) throw Error(blocked)
    if (action === 'publish-updates' && !hasPublicWorkTableUpdate(current.latest, current.publishedBase)) throw Error('本行已不符合已公开作品更新范围，请重新读取。')
  }
  const payload = saveDraft ? { ...patch, _status: 'draft' as const }
    : { ...workPublicationData(current.latest), ...patch, _status: publishing ? 'published' as const : 'draft' as const }
  // Native draft PATCH matches the latest version; publication matches the base.
  const expected = saveDraft ? current.latest.updatedAt : current.publishedBase.updatedAt
  const params = new URLSearchParams({
    depth: '0', draft: String(saveDraft), 'where[and][0][id][equals]': String(reviewed.id),
    'where[and][1][updatedAt][equals]': expected,
  })
  const refreshed = await request<TableWork>(`works/${reviewed.id}?depth=0&draft=true`)
  if (refreshed.updatedAt !== reviewed.updatedAt) throw Error('记录已被其他操作更新。输入已保留，请核对最新草稿。')
  let result: { docs: TableWork[]; errors?: unknown[] }
  try {
    result = await request<{ docs: TableWork[]; errors?: unknown[] }>(`works?${params}`, 'PATCH', payload)
  } catch {
    // A lost response can follow a committed write. Reconcile once, never resend.
    try {
      const observed = await readTableWork(reviewed.id, request)
      const matches = (work: TableWork) => persistedMatches(work, payload)
      if (matches(observed.latest) && (saveDraft || matches(observed.publishedBase))) return observed
    } catch { /* The result remains unknown; keep the user's input. */ }
    throw Error('写入结果尚未确认，已尝试回读且未自动重试。输入已保留；请重新读取本行核对后再操作。')
  }
  if (result.errors?.length || result.docs?.length !== 1) throw Error('保存未成功，可能存在编辑冲突或内容错误；输入已保留。')
  // Read actual persisted versions, not the proposed PATCH, before reporting success.
  let saved: Awaited<ReturnType<typeof readTableWork>>
  try { saved = await readTableWork(reviewed.id, request) }
  catch { throw Error('写入已返回，但回读尚未完成，结果需要核对。输入已保留且未自动重试；请重新读取本行。') }
  const matches = (work: TableWork) => persistedMatches(work, payload)
  if (!matches(saved.latest) || (!saveDraft && !matches(saved.publishedBase))) {
    throw Error('操作后的发布状态需要核对。输入已保留，请刷新本行检查结果。')
  }
  return saved
}

export type TableDraftRow = { base: TableWork; publishedBase: TableWork; values: WorkValues }
export type TableSaveResult = { id: number; saved: Awaited<ReturnType<typeof writeTableWork>>; error?: never }
  | { id: number; error: string; saved?: never }
export type TableSaveProgress = { done: number; total: number; success: number; failed: number; title?: string }

/** Save serially, report each observed result, and never retry an ambiguous write. */
export async function saveTableWorks(
  rows: TableDraftRow[],
  onResult: (result: TableSaveResult) => void,
  onProgress: (progress: TableSaveProgress) => void,
  request: typeof tableRequest = tableRequest,
): Promise<TableSaveProgress> {
  const targets = rows.filter(row => isWorkDirty(row.base, row.values))
  const progress: TableSaveProgress = { done: 0, total: targets.length, success: 0, failed: 0 }
  for (const row of targets) {
    onProgress({ ...progress, title: row.base.title })
    try {
      const saved = await writeTableWork('save-sync', row.base, row.publishedBase, workPatch(row.base, row.values), request)
      onResult({ id: row.base.id, saved })
      progress.success++
    } catch (error) {
      onResult({ id: row.base.id, error: (error as Error).message })
      progress.failed++
    }
    progress.done++
    onProgress({ ...progress })
  }
  return progress
}

/** All loaded pages, regardless of UI filters. Unsaved inputs must be handled first. */
export async function publishTableUpdates(
  rows: TableDraftRow[],
  onResult: (result: TableSaveResult) => void,
  onProgress: (progress: TableSaveProgress) => void,
  request: typeof tableRequest = tableRequest,
): Promise<TableSaveProgress> {
  if (rows.some(row => isWorkDirty(row.base, row.values))) throw Error('请先点击“保存全部并同步”处理未保存输入，再发布已保存的作品更新。')
  const targets = rows.filter(row => hasPublicWorkTableUpdate(row.base, row.publishedBase))
  const progress: TableSaveProgress = { done: 0, total: targets.length, success: 0, failed: 0 }
  for (const row of targets) {
    onProgress({ ...progress, title: row.base.title })
    try {
      const saved = await writeTableWork('publish-updates', row.base, row.publishedBase, {}, request)
      onResult({ id: row.base.id, saved }); progress.success++
    } catch (error) {
      onResult({ id: row.base.id, error: (error as Error).message }); progress.failed++
    }
    progress.done++; onProgress({ ...progress })
  }
  return progress
}
