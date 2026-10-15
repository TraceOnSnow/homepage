import type { Endpoint } from 'payload'
import { createMetadataService } from './search'
import { workTypes } from './types'

const service = createMetadataService({
  IGDB_CLIENT_ID: process.env.IGDB_CLIENT_ID, IGDB_CLIENT_SECRET: process.env.IGDB_CLIENT_SECRET, RAWG_API_KEY: process.env.RAWG_API_KEY,
  GOOGLE_BOOKS_API_KEY: process.env.GOOGLE_BOOKS_API_KEY, TMDB_API_READ_ACCESS_TOKEN: process.env.TMDB_API_READ_ACCESS_TOKEN, TMDB_API_KEY: process.env.TMDB_API_KEY,
  BANGUMI_ACCESS_TOKEN: process.env.BANGUMI_ACCESS_TOKEN, BGG_API_TOKEN: process.env.BGG_API_TOKEN, WEREAD_API_KEY: process.env.WEREAD_API_KEY,
})
function endpoint(path: string, details = false, gameOnly = false): Endpoint {
  return { path, method: 'get', handler: async req => {
    const headers = { 'Cache-Control': 'private, no-store' }
    if (!req.user) return Response.json({ error: 'Authentication required' }, { status: 401, headers })
    const params = new URL(req.url!).searchParams
    const query = params.get('q')?.normalize('NFKC').trim() || ''
    const type = workTypes.find(type => type === (gameOnly ? 'game' : params.get('type')))
    if (!type || query.length < 2 || query.length > 100) return Response.json({ error: 'Invalid search' }, { status: 400, headers })
    try {
      if (details) {
        const provider = params.get('provider') || ''
        const id = params.get('id') || ''
        if (!provider || !id || id.length > 150) return Response.json({ error: 'Invalid candidate' }, { status: 400, headers })
        return Response.json(await service.resolve(type, query, provider, id), { headers })
      }
      return Response.json(await service.search(type, query), { headers })
    } catch {
      return Response.json({ error: 'Metadata unavailable' }, { status: details ? 400 : 502, headers })
    }
  } }
}
export const searchEndpoint = endpoint('/metadata/games', false, true)
export const metadataEndpoints = [endpoint('/metadata/search'), endpoint('/metadata/details', true), searchEndpoint]
