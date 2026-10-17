// Isolated HTTP harness for the real endpoint + Payload database, without a Next compiler.
// Bind loopback only. DATABASE_URL and MEDIA_DIR must be explicitly provided by the caller.
import { createServer } from 'node:http'
import { getPayload, type PayloadRequest } from 'payload'
import config from '../../src/payload.config'
import { libraryAgentEndpoint } from '../../src/lib/library-agent'
import { contentEndpoint } from '../../src/lib/content-endpoint'

if (!process.env.DATABASE_URL || !process.env.MEDIA_DIR || !process.env.LIBRARY_AGENT_TOKEN) throw Error('Explicit isolated data paths and token required')
const payload = await getPayload({ config })
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', 'http://127.0.0.1')
    const headers = new Headers()
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value)
    let response: Response
    if (incoming.method === 'POST' && url.pathname === '/api/library-agent') {
      const parts: Buffer[] = []
      let size = 0
      for await (const part of incoming) {
        size += part.length
        if (size > 262144) throw Error('Request too large')
        parts.push(part)
      }
      const request = new Request(url, { method: 'POST', headers, body: Buffer.concat(parts) })
      response = await libraryAgentEndpoint.handler(Object.assign(request, { payload }) as PayloadRequest)
    } else if (incoming.method === 'GET' && url.pathname === '/api/works') {
      response = Response.json(await payload.find({ collection: 'works', overrideAccess: false, user: null, depth: 1, limit: 100, page: Number(url.searchParams.get('page') || '1'), sort: 'slug' }))
    } else if (incoming.method === 'GET' && url.pathname === '/api/content/posts') {
      response = await contentEndpoint.handler(Object.assign(new Request(url, { headers }), { payload }) as PayloadRequest)
    } else response = Response.json({ error: 'Not found' }, { status: 404 })
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    outgoing.writeHead(500, { 'Content-Type': 'application/json' })
    outgoing.end(JSON.stringify({ error: 'Harness request failed' }))
  }
})
server.listen(Number(process.env.AGENT_TEST_PORT || '3310'), '127.0.0.1', () => console.log('AGENT_HTTP_READY'))
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await payload.destroy()
}
process.on('SIGTERM', () => { void stop() })
process.on('SIGINT', () => { void stop() })
