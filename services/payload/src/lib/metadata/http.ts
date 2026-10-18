import { Agent, type Dispatcher } from 'undici'
import { metadataContext, writeMetadataDiagnostic, type MetadataDiagnostic, type MetadataLogger } from './diagnostics'

// Server-only transport. Never return upstream URLs or response bodies in errors.
// This endpoint times out with Node's address-family auto-selection on some networks.
// Use a pooled IPv4 connection only for WeRead, retaining TLS verification.
const wereadAgent = new Agent({ connect: { family: 4 }, autoSelectFamily: false })
export class ProviderError extends Error {
  constructor(readonly status: number, readonly retryAfter = 60_000) { super('Provider request failed') }
}
export class UpgradeRequired extends Error {}
export function createHTTP(fetcher: typeof fetch = fetch, logger: MetadataLogger = writeMetadataDiagnostic) {
  async function read<T>(format: 'json' | 'text', url: string | URL, init?: RequestInit): Promise<T> {
    const started = performance.now()
    const context = metadataContext()
    let status: number | null = null
    let phase: 'headers' | 'body' = 'headers'
    let cfRay: string | null = null
    let cfCacheStatus: string | null = null
    let retryAfterMs: number | null = null
    const record = (outcome: 'ok' | 'error', error?: unknown) => {
      const errorCategory: MetadataDiagnostic['errorCategory'] = outcome === 'ok' ? null
        : error instanceof ProviderError ? 'http'
        : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout'
        : error instanceof SyntaxError ? 'invalid-response'
        : error instanceof TypeError ? 'network' : 'other'
      try {
        logger({ ...context, event: 'metadata-upstream', outcome,
          elapsedMs: Math.round(performance.now() - started), status, phase, errorCategory, cfRay, cfCacheStatus, retryAfterMs })
      } catch { /* Logging must never change provider results. */ }
    }
    const options: RequestInit & { dispatcher?: Dispatcher } = { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) }
    if (new URL(url).hostname === 'i.weread.qq.com') options.dispatcher = wereadAgent
    try {
      const response = await fetcher(url, options)
      status = response.status
      const ray = response.headers.get('cf-ray') || ''
      cfRay = /^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/i.test(ray) ? ray : null
      const cache = response.headers.get('cf-cache-status') || ''
      cfCacheStatus = ['HIT', 'MISS', 'STALE', 'DYNAMIC', 'EXPIRED', 'REVALIDATED', 'BYPASS', 'UPDATING', 'NONE'].includes(cache) ? cache : null
      const retry = response.headers.get('retry-after')
      const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60_000
      const boundedDelay = Number.isFinite(delay) ? Math.max(1000, Math.min(delay, 3_600_000)) : 60_000
      retryAfterMs = retry && Number.isFinite(delay) ? boundedDelay : null
      if (!response.ok || response.status === 202) {
        await response.body?.cancel().catch(() => undefined)
        throw new ProviderError(response.status, boundedDelay)
      }
      phase = 'body'
      const data = format === 'json' ? await response.json() : await response.text()
      record('ok')
      return data as T
    } catch (error) {
      record('error', error)
      throw error
    }
  }
  return {
    json<T>(url: string | URL, init?: RequestInit): Promise<T> { return read<T>('json', url, init) },
    text(url: string | URL, init?: RequestInit): Promise<string> { return read<string>('text', url, init) },
  }
}
export type HTTP = ReturnType<typeof createHTTP>
export const userAgent = 'TraceOnSnow/1.0 (https://traceonsnow.com)'
