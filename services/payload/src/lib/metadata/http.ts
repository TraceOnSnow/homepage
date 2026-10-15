import { Agent, type Dispatcher } from 'undici'

// Server-only transport. Never return upstream URLs or response bodies in errors.
// This endpoint times out with Node's address-family auto-selection on some networks.
// Use a pooled IPv4 connection only for WeRead, retaining TLS verification.
const wereadAgent = new Agent({ connect: { family: 4 }, autoSelectFamily: false })
export class ProviderError extends Error {
  constructor(readonly status: number, readonly retryAfter = 60_000) { super('Provider request failed') }
}
export class UpgradeRequired extends Error {}
export function createHTTP(fetcher: typeof fetch = fetch) {
  async function response(url: string | URL, init?: RequestInit) {
    const options: RequestInit & { dispatcher?: Dispatcher } = { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8_000) }
    if (new URL(url).hostname === 'i.weread.qq.com') options.dispatcher = wereadAgent
    const response = await fetcher(url, options)
    if (!response.ok || response.status === 202) {
      const retry = response.headers.get('retry-after')
      const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 60_000
      throw new ProviderError(response.status, Number.isFinite(delay) ? Math.max(1000, Math.min(delay, 3_600_000)) : 60_000)
    }
    return response
  }
  return {
    async json<T>(url: string | URL, init?: RequestInit): Promise<T> { return (await response(url, init)).json() as Promise<T> },
    async text(url: string | URL, init?: RequestInit): Promise<string> { return (await response(url, init)).text() },
  }
}
export type HTTP = ReturnType<typeof createHTTP>
export const userAgent = 'TraceOnSnow/1.0 (https://traceonsnow.com)'
