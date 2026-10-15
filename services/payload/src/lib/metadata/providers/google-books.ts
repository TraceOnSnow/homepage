import type { MetadataEnvironment, ProviderAdapter } from '../types'
import type { HTTP } from '../http'
import { candidate, releaseDate, safeURL, unique, plainText } from '../normalize'

type Volume = { id: string; volumeInfo?: { title?: string; subtitle?: string; authors?: string[]; publishedDate?: string; description?: string; canonicalVolumeLink?: string; imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }
export function googleBooksProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  return { id: 'google-books', types: ['book', 'comic'], enabled: true,
    async search(query, type) {
      const isbn = query.replace(/[-\s]/g, '')
      const url = new URL('https://www.googleapis.com/books/v1/volumes')
      url.search = new URLSearchParams({ q: /^(?:97[89])?\d{9}[\dX]$/i.test(isbn) ? `isbn:${isbn}` : query, maxResults: '8', printType: 'books' }).toString()
      if (env.GOOGLE_BOOKS_API_KEY) url.searchParams.set('key', env.GOOGLE_BOOKS_API_KEY)
      const data = await http.json<{ items?: Volume[] }>(url)
      return (data.items || []).filter(book => book.id && book.volumeInfo?.title).map(book => {
        const info = book.volumeInfo!
        return { ...candidate('google-books', type, book.id, info.title!, info.canonicalVolumeLink || `https://books.google.com/books?id=${encodeURIComponent(book.id)}`),
          aliases: unique([info.title, info.subtitle]), creators: unique(info.authors || []), releaseDate: releaseDate(info.publishedDate),
          description: plainText(info.description), coverUrl: safeURL(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail) }
      })
    },
  }
}
