import type { MetadataCandidate, Provider, WorkType } from './types'
export const unique = (items: (string | null | undefined)[]) => [...new Set(items.filter((x): x is string => Boolean(x?.trim())).map(x => x.trim()))]
export function safeURL(value?: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
// Date-only CMS field: do not invent a day for sources that only provide a year/month.
export function releaseDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return undefined
  const day = value.slice(0, 10)
  const date = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(day) ? date.toISOString() : undefined
}
export const plainText = (value?: string | null) => value?.replace(/<[^>]*>/g, '').trim() || undefined
export function candidate(provider: Provider, type: WorkType, externalId: string, title: string, url?: string): MetadataCandidate {
  return { provider, type, externalId, title, aliases: [title], creators: [], platforms: [], source: { provider, externalId, url: safeURL(url), fetchedAt: new Date().toISOString() } }
}
