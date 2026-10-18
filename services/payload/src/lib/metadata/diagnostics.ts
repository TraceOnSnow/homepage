import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Provider } from './types'

type Context = { requestId: string; provider: Provider | 'unknown'; operation: 'search' | 'details' | 'unknown' }
export type MetadataDiagnostic = Context & {
  event: 'metadata-upstream'
  outcome: 'ok' | 'error'
  elapsedMs: number
  status: number | null
  phase: 'headers' | 'body'
  errorCategory: 'http' | 'timeout' | 'network' | 'invalid-response' | 'other' | null
  cfRay: string | null
  cfCacheStatus: string | null
  retryAfterMs: number | null
}
export type MetadataLogger = (record: MetadataDiagnostic) => void
const context = new AsyncLocalStorage<Context>()

export function withMetadataContext<T>(provider: Provider, operation: 'search' | 'details', callback: () => T): T {
  return context.run({ provider, operation, requestId: randomUUID() }, callback)
}

export function metadataContext(): Context {
  return context.getStore() || { requestId: randomUUID(), provider: 'unknown', operation: 'unknown' }
}

// A closed record shape: never pass URLs, request bodies, headers, errors or candidates here.
export const writeMetadataDiagnostic: MetadataLogger = record => {
  const line = JSON.stringify(record)
  if (record.outcome === 'error') console.warn(line)
  else console.info(line)
}
