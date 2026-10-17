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
