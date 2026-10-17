import { timingSafeEqual } from 'node:crypto'
import type { Endpoint, PayloadRequest, Where } from 'payload'
import { metadataService } from './metadata/endpoint'
import { workTypes, type WorkType } from './metadata/types'

const headers = { 'Cache-Control': 'private, no-store' }
const maxBytes = 256 * 1024
const textFields = ['title', 'slug', 'coverUrl', 'releaseDate', 'description', 'status', 'note', 'visibility']
const stringArrays = ['aliases', 'creators', 'platforms', 'tags']
const sourceFields = ['id', 'provider', 'externalId', 'url', 'fetchedAt']
const experienceFields = ['id', 'status', 'startedOn', 'endedOn', 'platform', 'progress', 'note']
const dataFields = [...textFields, ...stringArrays, 'type', 'generateSlug', 'cover', 'article', 'rating', 'sources', 'experiences']
let mutationQueue: Promise<void> = Promise.resolve()
// Serialize Agent mutations within this process. The timestamp Where below also
// detects already-committed admin edits; Payload itself does not promise a SQL CAS.
async function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueue
  let release = () => {}
  mutationQueue = new Promise<void>(resolve => { release = resolve })
  await previous
  try { return await operation() } finally { release() }
}
class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}
type RecordValue = Record<string, unknown>
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected an object')
  return value as RecordValue
}
function keys(value: RecordValue, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new InputError('Unknown field')
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError('Invalid text')
  return value
}
function identifier(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isSafeInteger(number) || number < 1) throw new InputError('Invalid work ID')
  return number
}
function integer(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) throw new InputError('Invalid pagination')
  return value as number
}
function type(value: unknown): WorkType {
  if (!workTypes.includes(value as WorkType)) throw new InputError('Invalid work type')
  return value as WorkType
}
function data(value: unknown): RecordValue {
  const result = object(value)
  keys(result, dataFields)
  if (!Object.keys(result).length) throw new InputError('Empty patch')
  for (const field of textFields) {
    if (field in result && result[field] !== null && typeof result[field] !== 'string') throw new InputError('Invalid text field')
  }
  if ('type' in result) type(result.type)
  if ('generateSlug' in result && typeof result.generateSlug !== 'boolean') throw new InputError('Invalid slug option')
  if ('rating' in result && result.rating !== null && (typeof result.rating !== 'number' || !Number.isFinite(result.rating))) throw new InputError('Invalid rating')
  for (const field of ['cover', 'article']) if (field in result && result[field] !== null) identifier(result[field])
  for (const field of stringArrays) {
    if (field in result && result[field] !== null && (!Array.isArray(result[field]) || !(result[field] as unknown[]).every(value => typeof value === 'string'))) throw new InputError('Invalid text array')
  }
  for (const [field, allowed] of [['sources', sourceFields], ['experiences', experienceFields]] as const) {
    if (!(field in result) || result[field] === null) continue
    if (!Array.isArray(result[field]) || result[field].length > 500) throw new InputError('Invalid record array')
    for (const entry of result[field]) {
      const item = object(entry)
      keys(item, [...allowed])
      if (Object.values(item).some(value => value !== null && typeof value !== 'string')) throw new InputError('Invalid array field')
    }
  }
  return result
}
async function readBody(req: PayloadRequest): Promise<RecordValue> {
  const declared = req.headers.get('content-length')
  if (declared && Number(declared) > maxBytes) throw new InputError('Request too large', 413)
  if (!req.body) throw new InputError('JSON body required')
  const reader = req.body.getReader()
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw new InputError('Request too large', 413) }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
  catch (error) { if (error instanceof InputError) throw error; throw new InputError('Invalid JSON') }
}

