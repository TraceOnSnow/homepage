import path from 'node:path'
import type { Endpoint, PayloadRequest } from 'payload'
import { CoverPoolError, readCoverPool, saveCoverPool, type ReadCoverMedia } from './cover-pool'

const headers = { 'Cache-Control': 'no-store' }
function mediaReader(req: PayloadRequest): ReadCoverMedia {
  return async ids => {
    const result = await req.payload.find({ collection: 'media', where: { id: { in: ids } }, limit: 200,
      depth: 0, pagination: false, overrideAccess: false, req })
    return result.docs.map(media => ({ ...media,
      url: media.url ? new URL(media.url, req.payload.config.serverURL).href : null }))
  }
}
function failure(error: unknown) {
  return Response.json({ error: error instanceof CoverPoolError ? error.message : '封面池暂不可用，请稍后重试。' },
    { status: error instanceof CoverPoolError ? error.status : 503, headers })
}
export const coverPoolEndpoints: Endpoint[] = [
  { path: '/site-covers', method: 'get', handler: async req => {
    try { return Response.json(await readCoverPool(process.env.MEDIA_DIR || path.resolve('storage/media'), mediaReader(req)), { headers }) }
    catch (error) { return failure(error) }
  } },
  { path: '/site-covers', method: 'patch', handler: async req => {
    if (req.user?.collection !== 'users') return Response.json({ error: '请先登录管理员账号。' }, { status: 403, headers })
    try {
      const origin = req.headers.get('origin')
      const allowed = [req.payload.config.serverURL, ...req.payload.config.csrf].filter(Boolean)
      if ((origin && !allowed.includes(origin)) || req.headers.get('sec-fetch-site') === 'cross-site') {
        throw new CoverPoolError('请从本站后台保存封面池。', 403)
      }
      if (Number(req.headers.get('content-length')) > 16_384) throw new CoverPoolError('封面设置请求过大。', 413)
      let value: unknown
      try {
        // Bound the streamed body too: Content-Length is optional and untrusted.
        const reader = req.body?.getReader()
        if (!reader) throw new CoverPoolError('封面设置格式无效。')
        const chunks: Uint8Array[] = []; let bytes = 0
        try {
          for (;;) {
            const { done, value: chunk } = await reader.read(); if (done) break
            bytes += chunk.byteLength
            if (bytes > 16_384) { await reader.cancel(); throw new CoverPoolError('封面设置请求过大。', 413) }
            chunks.push(chunk)
          }
        } finally { reader.releaseLock() }
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch (error) { if (error instanceof CoverPoolError) throw error; throw new CoverPoolError('封面设置格式无效。') }
      return Response.json(await saveCoverPool(process.env.MEDIA_DIR || path.resolve('storage/media'), value, mediaReader(req)), { headers })
    } catch (error) { return failure(error) }
  } },
]
