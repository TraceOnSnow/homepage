import { timingSafeEqual } from 'node:crypto'
import type { Endpoint } from 'payload'

// Server-to-server read only. Never expose protected Markdown through anonymous REST.
export const contentEndpoint: Endpoint = {
  path: '/content/posts', method: 'get',
  handler: async req => {
    const secret = process.env.CONTENT_BUILD_TOKEN
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || ''
    const expected = Buffer.from(secret || '')
    const actual = Buffer.from(token)
    if (!secret || secret.length < 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return Response.json({ error: 'Build authentication required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
    }
    const params = new URL(req.url!).searchParams
    const page = Number(params.get('page') || 1)
    if (!Number.isSafeInteger(page) || page < 1) return Response.json({ error: 'Invalid page' }, { status: 400 })
    const posts = await req.payload.find({ collection: 'posts', overrideAccess: true, draft: false,
      where: { _status: { equals: 'published' } }, page, limit: 100, depth: 1, sort: 'id' })
    return Response.json(posts, { headers: { 'Cache-Control': 'private, no-store' } })
  },
}