// This capability never creates a Payload administrator session. The only collection
// passed to Local API is Works; normal field validation/hooks still run.
export const libraryAgentEndpoint: Endpoint = {
  path: '/library-agent', method: 'post',
  handler: async req => {
    const secret = process.env.LIBRARY_AGENT_TOKEN || ''
    const authorization = req.headers.get('authorization') || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    const expected = Buffer.from(secret)
    const actual = Buffer.from(token)
    if (secret.length < 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return Response.json({ error: 'Library authentication required' }, { status: 401, headers })
    }
    try {
      const input = await readBody(req)
      const action = input.action
      const payload = req.payload
      let result: unknown
      if (action === 'list') {
        keys(input, ['action', 'page', 'limit', 'q', 'slug', 'provider', 'externalId'])
        const and: Where[] = []
        if (input.q !== undefined) and.push({ title: { contains: text(input.q) } })
        if (input.slug !== undefined) and.push({ slug: { equals: text(input.slug) } })
        if ((input.provider === undefined) !== (input.externalId === undefined)) throw new InputError('Provider and external ID are required together')
        if (input.provider !== undefined) {
          and.push({ 'sources.provider': { equals: text(input.provider, 100) } }, { 'sources.externalId': { equals: text(input.externalId, 150) } })
        }
        result = await payload.find({ collection: 'works', overrideAccess: true, depth: 0, sort: 'id', page: integer(input.page, 1, 1_000_000), limit: integer(input.limit, 25, 100), where: and.length ? { and } : undefined })
      } else if (action === 'get') {
        keys(input, ['action', 'id'])
        result = await payload.findByID({ collection: 'works', id: identifier(input.id), overrideAccess: true, depth: 0 })
      } else if (action === 'create') {
        keys(input, ['action', 'data'])
        const patch = data(input.data)
        const visibility = patch.visibility === undefined ? 'private' : patch.visibility
        if (visibility !== 'public' && visibility !== 'private') throw new InputError('Work validation failed', 422)
        result = await payload.create({ collection: 'works', overrideAccess: true, depth: 0, data: {
          status: null, ...patch, visibility, slug: typeof patch.slug === 'string' ? patch.slug : '',
          title: text(patch.title, 1000), type: type(patch.type),
        } })
      } else if (action === 'update' || action === 'delete') {
        keys(input, action === 'update' ? ['action', 'id', 'expectedUpdatedAt', 'data'] : ['action', 'id', 'expectedUpdatedAt'])
        const id = identifier(input.id)
        const version = text(input.expectedUpdatedAt, 40)
        if (!Number.isFinite(Date.parse(version))) throw new InputError('Invalid expectedUpdatedAt')
        const where: Where = { and: [{ id: { equals: id } }, { updatedAt: { equals: version } }] }
        const patch = action === 'update' ? data(input.data) : undefined
        result = await mutate(async () => {
          const changed = action === 'update'
            ? await payload.update({ collection: 'works', overrideAccess: true, depth: 0, where, limit: 1, data: patch! })
            : await payload.delete({ collection: 'works', overrideAccess: true, depth: 0, where })
          if (changed.errors.length) throw new InputError('Work validation failed', 422)
          if (changed.docs.length !== 1) throw new InputError('Work changed or no longer exists; read it again', 409)
          return action === 'update' ? changed.docs[0] : { deleted: true, id }
        })
      } else if (action === 'metadata-search' || action === 'metadata-details') {
        keys(input, action === 'metadata-search' ? ['action', 'type', 'q'] : ['action', 'type', 'q', 'provider', 'id'])
        const workType = type(input.type)
        const query = text(input.q, 100).normalize('NFKC').trim()
        if (query.length < 2) throw new InputError('Search requires 2–100 characters')
        try {
          result = action === 'metadata-search'
            ? await metadataService.search(workType, query)
            : await metadataService.resolve(workType, query, text(input.provider, 100), text(input.id, 150))
        } catch (error) {
          if (error instanceof Error && ['Unsupported provider', 'Candidate not found'].includes(error.message)) throw new InputError('Invalid metadata candidate')
          throw error
        }
      } else throw new InputError('Unknown action')
      return Response.json(result, { headers })
    } catch (error) {
      if (error instanceof InputError) return Response.json({ error: error.message }, { status: error.status, headers })
      const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
      if (status === 404) return Response.json({ error: 'Work not found' }, { status: 404, headers })
      if (status === 400 || status === 422) return Response.json({ error: 'Work validation failed' }, { status: 422, headers })
      return Response.json({ error: 'Library operation failed' }, { status: 500, headers })
    }
  },
}
