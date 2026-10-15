export const workTypes = ['game', 'anime', 'book', 'movie', 'tv', 'manga', 'comic', 'boardgame'] as const
export type WorkType = typeof workTypes[number]
export type Provider = 'igdb' | 'rawg' | 'google-books' | 'open-library' | 'tmdb' | 'bangumi' | 'bgg' | 'weread'
export type Source = { provider: string; externalId: string; url?: string; fetchedAt?: string }
export type MetadataCandidate = {
  provider: Provider
  type: WorkType
  externalId: string
  title: string
  aliases: string[]
  coverUrl?: string
  releaseDate?: string
  creators: string[]
  platforms: string[]
  description?: string
  source: Source
}
export type GameCandidate = MetadataCandidate
export type ProviderState = 'ok' | 'unavailable' | 'error' | 'rate-limited' | 'upgrade-required'
export type SearchResult = {
  candidates: MetadataCandidate[]
  providers: { provider: Provider; state: ProviderState; message?: string }[]
}
export type MetadataEnvironment = {
  IGDB_CLIENT_ID?: string; IGDB_CLIENT_SECRET?: string; RAWG_API_KEY?: string
  GOOGLE_BOOKS_API_KEY?: string; TMDB_API_READ_ACCESS_TOKEN?: string; TMDB_API_KEY?: string
  BANGUMI_ACCESS_TOKEN?: string; BGG_API_TOKEN?: string; WEREAD_API_KEY?: string
}
export type ProviderAdapter = {
  id: Provider
  types: readonly WorkType[]
  enabled: boolean
  search(query: string, type: WorkType): Promise<MetadataCandidate[]>
  resolve?(candidate: MetadataCandidate): Promise<MetadataCandidate>
}
