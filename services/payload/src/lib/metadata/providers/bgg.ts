import { XMLParser } from 'fast-xml-parser'
import type { MetadataEnvironment, ProviderAdapter } from '../types'
import { ProviderError, userAgent, type HTTP } from '../http'
import { candidate, plainText, safeURL, unique } from '../normalize'

type Item = { '@_id': string; name?: { '@_type'?: string; '@_value'?: string }[]; image?: string; thumbnail?: string; description?: string; link?: { '@_type'?: string; '@_value'?: string }[] }
const parser = new XMLParser({ ignoreAttributes: false, parseAttributeValue: false, parseTagValue: false, isArray: name => ['item', 'name', 'link'].includes(name) })
export function bggProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  const headers = { Authorization: `Bearer ${env.BGG_API_TOKEN}`, 'User-Agent': userAgent, Accept: 'application/xml' }
  // BGG throttles closely spaced requests. Serialize requests per application instance.
  let queue: Promise<unknown> = Promise.resolve()
  let lastRequest = 0
  async function request(path: string, params: Record<string, string>): Promise<Item[]> {
    const operation = queue.then(async () => {
      const delay = Math.max(0, lastRequest + 5000 - Date.now())
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      lastRequest = Date.now()
      const url = new URL(`https://boardgamegeek.com/xmlapi2/${path}`)
      url.search = new URLSearchParams(params).toString()
      const xml = await http.text(url, { headers })
      if (xml.length > 2_000_000 || /<!DOCTYPE/i.test(xml)) throw new ProviderError(502)
      const data = parser.parse(xml) as { items?: { item?: Item[] } }
      if (!data.items) throw new ProviderError(502)
      return data.items.item || []
    })
    queue = operation.catch(() => undefined)
    return operation
  }
  return { id: 'bgg', types: ['boardgame'], enabled: Boolean(env.BGG_API_TOKEN),
    async search(query) {
      const items = await request('search', { query, type: 'boardgame' })
      return items.filter(item => /^\d+$/.test(item['@_id'])).slice(0, 8).flatMap(item => {
        const names = unique((item.name || []).map(name => name['@_value']))
        const title = item.name?.find(name => name['@_type'] === 'primary')?.['@_value'] || names[0]
        return title ? [{ ...candidate('bgg', 'boardgame', item['@_id'], title, `https://boardgamegeek.com/boardgame/${item['@_id']}`), aliases: names }] : []
      })
    },
    async resolve(work) {
      const item = (await request('thing', { id: work.externalId, type: 'boardgame' })).find(item => item['@_id'] === work.externalId)
      if (!item) throw new ProviderError(502)
      return { ...work, aliases: unique([work.title, ...(item.name || []).map(name => name['@_value'])]),
        coverUrl: safeURL(item.image || item.thumbnail), description: plainText(item.description),
        creators: unique((item.link || []).filter(link => link['@_type'] === 'boardgamedesigner').map(link => link['@_value'])) }
    },
  }
}
