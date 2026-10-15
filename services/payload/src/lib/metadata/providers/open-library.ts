import type { ProviderAdapter } from '../types'
import { userAgent, type HTTP } from '../http'
import { candidate, safeURL, plainText, unique } from '../normalize'

type Book = { key: string; title: string; author_name?: string[]; cover_i?: number }
export function openLibraryProvider(http: HTTP): ProviderAdapter {
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' }
  return { id: 'open-library', types: ['book', 'comic'], enabled: true,
    async search(query, type) {
      const url = new URL('https://openlibrary.org/search.json')
      const isbn = query.replace(/[-\s]/g, '')
      url.search = new URLSearchParams({ limit: '8', fields: 'key,title,author_name,cover_i', ...(/^(?:97[89])?\d{9}[\dX]$/i.test(isbn) ? { isbn } : /[\u3400-\u9fff]/.test(query) && [...query].length < 3 ? { title: query } : { q: query }) }).toString()
      const data = await http.json<{ docs?: Book[] }>(url, { headers })
      return (data.docs || []).filter(book => book.title && /^(?:\/works\/)?OL\d+W$/.test(book.key)).map(book => {
        const id = book.key.replace('/works/', '')
        return { ...candidate('open-library', type, id, book.title, `https://openlibrary.org/works/${id}`), creators: unique(book.author_name || []), coverUrl: book.cover_i ? safeURL(`https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`) : undefined }
      })
    },
    async resolve(book) {
      const data = await http.json<{ description?: string | { value?: string } }>(`https://openlibrary.org/works/${encodeURIComponent(book.externalId)}.json`, { headers })
      return { ...book, description: plainText(typeof data.description === 'string' ? data.description : data.description?.value) }
    },
  }
}
