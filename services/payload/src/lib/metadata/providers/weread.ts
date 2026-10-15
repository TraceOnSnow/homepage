// API contract: Tencent/WeChatReading, skills/SKILL.md + search.md + book.md, v1.0.5.
import type { MetadataEnvironment, MetadataCandidate, ProviderAdapter } from '../types'
import { ProviderError, UpgradeRequired, type HTTP } from '../http'
import { candidate, plainText, releaseDate, safeURL, unique } from '../normalize'

type Book = { bookId: string; title: string; author?: string; cover?: string; intro?: string; publishTime?: string; readerLink?: string; deepLink?: string }
type Envelope = { errcode?: number; upgrade_info?: unknown; data?: unknown }
export function wereadProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  async function call<T>(api_name: string, params: Record<string, string | number>): Promise<T> {
    const result = await http.json<Envelope>('https://i.weread.qq.com/api/agent/gateway', {
      method: 'POST', headers: { Authorization: `Bearer ${env.WEREAD_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_name, skill_version: '1.0.5', ...params }),
    })
    if (result.upgrade_info) throw new UpgradeRequired('Provider contract needs an update')
    if (result.errcode) throw new ProviderError(502)
    // Gateway may return the trimmed payload directly or wrap it in data.
    return (result.data ?? result) as T
  }
  function normalize(book: Book): MetadataCandidate {
    return { ...candidate('weread', 'book', String(book.bookId), book.title, safeURL(book.readerLink) || safeURL(book.deepLink)), aliases: [book.title], creators: unique([book.author]), coverUrl: safeURL(book.cover), description: plainText(book.intro), releaseDate: releaseDate(book.publishTime) }
  }
  return { id: 'weread', types: ['book'], enabled: Boolean(env.WEREAD_API_KEY),
    async search(query) {
      const data = await call<{ results?: { books?: { bookInfo?: Book }[] }[] }>('/store/search', { keyword: query, scope: 10, maxIdx: 0 })
      return (data.results || []).flatMap(group => group.books || []).map(item => item.bookInfo).filter((book): book is Book => Boolean(book?.bookId && book?.title)).slice(0, 8).map(normalize)
    },
    async resolve(work) {
      const book = await call<Book>('/book/info', { bookId: work.externalId })
      if (!book.bookId || !book.title || String(book.bookId) !== work.externalId) throw new ProviderError(502)
      const full = normalize(book)
      return { ...work, ...full, source: { ...work.source, ...full.source, url: full.source.url || work.source.url } }
    },
  }
}
