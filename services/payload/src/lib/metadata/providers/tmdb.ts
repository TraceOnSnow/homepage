import type { MetadataEnvironment, ProviderAdapter } from '../types'
import type { HTTP } from '../http'
import { candidate, releaseDate, safeURL, unique } from '../normalize'

type Entry = { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; poster_path?: string; overview?: string }
type Details = Entry & { created_by?: { name?: string }[]; credits?: { crew?: { job?: string; name?: string }[] } }
export function tmdbProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  function request<T>(path: string, params: Record<string, string> = {}) {
    const url = new URL(`https://api.themoviedb.org/3/${path}`)
    url.search = new URLSearchParams({ language: 'zh-CN', ...params }).toString()
    if (!env.TMDB_API_READ_ACCESS_TOKEN && env.TMDB_API_KEY) url.searchParams.set('api_key', env.TMDB_API_KEY)
    return http.json<T>(url, { headers: env.TMDB_API_READ_ACCESS_TOKEN ? { Authorization: `Bearer ${env.TMDB_API_READ_ACCESS_TOKEN}` } : {} })
  }
  return { id: 'tmdb', types: ['movie', 'tv'], enabled: Boolean(env.TMDB_API_READ_ACCESS_TOKEN || env.TMDB_API_KEY),
    async search(query, type) {
      const data = await request<{ results?: Entry[] }>(`search/${type}`, { query, include_adult: 'false', page: '1' })
      return (data.results || []).slice(0, 8).filter(entry => entry.id && (entry.title || entry.name)).map(entry => ({
        ...candidate('tmdb', type, `${type}:${entry.id}`, (entry.title || entry.name)!, `https://www.themoviedb.org/${type}/${entry.id}`),
        aliases: unique([entry.title, entry.name, entry.original_title, entry.original_name]),
        coverUrl: entry.poster_path ? safeURL(`https://image.tmdb.org/t/p/w500${entry.poster_path}`) : undefined,
        releaseDate: releaseDate(entry.release_date || entry.first_air_date), description: entry.overview || undefined,
      }))
    },
    async resolve(work) {
      const id = work.externalId.split(':')[1]
      const data = await request<Details>(`${work.type}/${encodeURIComponent(id)}`, { append_to_response: 'credits' })
      return { ...work, creators: unique([...(data.created_by || []).map(x => x.name), ...(data.credits?.crew || []).filter(x => x.job === 'Director').map(x => x.name)]) }
    },
  }
}
