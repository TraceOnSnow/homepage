import { slugify } from '../slug'
import type { MetadataCandidate, Source } from './types'

export function metadataPatch(candidate: MetadataCandidate, current: { slug?: string; sources?: Source[] }) {
  const sources = (current.sources || []).filter(source => source.provider !== candidate.provider)
  return {
    title: candidate.title,
    slug: current.slug || slugify(candidate.title),
    generateSlug: false,
    aliases: candidate.aliases,
    coverUrl: candidate.coverUrl || '',
    releaseDate: candidate.releaseDate || null,
    creators: candidate.creators, platforms: candidate.platforms,
    description: candidate.description || '',
    sources: [...sources, candidate.source],
  }
}
