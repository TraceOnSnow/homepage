import type { MetadataEnvironment, MetadataCandidate, ProviderAdapter } from '../types'
import { type HTTP } from '../http'
import { unique, safeURL } from '../normalize'
type RAWGGame = { id: number; name: string; slug?: string; released?: string; background_image?: string; platforms?: { platform?: { name?: string } }[] }

export function rawgProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  const { json } = http
  async function rawg(query: string): Promise<MetadataCandidate[]> {
    const url = new URL('https://api.rawg.io/api/games')
    url.search = new URLSearchParams({ key: env.RAWG_API_KEY!, search: query, search_precise: 'true', page_size: '8' }).toString()
    const data = await json<{ results?: RAWGGame[] }>(url)
    return (data.results || []).map(game => ({
      provider: 'rawg', type: 'game', externalId: String(game.id), title: game.name, aliases: [game.name],
      coverUrl: safeURL(game.background_image),
      releaseDate: game.released && Number.isFinite(Date.parse(game.released)) ? new Date(game.released).toISOString() : undefined,
      creators: [], platforms: unique((game.platforms || []).map(x => x.platform?.name)),
      source: { provider: 'rawg', type: 'game', externalId: String(game.id), url: `https://rawg.io/games/${encodeURIComponent(game.slug || String(game.id))}`, fetchedAt: new Date().toISOString() },
    }))
  }


  return { id: 'rawg', types: ['game'], enabled: Boolean(env.RAWG_API_KEY), search: rawg }
}
