import 'dotenv/config'
import { createMetadataService } from '../src/lib/metadata/search'
import type { MetadataEnvironment, WorkType } from '../src/lib/metadata/types'

const service = createMetadataService(process.env as MetadataEnvironment)
const queries: [WorkType, string][] = [['game', 'TUNIC'], ['book', '三体'], ['movie', 'Interstellar'], ['anime', '葬送的芙莉莲'], ['boardgame', 'Catan']]
let failed = false
for (const [type, query] of queries) {
  const result = await service.search(type, query)
  for (const provider of result.providers) {
    const candidates = result.candidates.filter(candidate => candidate.provider === provider.provider)
    const candidate = candidates.find(candidate => candidate.title.toLowerCase() === query.toLowerCase()) ?? candidates[0]
    const details = candidate ? await service.resolve(type, query, candidate.provider, candidate.externalId) : undefined
    const outcome = { provider: provider.provider, state: provider.state, candidates: result.candidates.filter(candidate => candidate.provider === provider.provider).length, details: details?.state ?? 'not-requested' }
    console.log(JSON.stringify(outcome))
    if (provider.state !== 'unavailable' && (provider.state !== 'ok' || details && details.state !== 'ok')) failed = true
  }
}
process.exitCode = failed ? 1 : 0
