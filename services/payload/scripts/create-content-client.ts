// Operator provisioning only. Normal tools use the standard REST API, never this script.
import { randomBytes } from 'node:crypto'
import { open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config'

const [name, output, origin] = process.argv.slice(2)
if (!name || !output || !origin) throw Error('Usage: node --import tsx scripts/create-content-client.ts NAME NEW_PRIVATE_ENV HTTPS_ORIGIN')
const url = new URL(origin)
if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw Error('Use an HTTPS origin, or loopback HTTP')
const target = path.resolve(output)
const file = await open(target, 'wx', 0o600)
let payload: Awaited<ReturnType<typeof getPayload>> | undefined
let id: number | undefined
try {
  payload = await getPayload({ config })
  if ((await payload.find({ collection: 'content-clients', where: { name: { equals: name } }, limit: 1 })).totalDocs) throw Error('Client name already exists; inspect it before provisioning again')
  const apiKey = randomBytes(32).toString('hex')
  await file.writeFile(`HOMEPAGE_URL=${url.origin}\nHOMEPAGE_API_KEY=${apiKey}\n`)
  const client = await payload.create({ collection: 'content-clients', data: { name, apiKey } })
  id = client.id
  console.log(JSON.stringify({ id, name, credentials: target, secretPrinted: false }))
} catch (error) {
  if (id === undefined) await unlink(target)
  throw error
} finally { await file.close(); await payload?.destroy() }
