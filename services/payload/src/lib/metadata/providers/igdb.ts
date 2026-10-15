import type { MetadataEnvironment, MetadataCandidate, ProviderAdapter } from '../types'
import { ProviderError, type HTTP } from '../http'
import { unique, safeURL } from '../normalize'
type IGDBGame = {
  id: number; name: string; slug?: string; url?: string; first_release_date?: number; summary?: string
  cover?: { url?: string }; alternative_names?: { name?: string }[]
  involved_companies?: { developer?: boolean; company?: { name?: string } }[]
  platforms?: { name?: string }[]
}

export function igdbProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  const { json } = http
  let token: { value: string; expires: number } | undefined
  let pendingToken: Promise<string> | undefined
  async function accessToken() {
    if (token && token.expires > Date.now()) return token.value
    if (pendingToken) return pendingToken
    pendingToken = (async () => {
      const data = await json<{ access_token: string; expires_in: number }>('https://id.twitch.tv/oauth2/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.IGDB_CLIENT_ID!, client_secret: env.IGDB_CLIENT_SECRET!, grant_type: 'client_credentials' }),
      })
      if (!data.access_token) throw new ProviderError(502)
      token = { value: data.access_token, expires: Date.now() + Math.max(0, (data.expires_in - 60) * 1000) }
      return token.value
    })()
    try { return await pendingToken } finally { pendingToken = undefined }
  }

  async function igdb(query: string): Promise<MetadataCandidate[]> {
    const bearer = await accessToken()
    let games: IGDBGame[]
    try {
      games = await json<IGDBGame[]>('https://api.igdb.com/v4/games', {
        method: 'POST', headers: { 'Client-ID': env.IGDB_CLIENT_ID!, Authorization: `Bearer ${bearer}`, 'Content-Type': 'text/plain' },
        body: `search ${JSON.stringify(query)}; fields name,slug,url,first_release_date,summary,cover.url,alternative_names.name,involved_companies.developer,involved_companies.company.name,platforms.name; limit 8;`,
      })
    } catch (error) { if (error instanceof ProviderError && error.status === 401) token = undefined; throw error }
    return games.map(game => ({
      provider: 'igdb', type: 'game', externalId: String(game.id), title: game.name,
      aliases: unique([game.name, ...(game.alternative_names || []).map(x => x.name)]),
      coverUrl: safeURL(game.cover?.url?.replace('t_thumb', 't_cover_big')),
      releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString() : undefined,
      creators: unique((game.involved_companies || []).filter(x => x.developer).map(x => x.company?.name)),
      platforms: unique((game.platforms || []).map(x => x.name)), description: game.summary,
      source: { provider: 'igdb', type: 'game', externalId: String(game.id), url: safeURL(game.url) || (game.slug ? `https://www.igdb.com/games/${encodeURIComponent(game.slug)}` : undefined), fetchedAt: new Date().toISOString() },
    }))
  }


  return { id: 'igdb', types: ['game'], enabled: Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET), search: igdb }
}
