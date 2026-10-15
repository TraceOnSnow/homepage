import type { MetadataEnvironment, ProviderAdapter } from '../types'
import { userAgent, type HTTP } from '../http'
import { candidate, releaseDate, safeURL, unique } from '../normalize'

type Subject = { id: number; name?: string; name_cn?: string; date?: string; summary?: string; images?: { large?: string; common?: string }; infobox?: { key: string; value?: string | { v?: string }[] }[] }
const creators = (subject: Subject) => unique((subject.infobox || []).filter(x => ['导演', '作者', '原作', '作画', '动画制作', '制作公司'].includes(x.key)).flatMap(x => typeof x.value === 'string' ? [x.value] : (x.value || []).map(v => v.v)))
export function bangumiProvider(env: MetadataEnvironment, http: HTTP): ProviderAdapter {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': userAgent, ...(env.BANGUMI_ACCESS_TOKEN ? { Authorization: `Bearer ${env.BANGUMI_ACCESS_TOKEN}` } : {}) }
  return { id: 'bangumi', types: ['anime', 'manga'], enabled: true,
    async search(query, type) {
      const data = await http.json<{ data?: Subject[] }>('https://api.bgm.tv/v0/search/subjects?limit=8', {
        method: 'POST', headers, body: JSON.stringify({ keyword: query, sort: 'match', filter: { type: [type === 'anime' ? 2 : 1], nsfw: false } }),
      })
      return (data.data || []).filter(subject => subject.id && (subject.name_cn || subject.name)).map(subject => ({
        ...candidate('bangumi', type, String(subject.id), (subject.name_cn || subject.name)!, `https://bgm.tv/subject/${subject.id}`),
        aliases: unique([subject.name_cn, subject.name]), creators: creators(subject), coverUrl: safeURL(subject.images?.large || subject.images?.common), releaseDate: releaseDate(subject.date), description: subject.summary || undefined,
      }))
    },
    async resolve(work) {
      const subject = await http.json<Subject>(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(work.externalId)}`, { headers })
      return { ...work, creators: creators(subject), description: subject.summary || work.description, releaseDate: releaseDate(subject.date) || work.releaseDate }
    },
  }
}
