import { createHTTP, ProviderError, UpgradeRequired } from './http'
import type { MetadataCandidate, MetadataEnvironment, Provider, ProviderAdapter, ProviderState, SearchResult, WorkType } from './types'
import { igdbProvider } from './providers/igdb'
import { rawgProvider } from './providers/rawg'
import { googleBooksProvider } from './providers/google-books'
import { openLibraryProvider } from './providers/open-library'
import { tmdbProvider } from './providers/tmdb'
import { bangumiProvider } from './providers/bangumi'
import { bggProvider } from './providers/bgg'
import { wereadProvider } from './providers/weread'

const failureState = (error: unknown): ProviderState => error instanceof UpgradeRequired ? 'upgrade-required' : error instanceof ProviderError && [429, 202].includes(error.status) ? 'rate-limited' : 'error'
export function createMetadataService(env: MetadataEnvironment, fetcher: typeof fetch = fetch) {
  const http = createHTTP(fetcher)
  const adapters: ProviderAdapter[] = [igdbProvider(env, http), rawgProvider(env, http), googleBooksProvider(env, http), openLibraryProvider(http), tmdbProvider(env, http), bangumiProvider(env, http), bggProvider(env, http), wereadProvider(env, http)]
  const cache = new Map<string, { expires: number; candidates: MetadataCandidate[] }>()
  const pending = new Map<string, Promise<MetadataCandidate[]>>()
  const cooldown = new Map<Provider, number>()
  const queryText = (input: string) => {
    const query = input.normalize('NFKC').trim()
    if (query.length < 2 || query.length > 100) throw new Error('Search requires 2–100 characters')
    return query
  }
  function recordFailure(adapter: ProviderAdapter, error: unknown) {
    if (error instanceof UpgradeRequired) cooldown.set(adapter.id, Infinity)
    if (error instanceof ProviderError && [429, 202].includes(error.status)) cooldown.set(adapter.id, Date.now() + error.retryAfter)
  }
  async function cached(adapter: ProviderAdapter, type: WorkType, query: string) {
    const key = `${adapter.id}:${type}:${query.toLowerCase()}`
    if (cooldown.get(adapter.id) === Infinity) throw new UpgradeRequired()
    const hit = cache.get(key)
    if (hit && hit.expires > Date.now()) return hit.candidates
    if ((cooldown.get(adapter.id) || 0) > Date.now()) throw new ProviderError(429)
    if (pending.has(key)) return pending.get(key)!
    if (pending.size >= 32) throw new ProviderError(429, 1000)
    const request = adapter.search(query, type).then(candidates => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!)
      cache.set(key, { expires: Date.now() + 300_000, candidates })
      return candidates
    }).catch(error => { recordFailure(adapter, error); throw error }).finally(() => { pending.delete(key) })
    pending.set(key, request)
    return request
  }
  return {
    async search(type: WorkType, input: string): Promise<SearchResult> {
      const query = queryText(input)
      const sources = adapters.filter(adapter => adapter.types.includes(type))
      const settled = await Promise.allSettled(sources.map(adapter => adapter.enabled ? cached(adapter, type, query) : Promise.resolve([])))
      const result: SearchResult = { candidates: [], providers: [] }
      settled.forEach((response, index) => {
        const adapter = sources[index]
        if (!adapter.enabled) result.providers.push({ provider: adapter.id, state: 'unavailable' })
        else if (response.status === 'fulfilled') {
          result.candidates.push(...response.value)
          result.providers.push({ provider: adapter.id, state: 'ok' })
        } else result.providers.push({ provider: adapter.id, state: failureState(response.reason) })
      })
      return result
    },
    async resolve(type: WorkType, input: string, provider: string, externalId: string) {
      const adapter = adapters.find(adapter => adapter.id === provider && adapter.types.includes(type) && adapter.enabled)
      if (!adapter) throw new Error('Unsupported provider')
      // Resolve only a server-issued search result. Never fetch a client-provided URL.
      const candidates = await cached(adapter, type, queryText(input))
      const candidate = candidates.find(item => item.externalId === externalId && item.type === type)
      if (!candidate) throw new Error('Candidate not found')
      if (!adapter.resolve) return { candidate, state: 'ok' as ProviderState }
      try {
        if ((cooldown.get(adapter.id) || 0) > Date.now()) throw new ProviderError(429)
        return { candidate: await adapter.resolve(candidate), state: 'ok' as ProviderState }
      } catch (error) {
        recordFailure(adapter, error)
        return { candidate, state: failureState(error) }
      }
    },
  }
}
