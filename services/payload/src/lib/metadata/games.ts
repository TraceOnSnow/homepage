// Compatibility entry point for callers of the original game slice.
import { createMetadataService } from './search'
import type { MetadataEnvironment } from './types'
export function createGameSearch(env: MetadataEnvironment, fetcher: typeof fetch = fetch) {
  const service = createMetadataService(env, fetcher)
  return (query: string) => service.search('game', query)
}
